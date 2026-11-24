"""SQLAlchemy models. The authoritative schema is the Alembic migration in
migrations/versions; keep the two in step."""
from datetime import date, datetime
from decimal import Decimal
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    LargeBinary,
    Numeric,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class User(TimestampMixin, Base):
    __tablename__ = "users"
    __table_args__ = (CheckConstraint("role IN ('admin','viewer')", name="ck_users_role"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    display_name: Mapped[str] = mapped_column(String(128), default="")
    password_hash: Mapped[str] = mapped_column(Text)
    role: Mapped[str] = mapped_column(String(16), default="viewer")
    is_active: Mapped[bool] = mapped_column(default=True)
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class UserSession(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

    user: Mapped[User] = relationship(lazy="joined")


class DataSource(TimestampMixin, Base):
    __tablename__ = "data_sources"
    __table_args__ = (CheckConstraint("kind IN ('postgresql')", name="ck_data_sources_kind"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    kind: Mapped[str] = mapped_column(String(32), default="postgresql")
    host: Mapped[str] = mapped_column(String(255))
    port: Mapped[int] = mapped_column(Integer, default=5432)
    database: Mapped[str] = mapped_column(String(128))
    username: Mapped[str] = mapped_column(String(128))
    password_encrypted: Mapped[bytes | None] = mapped_column(LargeBinary)
    sslmode: Mapped[str] = mapped_column(String(16), default="prefer")
    read_only: Mapped[bool] = mapped_column(default=True)


class Metric(TimestampMixin, Base):
    __tablename__ = "metrics"
    __table_args__ = (
        CheckConstraint("source_type IN ('managed','external')", name="ck_metrics_source_type"),
        CheckConstraint(
            "direction IN ('higher_is_better','lower_is_better','neutral')", name="ck_metrics_direction"
        ),
        CheckConstraint("period_type IN ('day','week','month','quarter')", name="ck_metrics_period_type"),
        CheckConstraint(
            "aggregation IN ('sum','avg','min','max','count','last')", name="ck_metrics_aggregation"
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160), unique=True)
    description: Mapped[str] = mapped_column(Text, default="")
    unit: Mapped[str] = mapped_column(String(16), default="number")
    unit_label: Mapped[str] = mapped_column(String(16), default="")
    decimals: Mapped[int] = mapped_column(Integer, default=1)
    direction: Mapped[str] = mapped_column(String(20), default="higher_is_better")
    period_type: Mapped[str] = mapped_column(String(10), default="week")
    # {"green": n, "amber": n} – see services/cards.py:status_for
    thresholds: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    target: Mapped[Decimal | None] = mapped_column(Numeric)

    source_type: Mapped[str] = mapped_column(String(10), default="managed")
    data_source_id: Mapped[int | None] = mapped_column(ForeignKey("data_sources.id", ondelete="RESTRICT"))
    source_schema: Mapped[str | None] = mapped_column(String(128))
    source_table: Mapped[str | None] = mapped_column(String(128))
    date_column: Mapped[str | None] = mapped_column(String(128))
    value_column: Mapped[str | None] = mapped_column(String(128))
    narrative_column: Mapped[str | None] = mapped_column(String(128))
    aggregation: Mapped[str] = mapped_column(String(8), default="sum")

    data_source: Mapped[DataSource | None] = relationship(lazy="joined")


class MetricValue(Base):
    __tablename__ = "metric_values"
    __table_args__ = (
        UniqueConstraint("metric_id", "period_start", name="uq_metric_values_metric_period"),
        CheckConstraint("period_end >= period_start", name="ck_metric_values_period"),
        Index("ix_metric_values_metric_period", "metric_id", "period_start"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    metric_id: Mapped[int] = mapped_column(ForeignKey("metrics.id", ondelete="CASCADE"))
    period_start: Mapped[date] = mapped_column(Date)
    period_end: Mapped[date] = mapped_column(Date)
    value: Mapped[Decimal | None] = mapped_column(Numeric)
    narrative: Mapped[str] = mapped_column(Text, default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class Board(TimestampMixin, Base):
    __tablename__ = "boards"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(160))
    description: Mapped[str] = mapped_column(Text, default="")
    columns: Mapped[int] = mapped_column(Integer, default=3)
    position: Mapped[int] = mapped_column(Integer, default=0)
    # {"mode": "week"|"month"|"quarter", "periods": 12}
    default_range: Mapped[dict[str, Any]] = mapped_column(JSONB, default=lambda: {"mode": "week", "periods": 12})

    cards: Mapped[list["BoardCard"]] = relationship(
        back_populates="board", order_by="BoardCard.position", cascade="all, delete-orphan"
    )


class BoardCard(TimestampMixin, Base):
    __tablename__ = "board_cards"
    __table_args__ = (
        CheckConstraint(
            "display_type IN ('sparkline','trend','area','progress')", name="ck_board_cards_display_type"
        ),
        CheckConstraint("width BETWEEN 1 AND 4", name="ck_board_cards_width"),
        Index("ix_board_cards_board", "board_id", "position"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    board_id: Mapped[int] = mapped_column(ForeignKey("boards.id", ondelete="CASCADE"))
    metric_id: Mapped[int] = mapped_column(ForeignKey("metrics.id", ondelete="CASCADE"))
    display_title: Mapped[str] = mapped_column(String(160), default="")
    display_type: Mapped[str] = mapped_column(String(16), default="sparkline")
    position: Mapped[int] = mapped_column(Integer, default=0)
    width: Mapped[int] = mapped_column(Integer, default=1)
    # Overrides metric.thresholds when set.
    colour_thresholds: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    # {"target": n, "show_narrative": bool}
    configuration: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)

    board: Mapped[Board] = relationship(back_populates="cards")
    metric: Mapped[Metric] = relationship(lazy="joined")
