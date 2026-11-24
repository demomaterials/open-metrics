"""External PostgreSQL sources: introspection and safe, parameterised metric queries.

Safety model
  * Every session is opened read-only (default_transaction_read_only=on) with a
    statement timeout, and the transaction is always rolled back.
  * No user-supplied SQL is ever executed. Schema/table/column names are first
    checked against information_schema (which only lists objects the source
    user may access), then quoted with psycopg.sql.Identifier. Values are bound
    parameters.
"""
from __future__ import annotations

import re
from contextlib import contextmanager
from dataclasses import dataclass
from datetime import date, datetime, timedelta

import psycopg
from psycopg import sql

from ..config import get_settings
from ..crypto import decrypt
from ..models import DataSource, Metric

NUMERIC_TYPES = {"smallint", "integer", "bigint", "numeric", "real", "double precision", "decimal"}
DATE_TYPES = {"date", "timestamp without time zone", "timestamp with time zone"}
TEXT_TYPES = {"text", "character varying", "character", "varchar", "char", "citext"}
AGGREGATIONS = {
    "sum": "sum(v)",
    "avg": "avg(v)",
    "min": "min(v)",
    "max": "max(v)",
    "count": "count(v)",
    "last": "(array_agg(v ORDER BY d DESC) FILTER (WHERE v IS NOT NULL))[1]",
}
GRAINS = {"day", "week", "month", "quarter"}
_IDENT = re.compile(r"^[^\x00]{1,63}$")


class SourceError(Exception):
    """User-facing error about an external source (bad mapping, unreachable, …)."""


@dataclass
class ConnParams:
    host: str
    port: int
    database: str
    username: str
    password: str
    sslmode: str = "prefer"

    @classmethod
    def from_source(cls, ds: DataSource) -> ConnParams:
        return cls(ds.host, ds.port, ds.database, ds.username, decrypt(ds.password_encrypted), ds.sslmode)


@contextmanager
def connect(p: ConnParams):
    s = get_settings()
    try:
        conn = psycopg.connect(
            host=p.host,
            port=p.port,
            dbname=p.database,
            user=p.username,
            password=p.password,
            sslmode=p.sslmode,
            connect_timeout=s.external_connect_timeout_s,
            application_name="open-metrics",
            options=f"-c default_transaction_read_only=on -c statement_timeout={s.external_statement_timeout_ms} "
            "-c TimeZone=UTC",
        )
    except psycopg.OperationalError as e:
        raise SourceError(f"Could not connect: {_first_line(e)}") from e
    try:
        yield conn
    except psycopg.Error as e:
        raise SourceError(_first_line(e)) from e
    finally:
        try:
            conn.rollback()
        finally:
            conn.close()


def _first_line(e: Exception) -> str:
    return (str(e).strip().splitlines() or ["error"])[0]


def test_connection(p: ConnParams) -> dict:
    with connect(p) as conn:
        row = conn.execute("SELECT version(), current_setting('transaction_read_only')").fetchone()
    return {"ok": True, "server_version": row[0].split(",")[0], "read_only": row[1] == "on"}


def list_schemas(p: ConnParams) -> list[str]:
    with connect(p) as conn:
        rows = conn.execute(
            """SELECT DISTINCT table_schema FROM information_schema.tables
               WHERE table_schema NOT IN ('pg_catalog','information_schema')
                 AND table_schema NOT LIKE 'pg\\_%%'
               ORDER BY 1"""
        ).fetchall()
    return [r[0] for r in rows]


def list_tables(p: ConnParams, schema: str) -> list[dict]:
    with connect(p) as conn:
        rows = conn.execute(
            """SELECT table_name, table_type FROM information_schema.tables
               WHERE table_schema = %s ORDER BY table_name""",
            (schema,),
        ).fetchall()
    return [{"name": r[0], "type": "view" if r[1] == "VIEW" else "table"} for r in rows]


def _columns(conn, schema: str, table: str) -> dict[str, str]:
    rows = conn.execute(
        """SELECT column_name, data_type FROM information_schema.columns
           WHERE table_schema = %s AND table_name = %s ORDER BY ordinal_position""",
        (schema, table),
    ).fetchall()
    return {r[0]: r[1] for r in rows}


def list_columns(p: ConnParams, schema: str, table: str) -> list[dict]:
    with connect(p) as conn:
        cols = _columns(conn, schema, table)
    if not cols:
        raise SourceError(f"Table {schema}.{table} not found or not readable")
    return [{"name": n, "data_type": t, "kind": _kind(t)} for n, t in cols.items()]


def _kind(data_type: str) -> str:
    if data_type in NUMERIC_TYPES:
        return "numeric"
    if data_type in DATE_TYPES:
        return "date"
    if data_type in TEXT_TYPES:
        return "text"
    return "other"


@dataclass
class Mapping:
    schema: str
    table: str
    date_column: str
    value_column: str
    narrative_column: str | None
    aggregation: str
    grain: str

    @classmethod
    def from_metric(cls, m: Metric) -> Mapping:
        return cls(
            m.source_schema or "public",
            m.source_table or "",
            m.date_column or "",
            m.value_column or "",
            m.narrative_column or None,
            m.aggregation,
            m.period_type,
        )


def validate_mapping(conn, mp: Mapping) -> None:
    for ident in (mp.schema, mp.table, mp.date_column, mp.value_column, mp.narrative_column or "x"):
        if not _IDENT.match(ident):
            raise SourceError("Invalid identifier")
    if mp.aggregation not in AGGREGATIONS:
        raise SourceError(f"Unsupported aggregation {mp.aggregation!r}")
    if mp.grain not in GRAINS:
        raise SourceError(f"Unsupported period type {mp.grain!r}")
    cols = _columns(conn, mp.schema, mp.table)
    if not cols:
        raise SourceError(f"Table {mp.schema}.{mp.table} not found or not readable")
    if mp.date_column not in cols:
        raise SourceError(f"Date column {mp.date_column!r} not found")
    if cols[mp.date_column] not in DATE_TYPES:
        raise SourceError(f"Column {mp.date_column!r} is {cols[mp.date_column]}, not a date/timestamp")
    if mp.value_column not in cols:
        raise SourceError(f"Value column {mp.value_column!r} not found")
    if mp.aggregation != "count" and cols[mp.value_column] not in NUMERIC_TYPES:
        raise SourceError(f"Column {mp.value_column!r} is {cols[mp.value_column]}, not numeric")
    if mp.narrative_column and mp.narrative_column not in cols:
        raise SourceError(f"Narrative column {mp.narrative_column!r} not found")


def build_query(mp: Mapping, bounded: bool, limit: int | None = None) -> sql.Composed:
    d = sql.Identifier(mp.date_column)
    narrative = (
        sql.SQL("NULLIF(btrim({}::text), '')").format(sql.Identifier(mp.narrative_column))
        if mp.narrative_column
        else sql.SQL("NULL::text")
    )
    where = sql.SQL("{d} IS NOT NULL").format(d=d)
    if bounded:
        where = sql.SQL("{w} AND {d} >= %(lo)s AND {d} < %(hi)s").format(w=where, d=d)
    q = sql.SQL(
        """WITH src AS (
             SELECT date_trunc(%(grain)s, {d}::timestamp)::date AS ps, {v} AS v, {n} AS n, {d} AS d
             FROM {schema}.{table} WHERE {where}
           )
           SELECT ps, {agg} AS value, (array_agg(n ORDER BY d DESC) FILTER (WHERE n IS NOT NULL))[1] AS narrative
           FROM src GROUP BY ps ORDER BY ps {order}{limit}"""
    ).format(
        d=d,
        v=sql.Identifier(mp.value_column),
        n=narrative,
        schema=sql.Identifier(mp.schema),
        table=sql.Identifier(mp.table),
        where=where,
        agg=sql.SQL(AGGREGATIONS[mp.aggregation]),
        order=sql.SQL("DESC" if limit else "ASC"),
        limit=sql.SQL(" LIMIT %(limit)s") if limit else sql.SQL(""),
    )
    return q


def query_series(
    p: ConnParams, mp: Mapping, start: date | None = None, end: date | None = None, limit: int | None = None
) -> list[tuple[date, float | None, str]]:
    """Rows of (period_start, value, narrative), ascending. Bounds are padded so the
    caller can apply the midpoint rule exactly."""
    params: dict = {"grain": mp.grain}
    bounded = start is not None and end is not None
    if bounded:
        params["lo"] = datetime.combine(start - timedelta(days=100), datetime.min.time())
        params["hi"] = datetime.combine(end + timedelta(days=100), datetime.min.time())
    if limit:
        params["limit"] = limit
    with connect(p) as conn:
        validate_mapping(conn, mp)
        rows = conn.execute(build_query(mp, bounded, limit), params).fetchall()
    out = [(r[0], float(r[1]) if r[1] is not None else None, r[2] or "") for r in rows]
    out.sort(key=lambda r: r[0])
    return out
