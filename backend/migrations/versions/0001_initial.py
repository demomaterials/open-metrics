"""initial schema

Revision ID: 0001
Revises:
Create Date: 2026-11-24
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def _ts():
    return [
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    ]


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("username", sa.String(64), nullable=False, unique=True),
        sa.Column("display_name", sa.String(128), nullable=False, server_default=""),
        sa.Column("password_hash", sa.Text, nullable=False),
        sa.Column("role", sa.String(16), nullable=False, server_default="viewer"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default=sa.true()),
        sa.Column("last_login_at", sa.DateTime(timezone=True)),
        *_ts(),
        sa.CheckConstraint("role IN ('admin','viewer')", name="ck_users_role"),
    )
    op.create_table(
        "sessions",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("token_hash", sa.String(64), nullable=False, unique=True),
        sa.Column("user_id", sa.Integer, sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_sessions_user_id", "sessions", ["user_id"])

    op.create_table(
        "data_sources",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(128), nullable=False, unique=True),
        sa.Column("kind", sa.String(32), nullable=False, server_default="postgresql"),
        sa.Column("host", sa.String(255), nullable=False),
        sa.Column("port", sa.Integer, nullable=False, server_default="5432"),
        sa.Column("database", sa.String(128), nullable=False),
        sa.Column("username", sa.String(128), nullable=False),
        sa.Column("password_encrypted", sa.LargeBinary),
        sa.Column("sslmode", sa.String(16), nullable=False, server_default="prefer"),
        sa.Column("read_only", sa.Boolean, nullable=False, server_default=sa.true()),
        *_ts(),
        sa.CheckConstraint("kind IN ('postgresql')", name="ck_data_sources_kind"),
    )

    op.create_table(
        "metrics",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(160), nullable=False, unique=True),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("unit", sa.String(16), nullable=False, server_default="number"),
        sa.Column("unit_label", sa.String(16), nullable=False, server_default=""),
        sa.Column("decimals", sa.Integer, nullable=False, server_default="1"),
        sa.Column("direction", sa.String(20), nullable=False, server_default="higher_is_better"),
        sa.Column("period_type", sa.String(10), nullable=False, server_default="week"),
        sa.Column("thresholds", JSONB),
        sa.Column("target", sa.Numeric),
        sa.Column("source_type", sa.String(10), nullable=False, server_default="managed"),
        sa.Column("data_source_id", sa.Integer, sa.ForeignKey("data_sources.id", ondelete="RESTRICT")),
        sa.Column("source_schema", sa.String(128)),
        sa.Column("source_table", sa.String(128)),
        sa.Column("date_column", sa.String(128)),
        sa.Column("value_column", sa.String(128)),
        sa.Column("narrative_column", sa.String(128)),
        sa.Column("aggregation", sa.String(8), nullable=False, server_default="sum"),
        *_ts(),
        sa.CheckConstraint("source_type IN ('managed','external')", name="ck_metrics_source_type"),
        sa.CheckConstraint(
            "direction IN ('higher_is_better','lower_is_better','neutral')", name="ck_metrics_direction"
        ),
        sa.CheckConstraint("period_type IN ('day','week','month','quarter')", name="ck_metrics_period_type"),
        sa.CheckConstraint("aggregation IN ('sum','avg','min','max','count','last')", name="ck_metrics_aggregation"),
        sa.CheckConstraint(
            "source_type = 'managed' OR (data_source_id IS NOT NULL AND source_table IS NOT NULL "
            "AND date_column IS NOT NULL AND value_column IS NOT NULL)",
            name="ck_metrics_external_mapping",
        ),
    )

    op.create_table(
        "metric_values",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("metric_id", sa.Integer, sa.ForeignKey("metrics.id", ondelete="CASCADE"), nullable=False),
        sa.Column("period_start", sa.Date, nullable=False),
        sa.Column("period_end", sa.Date, nullable=False),
        sa.Column("value", sa.Numeric),
        sa.Column("narrative", sa.Text, nullable=False, server_default=""),
        *_ts(),
        sa.UniqueConstraint("metric_id", "period_start", name="uq_metric_values_metric_period"),
        sa.CheckConstraint("period_end >= period_start", name="ck_metric_values_period"),
    )
    op.create_index("ix_metric_values_metric_period", "metric_values", ["metric_id", "period_start"])

    op.create_table(
        "boards",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("name", sa.String(160), nullable=False),
        sa.Column("description", sa.Text, nullable=False, server_default=""),
        sa.Column("columns", sa.Integer, nullable=False, server_default="3"),
        sa.Column("position", sa.Integer, nullable=False, server_default="0"),
        sa.Column(
            "default_range", JSONB, nullable=False, server_default=sa.text("'{\"mode\": \"week\", \"periods\": 12}'")
        ),
        *_ts(),
        sa.CheckConstraint("columns BETWEEN 1 AND 6", name="ck_boards_columns"),
    )

    op.create_table(
        "board_cards",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("board_id", sa.Integer, sa.ForeignKey("boards.id", ondelete="CASCADE"), nullable=False),
        sa.Column("metric_id", sa.Integer, sa.ForeignKey("metrics.id", ondelete="CASCADE"), nullable=False),
        sa.Column("display_title", sa.String(160), nullable=False, server_default=""),
        sa.Column("display_type", sa.String(16), nullable=False, server_default="sparkline"),
        sa.Column("position", sa.Integer, nullable=False, server_default="0"),
        sa.Column("width", sa.Integer, nullable=False, server_default="1"),
        sa.Column("colour_thresholds", JSONB),
        sa.Column("configuration", JSONB, nullable=False, server_default=sa.text("'{}'")),
        *_ts(),
        sa.CheckConstraint(
            "display_type IN ('sparkline','trend','area','progress')", name="ck_board_cards_display_type"
        ),
        sa.CheckConstraint("width BETWEEN 1 AND 4", name="ck_board_cards_width"),
    )
    op.create_index("ix_board_cards_board", "board_cards", ["board_id", "position"])
    op.create_index("ix_board_cards_metric", "board_cards", ["metric_id"])


def downgrade() -> None:
    for t in ("board_cards", "boards", "metric_values", "metrics", "data_sources", "sessions", "users"):
        op.drop_table(t)
