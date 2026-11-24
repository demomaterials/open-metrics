import csv
import io
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user, get_or_404, require_admin
from ..models import BoardCard, DataSource, Metric, MetricValue
from ..periods import in_range, parse_period, period_bounds, period_label
from ..schemas import CsvImportIn, MetricIn, MetricOut, PreviewIn, ValueIn, ValueOut
from ..services import external
from ..services.series import fetch_points, previous_comparison, summarize

router = APIRouter(prefix="/api", tags=["metrics"])
MAX_HISTORY = 520


def _out(db: Session, m: Metric) -> MetricOut:
    out = MetricOut.model_validate(m)
    out.data_source_name = m.data_source.name if m.data_source else None
    out.board_count = (
        db.scalar(select(func.count(func.distinct(BoardCard.board_id))).where(BoardCard.metric_id == m.id)) or 0
    )
    if m.source_type == "managed":
        out.value_count = db.scalar(select(func.count()).select_from(MetricValue).where(MetricValue.metric_id == m.id))
    return out


def _apply(db: Session, m: Metric, body: MetricIn) -> None:
    data = body.model_dump()
    data["thresholds"] = body.thresholds.model_dump() if body.thresholds else None
    for k, v in data.items():
        setattr(m, k, v)
    if m.source_type == "managed":
        for f in ("data_source_id", "source_schema", "source_table", "date_column", "value_column", "narrative_column"):
            setattr(m, f, None)
        return
    ds = get_or_404(db, DataSource, m.data_source_id)
    try:
        with external.connect(external.ConnParams.from_source(ds)) as conn:
            external.validate_mapping(conn, external.Mapping.from_metric(m))
    except external.SourceError as e:
        raise HTTPException(422, f"Mapping check failed: {e}") from e


def _name_taken(db: Session, name: str, exclude_id: int | None = None) -> bool:
    q = select(Metric.id).where(func.lower(Metric.name) == name.lower())
    if exclude_id:
        q = q.where(Metric.id != exclude_id)
    return db.scalar(q) is not None


@router.get("/metrics", response_model=list[MetricOut], dependencies=[Depends(require_admin)])
def list_metrics(db: Session = Depends(get_db)):
    return [_out(db, m) for m in db.scalars(select(Metric).order_by(Metric.name)).unique()]


@router.post("/metrics", response_model=MetricOut, status_code=201, dependencies=[Depends(require_admin)])
def create_metric(body: MetricIn, db: Session = Depends(get_db)):
    if _name_taken(db, body.name):
        raise HTTPException(status.HTTP_409_CONFLICT, "A metric with this name exists")
    m = Metric()
    _apply(db, m, body)
    db.add(m)
    db.commit()
    db.refresh(m)
    return _out(db, m)


@router.get("/metrics/{metric_id}", response_model=MetricOut, dependencies=[Depends(require_admin)])
def get_metric(metric_id: int, db: Session = Depends(get_db)):
    return _out(db, get_or_404(db, Metric, metric_id))


@router.put("/metrics/{metric_id}", response_model=MetricOut, dependencies=[Depends(require_admin)])
def update_metric(metric_id: int, body: MetricIn, db: Session = Depends(get_db)):
    m = get_or_404(db, Metric, metric_id)
    if _name_taken(db, body.name, metric_id):
        raise HTTPException(status.HTTP_409_CONFLICT, "A metric with this name exists")
    _apply(db, m, body)
    db.commit()
    db.refresh(m)
    return _out(db, m)


@router.delete("/metrics/{metric_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_metric(metric_id: int, db: Session = Depends(get_db)):
    db.delete(get_or_404(db, Metric, metric_id))
    db.commit()
    return Response(status_code=204)


@router.post("/metrics/preview", dependencies=[Depends(require_admin)])
def preview(body: PreviewIn, db: Session = Depends(get_db)):
    """Run an unsaved external mapping and return its most recent periods."""
    ds = get_or_404(db, DataSource, body.data_source_id)
    mp = external.Mapping(
        body.source_schema,
        body.source_table,
        body.date_column,
        body.value_column,
        body.narrative_column or None,
        body.aggregation,
        body.period_type,
    )
    try:
        rows = external.query_series(external.ConnParams.from_source(ds), mp, limit=body.limit)
    except external.SourceError as e:
        raise HTTPException(422, str(e)) from e
    points = []
    for ps, value, narrative in rows:
        ps, pe = period_bounds(ps, body.period_type)
        points.append(
            {
                "period_start": ps.isoformat(),
                "period_end": pe.isoformat(),
                "label": period_label(ps, pe, body.period_type),
                "value": value,
                "narrative": narrative,
            }
        )
    return {"points": points}


@router.get("/metrics/{metric_id}/series", dependencies=[Depends(current_user)])
def series(
    metric_id: int,
    start: date | None = Query(None, alias="from"),
    end: date | None = Query(None, alias="to"),
    card_id: int | None = None,
    db: Session = Depends(get_db),
):
    """Full history (for the detail chart) plus a summary of the selected range.
    With card_id, the card's colour thresholds override the metric's."""
    m = get_or_404(db, Metric, metric_id)
    thresholds = m.thresholds
    if card_id:
        card = db.get(BoardCard, card_id)
        if card and card.metric_id == m.id and card.colour_thresholds:
            thresholds = card.colour_thresholds
    try:
        history = fetch_points(db, m)[-MAX_HISTORY:]
    except external.SourceError as e:
        raise HTTPException(422, str(e)) from e
    in_sel = [p for p in history if in_range(p.period_start, p.period_end, start, end)] if start and end else history
    summary = summarize(in_sel, m, thresholds)
    latest_start = date.fromisoformat(summary["latest"]["period_start"]) if summary["latest"] else None
    return {
        "history": [p.as_dict() for p in history],
        "summary": summary,
        "previous": previous_comparison(history, latest_start),
    }


# ---- managed values ------------------------------------------------------
def _managed(db: Session, metric_id: int) -> Metric:
    m = get_or_404(db, Metric, metric_id)
    if m.source_type != "managed":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Values of external metrics live in their source table")
    return m


def _value_out(m: Metric, v: MetricValue) -> ValueOut:
    out = ValueOut.model_validate(v)
    out.label = period_label(v.period_start, v.period_end, m.period_type)
    return out


def _bounds(m: Metric, start: date, end: date | None) -> tuple[date, date]:
    return (start, end) if end else period_bounds(start, m.period_type)


@router.get("/metrics/{metric_id}/values", response_model=list[ValueOut], dependencies=[Depends(require_admin)])
def list_values(metric_id: int, db: Session = Depends(get_db)):
    m = _managed(db, metric_id)
    rows = db.scalars(
        select(MetricValue).where(MetricValue.metric_id == m.id).order_by(MetricValue.period_start.desc())
    )
    return [_value_out(m, v) for v in rows]


def _upsert(db: Session, m: Metric, start: date, end: date, value: float | None, narrative: str) -> None:
    stmt = insert(MetricValue).values(
        metric_id=m.id, period_start=start, period_end=end, value=value, narrative=narrative
    )
    db.execute(
        stmt.on_conflict_do_update(
            constraint="uq_metric_values_metric_period",
            set_={"period_end": end, "value": value, "narrative": narrative, "updated_at": func.now()},
        )
    )


@router.post("/metrics/{metric_id}/values", response_model=ValueOut, dependencies=[Depends(require_admin)])
def upsert_value(metric_id: int, body: ValueIn, db: Session = Depends(get_db)):
    """Create the observation for a period, or replace it if one exists."""
    m = _managed(db, metric_id)
    start, end = _bounds(m, body.period_start, body.period_end)
    _upsert(db, m, start, end, body.value, body.narrative)
    db.commit()
    v = db.scalar(select(MetricValue).where(MetricValue.metric_id == m.id, MetricValue.period_start == start))
    return _value_out(m, v)


@router.put("/values/{value_id}", response_model=ValueOut, dependencies=[Depends(require_admin)])
def update_value(value_id: int, body: ValueIn, db: Session = Depends(get_db)):
    v = get_or_404(db, MetricValue, value_id)
    m = _managed(db, v.metric_id)
    start, end = _bounds(m, body.period_start, body.period_end)
    clash = db.scalar(
        select(MetricValue.id).where(
            MetricValue.metric_id == m.id, MetricValue.period_start == start, MetricValue.id != v.id
        )
    )
    if clash:
        raise HTTPException(status.HTTP_409_CONFLICT, "Another value already exists for that period")
    v.period_start, v.period_end, v.value, v.narrative = start, end, body.value, body.narrative
    db.commit()
    return _value_out(m, v)


@router.delete("/values/{value_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_value(value_id: int, db: Session = Depends(get_db)):
    db.delete(get_or_404(db, MetricValue, value_id))
    db.commit()
    return Response(status_code=204)


def parse_csv(text: str, period_type: str) -> list[dict]:
    """Rows: period | period_start [, period_end], value [, narrative].

    period accepts 2026-03-02, 2026-W10, 2026-03 or 2026-Q1. Values may use
    thousands separators, a trailing %, or be empty (no value)."""
    reader = csv.DictReader(io.StringIO(text.lstrip("﻿")))
    if not reader.fieldnames:
        raise HTTPException(422, "CSV is empty")
    cols = {c.strip().lower(): c for c in reader.fieldnames if c}
    pcol = cols.get("period") or cols.get("period_start") or cols.get("date")
    vcol = cols.get("value")
    if not pcol or not vcol:
        raise HTTPException(422, "CSV needs a header with 'period' (or 'period_start') and 'value' columns")
    ecol, ncol = cols.get("period_end"), cols.get("narrative")
    out = []
    for i, row in enumerate(reader, start=2):
        rec: dict = {"line": i, "error": None}
        try:
            raw_p = (row.get(pcol) or "").strip()
            if not raw_p:
                raise ValueError("missing period")
            start, end = parse_period(raw_p, period_type)
            if ecol and (row.get(ecol) or "").strip():
                end = date.fromisoformat(row[ecol].strip())
                if end < start:
                    raise ValueError("period_end before period start")
            raw_v = (row.get(vcol) or "").strip().replace(",", "").rstrip("%").strip()
            rec.update(
                period_start=start.isoformat(),
                period_end=end.isoformat(),
                label=period_label(start, end, period_type),
                value=float(raw_v) if raw_v else None,
                narrative=(row.get(ncol) or "").strip() if ncol else "",
            )
        except (ValueError, TypeError) as e:
            rec["error"] = str(e)
        out.append(rec)
    return out


@router.post("/metrics/{metric_id}/values/import", dependencies=[Depends(require_admin)])
def import_csv(metric_id: int, body: CsvImportIn, db: Session = Depends(get_db)):
    m = _managed(db, metric_id)
    rows = parse_csv(body.csv, m.period_type)
    existing = set(db.scalars(select(MetricValue.period_start).where(MetricValue.metric_id == m.id)))
    seen: set[str] = set()
    for r in rows:
        if r["error"]:
            continue
        if r["period_start"] in seen:
            r["error"] = "duplicate period in file"
            continue
        seen.add(r["period_start"])
        r["action"] = "update" if date.fromisoformat(r["period_start"]) in existing else "insert"
    errors = [r for r in rows if r["error"]]
    result = {
        "rows": rows,
        "inserted": sum(1 for r in rows if r.get("action") == "insert"),
        "updated": sum(1 for r in rows if r.get("action") == "update"),
        "errors": len(errors),
        "applied": False,
    }
    if body.dry_run:
        return result
    if errors:
        raise HTTPException(422, f"{len(errors)} row(s) have errors; nothing was imported")
    for r in rows:
        _upsert(
            db,
            m,
            date.fromisoformat(r["period_start"]),
            date.fromisoformat(r["period_end"]),
            r["value"],
            r["narrative"],
        )
    db.commit()
    result["applied"] = True
    return result
