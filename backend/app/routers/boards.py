from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_user, get_or_404, require_admin
from ..models import Board, BoardCard, Metric
from ..periods import default_range
from ..schemas import BoardIn, BoardOut, BoardPatch, BoardSummary, CardIn, CardOrder, CardOut, CardPatch
from ..services import external
from ..services.series import fetch_points, summarize

router = APIRouter(prefix="/api", tags=["boards"])


def _summary(db: Session, b: Board) -> BoardSummary:
    s = BoardSummary.model_validate(b)
    s.card_count = db.scalar(select(func.count()).select_from(BoardCard).where(BoardCard.board_id == b.id)) or 0
    return s


@router.get("/boards", response_model=list[BoardSummary], dependencies=[Depends(current_user)])
def list_boards(db: Session = Depends(get_db)):
    return [_summary(db, b) for b in db.scalars(select(Board).order_by(Board.position, Board.id))]


@router.post("/boards", response_model=BoardOut, status_code=201, dependencies=[Depends(require_admin)])
def create_board(body: BoardIn, db: Session = Depends(get_db)):
    pos = (db.scalar(select(func.max(Board.position))) or 0) + 1
    b = Board(
        name=body.name,
        description=body.description,
        columns=body.columns,
        default_range=body.default_range.model_dump(),
        position=pos,
    )
    db.add(b)
    db.commit()
    return get_board(b.id, db)


@router.get("/boards/{board_id}", response_model=BoardOut, dependencies=[Depends(current_user)])
def get_board(board_id: int, db: Session = Depends(get_db)):
    b = get_or_404(db, Board, board_id)
    out = BoardOut.model_validate(b)
    out.card_count = len(b.cards)
    return out


@router.put("/boards/{board_id}", response_model=BoardOut, dependencies=[Depends(require_admin)])
def update_board(board_id: int, body: BoardPatch, db: Session = Depends(get_db)):
    b = get_or_404(db, Board, board_id)
    data = body.model_dump(exclude_unset=True)
    for k, v in data.items():
        setattr(b, k, v)
    db.commit()
    return get_board(b.id, db)


@router.delete("/boards/{board_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_board(board_id: int, db: Session = Depends(get_db)):
    db.delete(get_or_404(db, Board, board_id))
    db.commit()
    return Response(status_code=204)


@router.post("/boards/{board_id}/duplicate", response_model=BoardOut, status_code=201,
             dependencies=[Depends(require_admin)])
def duplicate_board(board_id: int, db: Session = Depends(get_db)):
    src = get_or_404(db, Board, board_id)
    pos = (db.scalar(select(func.max(Board.position))) or 0) + 1
    copy = Board(
        name=f"{src.name} (copy)",
        description=src.description,
        columns=src.columns,
        default_range=dict(src.default_range or {}),
        position=pos,
    )
    copy.cards = [
        BoardCard(
            metric_id=c.metric_id,
            display_title=c.display_title,
            display_type=c.display_type,
            position=c.position,
            width=c.width,
            colour_thresholds=c.colour_thresholds,
            configuration=dict(c.configuration or {}),
        )
        for c in src.cards
    ]
    db.add(copy)
    db.commit()
    return get_board(copy.id, db)


@router.put("/board-order", status_code=204, dependencies=[Depends(require_admin)])
def reorder_boards(body: CardOrder, db: Session = Depends(get_db)):
    for i, bid in enumerate(body.card_ids):
        b = db.get(Board, bid)
        if b:
            b.position = i
    db.commit()
    return Response(status_code=204)


# ---- cards ----------------------------------------------------------------
def _card_values(body, card: BoardCard) -> None:
    data = body.model_dump(exclude_unset=isinstance(body, CardPatch), exclude={"clear_thresholds"})
    for k, v in data.items():
        setattr(card, k, v)
    if getattr(body, "clear_thresholds", False):
        card.colour_thresholds = None
    elif card.colour_thresholds is not None and card.colour_thresholds.get("green") is None:
        card.colour_thresholds = None


@router.post("/boards/{board_id}/cards", response_model=CardOut, status_code=201,
             dependencies=[Depends(require_admin)])
def add_card(board_id: int, body: CardIn, db: Session = Depends(get_db)):
    b = get_or_404(db, Board, board_id)
    get_or_404(db, Metric, body.metric_id)
    card = BoardCard(board_id=b.id, position=max((c.position for c in b.cards), default=-1) + 1)
    _card_values(body, card)
    db.add(card)
    db.commit()
    db.refresh(card)
    return card


@router.put("/cards/{card_id}", response_model=CardOut, dependencies=[Depends(require_admin)])
def update_card(card_id: int, body: CardPatch, db: Session = Depends(get_db)):
    card = get_or_404(db, BoardCard, card_id)
    if body.metric_id is not None:
        get_or_404(db, Metric, body.metric_id)
    _card_values(body, card)
    db.commit()
    db.refresh(card)
    return card


@router.delete("/cards/{card_id}", status_code=204, dependencies=[Depends(require_admin)])
def delete_card(card_id: int, db: Session = Depends(get_db)):
    db.delete(get_or_404(db, BoardCard, card_id))
    db.commit()
    return Response(status_code=204)


@router.put("/boards/{board_id}/cards/order", response_model=BoardOut, dependencies=[Depends(require_admin)])
def order_cards(board_id: int, body: CardOrder, db: Session = Depends(get_db)):
    b = get_or_404(db, Board, board_id)
    by_id = {c.id: c for c in b.cards}
    if set(body.card_ids) != set(by_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "card_ids must list every card on the board exactly once")
    for i, cid in enumerate(body.card_ids):
        by_id[cid].position = i
    db.commit()
    db.expire(b)
    return get_board(b.id, db)


# ---- board data: the single global reporting range -------------------------
@router.get("/boards/{board_id}/data", dependencies=[Depends(current_user)])
def board_data(
    board_id: int,
    start: date | None = Query(None, alias="from"),
    end: date | None = Query(None, alias="to"),
    db: Session = Depends(get_db),
):
    """Every card on the board evaluated against the same [from, to] range."""
    b = get_or_404(db, Board, board_id)
    if not (start and end):
        dr = b.default_range or {}
        start, end = default_range(dr.get("mode", "week"), int(dr.get("periods", 12)))
    if end < start:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "'to' is before 'from'")
    cards = []
    for c in b.cards:
        thresholds = c.colour_thresholds or c.metric.thresholds
        item = {"card_id": c.id, "metric_id": c.metric_id, "error": None}
        try:
            item.update(summarize(fetch_points(db, c.metric, start, end), c.metric, thresholds))
        except external.SourceError as e:
            item.update(status="nodata", points=[], latest=None, error=str(e))
        cards.append(item)
    return {"from": start.isoformat(), "to": end.isoformat(), "cards": cards}
