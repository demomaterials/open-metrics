/**
 * The board-wide reporting range. A selection is expressed in the units the
 * user picked (ISO weeks, months, quarters or dates) and converted to a closed
 * date interval [from, to] that every card on the board is evaluated against.
 * All arithmetic is done in UTC so local time zones cannot shift a day.
 */
import type { DefaultRange } from "./types";

export type RangeMode = "week" | "month" | "quarter" | "custom";

export interface RangeSel {
  mode: RangeMode;
  /** week "2026-W10" · month "2026-03" · quarter "2026-Q1" · custom "2026-03-02" */
  from: string;
  to: string;
}

const DAY = 86_400_000;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const utc = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d));
export const iso = (d: Date) => d.toISOString().slice(0, 10);
export const parseIso = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  return utc(y, m - 1, d);
};
const pad = (n: number) => String(n).padStart(2, "0");

export function isoWeekStart(year: number, week: number): Date {
  const jan4 = utc(year, 0, 4);
  const dow = (jan4.getUTCDay() + 6) % 7; // Monday = 0
  return new Date(jan4.getTime() - dow * DAY + (week - 1) * 7 * DAY);
}

export function isoWeekOf(d: Date): { year: number; week: number } {
  const t = utc(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  const dow = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dow + 3); // Thursday of this week
  const year = t.getUTCFullYear();
  const week = 1 + Math.round((t.getTime() - isoWeekStart(year, 1).getTime() - 3 * DAY) / (7 * DAY));
  return { year, week };
}

export const weeksInYear = (year: number) => isoWeekOf(utc(year, 11, 28)).week;

function parseToken(mode: RangeMode, token: string): { y: number; n: number } {
  if (mode === "week") {
    const [y, w] = token.split("-W");
    return { y: Number(y), n: Number(w) };
  }
  if (mode === "quarter") {
    const [y, q] = token.split("-Q");
    return { y: Number(y), n: Number(q) };
  }
  const [y, m] = token.split("-");
  return { y: Number(y), n: Number(m) };
}

export const weekToken = (y: number, w: number) => `${y}-W${pad(w)}`;
export const monthToken = (y: number, m: number) => `${y}-${pad(m)}`;
export const quarterToken = (y: number, q: number) => `${y}-Q${q}`;

/** First and last calendar day covered by a token. */
export function tokenBounds(mode: RangeMode, token: string): [Date, Date] {
  if (mode === "custom") return [parseIso(token), parseIso(token)];
  const { y, n } = parseToken(mode, token);
  if (mode === "week") {
    const s = isoWeekStart(y, n);
    return [s, new Date(s.getTime() + 6 * DAY)];
  }
  if (mode === "month") return [utc(y, n - 1, 1), utc(y, n, 0)];
  return [utc(y, (n - 1) * 3, 1), utc(y, n * 3, 0)];
}

export function toDates(sel: RangeSel): { from: string; to: string } {
  const a = tokenBounds(sel.mode, sel.from)[0];
  const b = tokenBounds(sel.mode, sel.to)[1];
  return a <= b ? { from: iso(a), to: iso(b) } : { from: iso(tokenBounds(sel.mode, sel.to)[0]), to: iso(tokenBounds(sel.mode, sel.from)[1]) };
}

export function tokenFor(mode: RangeMode, d: Date): string {
  if (mode === "week") {
    const { year, week } = isoWeekOf(d);
    return weekToken(year, week);
  }
  if (mode === "month") return monthToken(d.getUTCFullYear(), d.getUTCMonth() + 1);
  if (mode === "quarter") return quarterToken(d.getUTCFullYear(), Math.floor(d.getUTCMonth() / 3) + 1);
  return iso(d);
}

/** Step a token by n periods (negative = back). */
export function shiftToken(mode: RangeMode, token: string, n: number): string {
  const [start] = tokenBounds(mode, token);
  if (mode === "week") return tokenFor(mode, new Date(start.getTime() + n * 7 * DAY));
  if (mode === "custom") return iso(new Date(start.getTime() + n * DAY));
  const months = mode === "month" ? n : n * 3;
  return tokenFor(mode, utc(start.getUTCFullYear(), start.getUTCMonth() + months, 1));
}

export function lastN(mode: Exclude<RangeMode, "custom">, n: number, today = new Date()): RangeSel {
  const to = tokenFor(mode, today);
  return { mode, from: shiftToken(mode, to, -(Math.max(1, n) - 1)), to };
}

export function defaultSel(dr: DefaultRange | undefined, today = new Date()): RangeSel {
  return lastN(dr?.mode ?? "week", dr?.periods ?? 12, today);
}

/** Convert a selection to another mode, keeping (roughly) the same span. */
export function convertSel(sel: RangeSel, mode: RangeMode): RangeSel {
  const { from, to } = toDates(sel);
  return { mode, from: tokenFor(mode, parseIso(from)), to: tokenFor(mode, parseIso(to)) };
}

export function isValidSel(sel: Partial<RangeSel>): sel is RangeSel {
  const re: Record<RangeMode, RegExp> = {
    week: /^\d{4}-W\d{2}$/,
    month: /^\d{4}-\d{2}$/,
    quarter: /^\d{4}-Q[1-4]$/,
    custom: /^\d{4}-\d{2}-\d{2}$/,
  };
  return !!sel.mode && sel.mode in re && re[sel.mode].test(sel.from ?? "") && re[sel.mode].test(sel.to ?? "");
}

function fmtDay(d: Date) {
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Human label, e.g. "Week 10 – Week 28, 2026" or "March – July 2026". */
export function rangeLabel(sel: RangeSel): string {
  if (sel.mode === "custom") {
    const { from, to } = toDates(sel);
    return `${fmtDay(parseIso(from))} – ${fmtDay(parseIso(to))}`;
  }
  const a = parseToken(sel.mode, sel.from);
  const b = parseToken(sel.mode, sel.to);
  const unit = (p: { n: number }) =>
    sel.mode === "week" ? `Week ${p.n}` : sel.mode === "month" ? MONTH_NAMES[p.n - 1] : `Q${p.n}`;
  if (sel.from === sel.to) return sel.mode === "week" ? `${unit(a)}, ${a.y}` : `${unit(a)} ${a.y}`;
  if (a.y === b.y) return sel.mode === "month" ? `${unit(a)} – ${unit(b)} ${a.y}` : `${unit(a)} – ${unit(b)}, ${a.y}`;
  return sel.mode === "month" ? `${unit(a)} ${a.y} – ${unit(b)} ${b.y}` : `${unit(a)}, ${a.y} – ${unit(b)}, ${b.y}`;
}

export function selFromParams(p: URLSearchParams): RangeSel | null {
  const sel = { mode: p.get("mode") as RangeMode, from: p.get("from") ?? "", to: p.get("to") ?? "" };
  return isValidSel(sel) ? sel : null;
}

export const PRESETS: { label: string; sel: (today?: Date) => RangeSel }[] = [
  { label: "Last 4 weeks", sel: (t) => lastN("week", 4, t) },
  { label: "Last 12 weeks", sel: (t) => lastN("week", 12, t) },
  { label: "Last 26 weeks", sel: (t) => lastN("week", 26, t) },
  { label: "Last 6 months", sel: (t) => lastN("month", 6, t) },
  { label: "Last 12 months", sel: (t) => lastN("month", 12, t) },
  {
    label: "Year to date (weeks)",
    sel: (t = new Date()) => ({ mode: "week", from: weekToken(isoWeekOf(t).year, 1), to: tokenFor("week", t) }),
  },
  {
    label: "Year to date (months)",
    sel: (t = new Date()) => ({ mode: "month", from: monthToken(t.getUTCFullYear(), 1), to: tokenFor("month", t) }),
  },
  { label: "Last 4 quarters", sel: (t) => lastN("quarter", 4, t) },
];
