import type { MetricBrief, Status } from "./types";

type Fmt = Pick<MetricBrief, "unit" | "unit_label" | "decimals">;

function num(v: number, decimals: number, compact = false): string {
  const abs = Math.abs(v);
  if (compact && abs >= 100_000) {
    const [scaled, suffix] = abs >= 1e9 ? [v / 1e9, "B"] : abs >= 1e6 ? [v / 1e6, "M"] : [v / 1e3, "k"];
    return `${scaled.toLocaleString("en-GB", { maximumFractionDigits: suffix === "k" ? 0 : Math.max(1, decimals) })}${suffix}`;
  }
  return v.toLocaleString("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

/** "87.4%", "£4.9M", "12,480", "3.1 days". */
export function formatValue(v: number | null | undefined, m: Fmt, opts: { compact?: boolean } = {}): string {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  const compact = opts.compact ?? true;
  const d = m.decimals ?? 1;
  switch (m.unit) {
    case "percent":
      return `${num(v, d)}%`;
    case "currency":
      return `${v < 0 ? "−" : ""}${m.unit_label || "£"}${num(Math.abs(v), d, compact)}`;
    case "days":
      return `${num(v, d)} ${Math.abs(v) === 1 ? "day" : "days"}`;
    case "hours":
      return `${num(v, d)} h`;
    case "ratio":
      return `${num(v, Math.max(d, 2))}×`;
    case "custom":
      return `${num(v, d, compact)}${m.unit_label ? ` ${m.unit_label}` : ""}`;
    default:
      return num(v, d, compact);
  }
}

/** The headline change: percentage points for % metrics, otherwise relative %. */
export function formatChange(abs: number | null | undefined, pct: number | null | undefined, m: Fmt): string | null {
  if (abs === null || abs === undefined) return null;
  const sign = abs > 0 ? "+" : abs < 0 ? "−" : "±";
  if (m.unit === "percent") return `${sign}${num(Math.abs(abs), m.decimals ?? 1)} pts`;
  if (pct !== null && pct !== undefined) return `${sign}${num(Math.abs(pct), 1)}%`;
  return `${sign}${formatValue(Math.abs(abs), m)}`;
}

/** Absolute change with unit, e.g. "+3", "−£0.2M", "+4.2 pts". */
export function formatDelta(abs: number | null | undefined, m: Fmt): string {
  if (abs === null || abs === undefined) return "—";
  const sign = abs > 0 ? "+" : abs < 0 ? "−" : "±";
  if (m.unit === "percent") return `${sign}${num(Math.abs(abs), m.decimals ?? 1)} pts`;
  return `${sign}${formatValue(Math.abs(abs), m)}`;
}

export const STATUS_LABEL: Record<Status, string> = {
  good: "On track",
  warn: "Needs attention",
  bad: "Off track",
  nodata: "No data",
  neutral: "",
};

/** Colour tokens for charts (match --color-good etc. in index.css). */
export const STATUS_COLOR: Record<Status, string> = {
  good: "var(--color-good)",
  warn: "var(--color-warn)",
  bad: "var(--color-bad)",
  nodata: "var(--color-nodata)",
  neutral: "var(--color-accent)",
};

export function formatDate(isoDate: string): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}
