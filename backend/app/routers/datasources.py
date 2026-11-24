from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..crypto import decrypt, encrypt
from ..db import get_db
from ..deps import get_or_404, require_admin
from ..models import DataSource, Metric
from ..schemas import DataSourceIn, DataSourceOut, DataSourceTestIn
from ..services import external

router = APIRouter(prefix="/api/datasources", tags=["data sources"], dependencies=[Depends(require_admin)])


def _out(db: Session, ds: DataSource) -> DataSourceOut:
    out = DataSourceOut.model_validate(ds)
    out.has_password = bool(ds.password_encrypted)
    out.metric_count = db.scalar(select(func.count()).select_from(Metric).where(Metric.data_source_id == ds.id)) or 0
    return out


def _params(db: Session, ds_id: int) -> external.ConnParams:
    return external.ConnParams.from_source(get_or_404(db, DataSource, ds_id))


def _guard(fn, *args):
    try:
        return fn(*args)
    except external.SourceError as e:
        raise HTTPException(422, str(e)) from e


@router.get("", response_model=list[DataSourceOut])
def list_sources(db: Session = Depends(get_db)):
    return [_out(db, d) for d in db.scalars(select(DataSource).order_by(DataSource.name))]


@router.post("", response_model=DataSourceOut, status_code=201)
def create_source(body: DataSourceIn, db: Session = Depends(get_db)):
    if db.scalar(select(DataSource).where(DataSource.name == body.name)):
        raise HTTPException(status.HTTP_409_CONFLICT, "A data source with this name exists")
    ds = DataSource(**body.model_dump(exclude={"password"}), kind="postgresql", read_only=True)
    ds.password_encrypted = encrypt(body.password) if body.password else None
    db.add(ds)
    db.commit()
    return _out(db, ds)


@router.put("/{ds_id}", response_model=DataSourceOut)
def update_source(ds_id: int, body: DataSourceIn, db: Session = Depends(get_db)):
    ds = get_or_404(db, DataSource, ds_id)
    for k, v in body.model_dump(exclude={"password"}).items():
        setattr(ds, k, v)
    if body.password is not None:
        ds.password_encrypted = encrypt(body.password) if body.password else None
    db.commit()
    return _out(db, ds)


@router.delete("/{ds_id}", status_code=204)
def delete_source(ds_id: int, db: Session = Depends(get_db)):
    ds = get_or_404(db, DataSource, ds_id)
    n = db.scalar(select(func.count()).select_from(Metric).where(Metric.data_source_id == ds.id))
    if n:
        raise HTTPException(status.HTTP_409_CONFLICT, f"{n} metric(s) still use this data source")
    db.delete(ds)
    db.commit()
    return Response(status_code=204)


@router.post("/test")
def test_source(body: DataSourceTestIn, db: Session = Depends(get_db)):
    password = body.password
    if password is None and body.id:
        password = decrypt(get_or_404(db, DataSource, body.id).password_encrypted)
    p = external.ConnParams(body.host, body.port, body.database, body.username, password or "", body.sslmode)
    try:
        return external.test_connection(p)
    except external.SourceError as e:
        return {"ok": False, "error": str(e)}


@router.get("/{ds_id}/schemas", response_model=list[str])
def schemas(ds_id: int, db: Session = Depends(get_db)):
    return _guard(external.list_schemas, _params(db, ds_id))


@router.get("/{ds_id}/tables")
def tables(ds_id: int, schema: str = Query(..., max_length=128), db: Session = Depends(get_db)):
    return _guard(external.list_tables, _params(db, ds_id), schema)


@router.get("/{ds_id}/columns")
def columns(
    ds_id: int,
    schema: str = Query(..., max_length=128),
    table: str = Query(..., max_length=128),
    db: Session = Depends(get_db),
):
    return _guard(external.list_columns, _params(db, ds_id), schema, table)
