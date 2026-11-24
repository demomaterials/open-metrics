from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Direction = Literal["higher_is_better", "lower_is_better", "neutral"]
PeriodType = Literal["day", "week", "month", "quarter"]
Aggregation = Literal["sum", "avg", "min", "max", "count", "last"]
DisplayType = Literal["sparkline", "trend", "area", "progress"]
Unit = Literal["number", "percent", "currency", "days", "hours", "ratio", "custom"]
Role = Literal["admin", "viewer"]


class ORM(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Thresholds(BaseModel):
    green: float | None = None
    amber: float | None = None


# ---- auth / users ---------------------------------------------------------
class LoginIn(BaseModel):
    username: str = Field(min_length=1, max_length=64)
    password: str = Field(min_length=1, max_length=256)


class UserOut(ORM):
    id: int
    username: str
    display_name: str
    role: Role
    is_active: bool
    last_login_at: datetime | None = None


class UserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=64, pattern=r"^[A-Za-z0-9._@-]+$")
    display_name: str = Field(default="", max_length=128)
    password: str = Field(min_length=10, max_length=256)
    role: Role = "viewer"


class UserUpdate(BaseModel):
    display_name: str | None = Field(default=None, max_length=128)
    role: Role | None = None
    is_active: bool | None = None
    password: str | None = Field(default=None, min_length=10, max_length=256)


class PasswordChange(BaseModel):
    current_password: str
    new_password: str = Field(min_length=10, max_length=256)


# ---- data sources ---------------------------------------------------------
class DataSourceBase(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    host: str = Field(min_length=1, max_length=255)
    port: int = Field(default=5432, ge=1, le=65535)
    database: str = Field(min_length=1, max_length=128)
    username: str = Field(min_length=1, max_length=128)
    sslmode: Literal["disable", "allow", "prefer", "require", "verify-ca", "verify-full"] = "prefer"


class DataSourceIn(DataSourceBase):
    # Omitted on update = keep the stored password.
    password: str | None = Field(default=None, max_length=512)


class DataSourceTestIn(DataSourceIn):
    id: int | None = None  # reuse the stored password of this source


class DataSourceOut(ORM, DataSourceBase):
    id: int
    kind: str
    read_only: bool
    has_password: bool = False
    metric_count: int = 0
    created_at: datetime
    updated_at: datetime


# ---- metrics --------------------------------------------------------------
class MetricBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=4000)
    unit: Unit = "number"
    unit_label: str = Field(default="", max_length=16)
    decimals: int = Field(default=1, ge=0, le=6)
    direction: Direction = "higher_is_better"
    period_type: PeriodType = "week"
    thresholds: Thresholds | None = None
    target: float | None = None
    source_type: Literal["managed", "external"] = "managed"
    data_source_id: int | None = None
    source_schema: str | None = Field(default=None, max_length=128)
    source_table: str | None = Field(default=None, max_length=128)
    date_column: str | None = Field(default=None, max_length=128)
    value_column: str | None = Field(default=None, max_length=128)
    narrative_column: str | None = Field(default=None, max_length=128)
    aggregation: Aggregation = "sum"

    @model_validator(mode="after")
    def _external_complete(self):
        if self.source_type == "external":
            missing = [
                f for f in ("data_source_id", "source_table", "date_column", "value_column") if not getattr(self, f)
            ]
            if missing:
                raise ValueError(f"External metrics need: {', '.join(missing)}")
            if not self.source_schema:
                self.source_schema = "public"
            if not self.narrative_column:
                self.narrative_column = None
        return self


class MetricIn(MetricBase):
    pass


class MetricOut(ORM, MetricBase):
    id: int
    data_source_name: str | None = None
    value_count: int | None = None
    board_count: int = 0
    created_at: datetime
    updated_at: datetime


class PreviewIn(BaseModel):
    data_source_id: int
    source_schema: str = "public"
    source_table: str
    date_column: str
    value_column: str
    narrative_column: str | None = None
    aggregation: Aggregation = "sum"
    period_type: PeriodType = "week"
    limit: int = Field(default=24, ge=1, le=200)


# ---- values ---------------------------------------------------------------
class ValueIn(BaseModel):
    period_start: date
    period_end: date | None = None
    value: float | None
    narrative: str = Field(default="", max_length=20000)

    @model_validator(mode="after")
    def _order(self):
        if self.period_end and self.period_end < self.period_start:
            raise ValueError("period_end is before period_start")
        return self


class ValueOut(ORM):
    id: int
    metric_id: int
    period_start: date
    period_end: date
    value: float | None
    narrative: str
    label: str = ""
    updated_at: datetime


class CsvImportIn(BaseModel):
    csv: str = Field(max_length=5_000_000)
    dry_run: bool = True


# ---- boards ---------------------------------------------------------------
class DefaultRange(BaseModel):
    mode: Literal["week", "month", "quarter"] = "week"
    periods: int = Field(default=12, ge=1, le=260)


class BoardIn(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    description: str = Field(default="", max_length=4000)
    columns: int = Field(default=3, ge=1, le=6)
    default_range: DefaultRange = DefaultRange()


class BoardPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    description: str | None = Field(default=None, max_length=4000)
    columns: int | None = Field(default=None, ge=1, le=6)
    default_range: DefaultRange | None = None


class CardConfig(BaseModel):
    model_config = ConfigDict(extra="allow")
    target: float | None = None
    show_narrative: bool = True


class CardIn(BaseModel):
    metric_id: int
    display_title: str = Field(default="", max_length=160)
    display_type: DisplayType = "sparkline"
    width: int = Field(default=1, ge=1, le=4)
    colour_thresholds: Thresholds | None = None
    configuration: CardConfig = CardConfig()


class CardPatch(BaseModel):
    metric_id: int | None = None
    display_title: str | None = Field(default=None, max_length=160)
    display_type: DisplayType | None = None
    width: int | None = Field(default=None, ge=1, le=4)
    colour_thresholds: Thresholds | None = None
    clear_thresholds: bool = False
    configuration: CardConfig | None = None


class CardOrder(BaseModel):
    card_ids: list[int]


class MetricBrief(ORM):
    id: int
    name: str
    description: str
    unit: str
    unit_label: str
    decimals: int
    direction: str
    period_type: str
    thresholds: dict[str, Any] | None
    target: float | None
    source_type: str


class CardOut(ORM):
    id: int
    board_id: int
    metric_id: int
    display_title: str
    display_type: str
    position: int
    width: int
    colour_thresholds: dict[str, Any] | None
    configuration: dict[str, Any]
    metric: MetricBrief

    @field_validator("configuration", mode="before")
    @classmethod
    def _cfg(cls, v):
        return v or {}


class BoardSummary(ORM):
    id: int
    name: str
    description: str
    columns: int
    position: int
    default_range: dict[str, Any]
    card_count: int = 0
    updated_at: datetime


class BoardOut(BoardSummary):
    cards: list[CardOut]
