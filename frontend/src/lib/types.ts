export type Role = "admin" | "viewer";
export type Direction = "higher_is_better" | "lower_is_better" | "neutral";
export type PeriodType = "day" | "week" | "month" | "quarter";
export type Aggregation = "sum" | "avg" | "min" | "max" | "count" | "last";
export type DisplayType = "sparkline" | "trend" | "area" | "progress";
export type Unit = "number" | "percent" | "currency" | "days" | "hours" | "ratio" | "custom";
export type Status = "good" | "warn" | "bad" | "nodata" | "neutral";

export interface Thresholds {
  green: number | null;
  amber: number | null;
}

export interface User {
  id: number;
  username: string;
  display_name: string;
  role: Role;
  is_active: boolean;
  last_login_at: string | null;
}

export interface MetricBrief {
  id: number;
  name: string;
  description: string;
  unit: Unit;
  unit_label: string;
  decimals: number;
  direction: Direction;
  period_type: PeriodType;
  thresholds: Thresholds | null;
  target: number | null;
  source_type: "managed" | "external";
}

export interface Metric extends MetricBrief {
  data_source_id: number | null;
  source_schema: string | null;
  source_table: string | null;
  date_column: string | null;
  value_column: string | null;
  narrative_column: string | null;
  aggregation: Aggregation;
  data_source_name: string | null;
  value_count: number | null;
  board_count: number;
}

export type MetricInput = Omit<Metric, "id" | "data_source_name" | "value_count" | "board_count">;

export interface CardConfig {
  target?: number | null;
  show_narrative?: boolean;
}

export interface Card {
  id: number;
  board_id: number;
  metric_id: number;
  display_title: string;
  display_type: DisplayType;
  position: number;
  width: number;
  colour_thresholds: Thresholds | null;
  configuration: CardConfig;
  metric: MetricBrief;
}

export interface DefaultRange {
  mode: "week" | "month" | "quarter";
  periods: number;
}

export interface BoardSummary {
  id: number;
  name: string;
  description: string;
  columns: number;
  position: number;
  default_range: DefaultRange;
  card_count: number;
  updated_at: string;
}

export interface Board extends BoardSummary {
  cards: Card[];
}

export interface Point {
  period_start: string;
  period_end: string;
  label: string;
  value: number | null;
  narrative: string;
}

export interface Summary {
  status: Status;
  latest: Point | null;
  first: Point | null;
  change_abs: number | null;
  change_pct: number | null;
  trend: "up" | "down" | "flat" | null;
  sentiment: "positive" | "negative" | "neutral";
  count: number;
  min: number | null;
  max: number | null;
  avg: number | null;
  points: Point[];
}

export interface CardData extends Partial<Summary> {
  card_id: number;
  metric_id: number;
  status: Status;
  points: Point[];
  latest: Point | null;
  error: string | null;
}

export interface BoardData {
  from: string;
  to: string;
  cards: CardData[];
}

export interface SeriesResponse {
  history: Point[];
  summary: Summary;
  previous: Point | null;
}

export interface DataSource {
  id: number;
  name: string;
  kind: string;
  host: string;
  port: number;
  database: string;
  username: string;
  sslmode: string;
  read_only: boolean;
  has_password: boolean;
  metric_count: number;
}

export interface Column {
  name: string;
  data_type: string;
  kind: "numeric" | "date" | "text" | "other";
}

export interface MetricValue {
  id: number;
  metric_id: number;
  period_start: string;
  period_end: string;
  value: number | null;
  narrative: string;
  label: string;
  updated_at: string;
}

export interface ImportRow {
  line: number;
  error: string | null;
  period_start?: string;
  period_end?: string;
  label?: string;
  value?: number | null;
  narrative?: string;
  action?: "insert" | "update";
}

export interface ImportResult {
  rows: ImportRow[];
  inserted: number;
  updated: number;
  errors: number;
  applied: boolean;
}
