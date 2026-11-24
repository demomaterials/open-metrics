import { AlertTriangle, ArrowDownRight, ArrowRight, ArrowUpRight, Database, MessageSquareText } from "lucide-react";
import { useEffect, useRef } from "react";
import { Area, AreaChart, Bar, BarChart, Cell, Line, LineChart, ResponsiveContainer, YAxis } from "recharts";
import { formatChange, formatValue, STATUS_COLOR, STATUS_LABEL } from "@/lib/format";
import type { Card, CardData, MetricBrief, Point, Status } from "@/lib/types";
import { cn } from "@/lib/utils";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./ui/misc";

const PILL: Record<Status, string> = {
  good: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  warn: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  bad: "bg-rose-500/12 text-rose-700 dark:text-rose-300",
  nodata: "bg-slate-500/10 text-slate-500 dark:text-slate-400",
  neutral: "",
};

export function StatusPill({ status, className }: { status: Status; className?: string }) {
  if (status === "neutral") return null;
  return (
    <span className={cn("inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-medium", PILL[status], className)}>
      <span className="size-1.5 rounded-full" style={{ background: STATUS_COLOR[status] }} />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function ChangeChip({
  data,
  metric,
  large,
}: {
  data: Pick<CardData, "change_abs" | "change_pct" | "trend" | "sentiment">;
  metric: MetricBrief;
  large?: boolean;
}) {
  const text = formatChange(data.change_abs, data.change_pct, metric);
  if (!text) return null;
  const Icon = data.trend === "up" ? ArrowUpRight : data.trend === "down" ? ArrowDownRight : ArrowRight;
  const tone =
    data.sentiment === "positive"
      ? "text-emerald-700 bg-emerald-500/12 dark:text-emerald-300"
      : data.sentiment === "negative"
        ? "text-rose-700 bg-rose-500/12 dark:text-rose-300"
        : "text-slate-600 bg-slate-500/10 dark:text-slate-300";
  return (
    <span className={cn("inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold tabular-nums", tone, large ? "text-sm" : "text-xs")}>
      <Icon className={large ? "size-4" : "size-3.5"} />
      {text}
    </span>
  );
}

type ChartPoint = { label: string; value: number | null };
const toChart = (pts: Point[]): ChartPoint[] => pts.map((p) => ({ label: p.label, value: p.value }));

function domain(pts: ChartPoint[]): [number, number] {
  const v = pts.map((p) => p.value).filter((x): x is number => x !== null);
  if (!v.length) return [0, 1];
  const lo = Math.min(...v);
  const hi = Math.max(...v);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.15;
  return [lo - pad, hi + pad];
}

function Sparkline({ pts, color, height }: { pts: ChartPoint[]; color: string; height: number | `${number}%` }) {
  const lastIdx = pts.map((p) => p.value !== null).lastIndexOf(true);
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={pts} margin={{ top: 6, right: 6, bottom: 4, left: 6 }}>
        <YAxis hide domain={domain(pts)} />
        <Line
          type="monotone"
          dataKey="value"
          stroke={color}
          strokeWidth={2.25}
          connectNulls
          isAnimationActive={false}
          dot={(props: { cx?: number; cy?: number; index?: number }) =>
            props.index === lastIdx && props.cx !== undefined ? (
              <circle key="last" cx={props.cx} cy={props.cy} r={3.5} fill={color} stroke="var(--surface)" strokeWidth={2} />
            ) : (
              <g key={props.index} />
            )
          }
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function AreaSpark({ pts, color, height, id }: { pts: ChartPoint[]; color: string; height: number | `${number}%`; id: string }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={pts} margin={{ top: 6, right: 0, bottom: 0, left: 0 }}>
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <YAxis hide domain={domain(pts)} />
        <Area type="monotone" dataKey="value" stroke={color} strokeWidth={2} fill={`url(#${id})`} connectNulls isAnimationActive={false} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function Bars({ pts, color, height }: { pts: ChartPoint[]; color: string; height: number | `${number}%` }) {
  const [lo] = domain(pts);
  const base = pts.map((p) => ({ ...p, value: p.value === null ? null : p.value - lo }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={base} margin={{ top: 4, right: 0, bottom: 0, left: 0 }} barCategoryGap="22%">
        <YAxis hide domain={[0, "dataMax"]} />
        <Bar dataKey="value" radius={[3, 3, 1, 1]} isAnimationActive={false}>
          {base.map((_, i) => (
            <Cell key={i} fill={color} fillOpacity={i === base.length - 1 ? 0.95 : 0.35} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

function Progress({ value, target, metric, color, present }: { value: number | null; target: number | null; metric: MetricBrief; color: string; present?: boolean }) {
  if (target === null || target === undefined || value === null) {
    return <p className="text-xs text-muted">{value === null ? "No value in range" : "No target configured"}</p>;
  }
  const ratio = metric.direction === "lower_is_better" ? (value ? target / value : 0) : target ? value / target : 0;
  const pct = Math.max(0, Math.min(1, ratio));
  return (
    <div className="flex flex-col gap-2">
      <div className={cn("relative w-full overflow-hidden rounded-full bg-[color-mix(in_oklab,var(--fg)_8%,transparent)]", present ? "h-3" : "h-2.5")}>
        <div className="h-full rounded-full transition-[width] duration-500" style={{ width: `${pct * 100}%`, background: color }} />
      </div>
      <div className="flex justify-between text-xs text-muted tabular-nums">
        <span>{Math.round(ratio * 100)}% of target</span>
        <span>Target {formatValue(target, metric)}</span>
      </div>
    </div>
  );
}

export function NarrativePanel({ title, metric, points }: { title: string; metric: MetricBrief; points: Point[] }) {
  const withText = points.filter((p) => p.narrative);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Chronological order; start scrolled to the most recent entry.
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [withText.length]);
  return (
    <div className="flex flex-col gap-3">
      <div>
        <div className="font-semibold">{title}</div>
        {metric.description && <p className="mt-0.5 text-xs text-muted">{metric.description}</p>}
      </div>
      {withText.length === 0 ? (
        <p className="text-muted">No narrative recorded for this period.</p>
      ) : (
        <div ref={ref} className="flex max-h-72 flex-col gap-3 overflow-y-auto pr-1 scrollbar-thin">
          {withText.map((p, i) => {
            const last = i === withText.length - 1;
            return (
              <div key={p.period_start} className={cn("border-l-2 pl-3", last ? "border-indigo-500" : "border-border")}>
                <div className="flex items-baseline justify-between gap-2 text-xs">
                  <span className={cn("font-medium", last ? "text-fg" : "text-muted")}>{p.label}</span>
                  <span className="tabular-nums text-muted">{formatValue(p.value, metric)}</span>
                </div>
                <p className={cn("mt-0.5 leading-relaxed whitespace-pre-line", last ? "text-fg" : "text-muted")}>{p.narrative}</p>
              </div>
            );
          })}
        </div>
      )}
      <p className="text-[11px] text-muted">Click the card for full history.</p>
    </div>
  );
}

export interface MetricCardProps {
  card: Card;
  data?: CardData;
  loading?: boolean;
  present?: boolean;
  onOpen?: () => void;
}

export default function MetricCard({ card, data, loading, present, onOpen }: MetricCardProps) {
  const m = card.metric;
  const title = card.display_title || m.name;
  const status: Status = data?.status ?? "nodata";
  const color = STATUS_COLOR[status];
  const pts = toChart(data?.points ?? []);
  const latest = data?.latest ?? null;
  const target = card.configuration?.target ?? m.target;
  const showNarrative = card.configuration?.show_narrative !== false;
  // Presentation mode: charts grow to fill the (taller) card.
  const chartH: number | "100%" = present ? "100%" : card.display_type === "area" ? 88 : 60;
  const grow = present && card.display_type !== "progress";

  const body = (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onOpen?.())}
      aria-label={`${title}: ${formatValue(latest?.value, m)}`}
      className={cn(
        "group relative flex h-full cursor-pointer flex-col rounded-2xl border border-border shadow-sm outline-none transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg focus-visible:ring-2 focus-visible:ring-[var(--ring)]",
        `status-${status}`,
        present ? "gap-4 p-7" : "gap-3 p-5",
        loading && "opacity-70",
      )}
      style={{ ["--span" as string]: card.width }}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className={cn("font-medium leading-snug text-muted", present ? "text-lg" : "text-sm")}>{title}</h3>
        <StatusPill status={status} className={present ? "text-xs" : undefined} />
      </div>

      <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
        <span className={cn("font-semibold tracking-tight tabular-nums", present ? "text-6xl" : "text-[2.5rem] leading-none")}>
          {loading && !data ? <span className="inline-block h-10 w-28 animate-pulse rounded-lg bg-surface-2" /> : formatValue(latest?.value, m)}
        </span>
        {data && data.change_abs !== undefined && (
          <div className="flex items-center gap-1.5 pb-1">
            <ChangeChip data={data} metric={m} large={present} />
            {data.first && data.latest && data.first.period_start !== data.latest.period_start && (
              <span className={cn("text-muted", present ? "text-sm" : "text-xs")}>since {data.first.label}</span>
            )}
          </div>
        )}
      </div>

      <div className={cn(grow ? "flex min-h-24 flex-1 flex-col" : "mt-auto")}>
        {data?.error ? (
          <p className="flex items-center gap-1.5 text-xs text-rose-600 dark:text-rose-400">
            <AlertTriangle className="size-3.5" /> {data.error}
          </p>
        ) : pts.length === 0 ? (
          <p className="text-xs text-muted">{loading ? "Loading…" : "No observations in the selected range"}</p>
        ) : card.display_type === "progress" ? (
          <div className={cn(present && "mt-auto")}>
            <Progress value={latest?.value ?? null} target={target ?? null} metric={m} color={color} present={present} />
          </div>
        ) : card.display_type === "area" ? (
          <div className={present ? "-mx-7 -mb-7 min-h-28 flex-1" : "-mx-5 -mb-5"}>
            <AreaSpark pts={pts} color={color} height={chartH} id={`g${card.id}`} />
          </div>
        ) : card.display_type === "trend" ? (
          <div className={cn("flex flex-col gap-2", grow && "flex-1")}>
            {grow ? (
              <div className="min-h-20 flex-1">
                <Bars pts={pts} color={color} height="100%" />
              </div>
            ) : (
              <Bars pts={pts} color={color} height={48} />
            )}
            {data?.first && data.latest && (
              <div className="flex justify-between text-xs text-muted tabular-nums">
                <span>
                  {data.first.label}: {formatValue(data.first.value, m)}
                </span>
                <span>
                  {data.latest.label}: {formatValue(data.latest.value, m)}
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className={cn(grow && "min-h-20 flex-1")}>
            <Sparkline pts={pts} color={color} height={chartH} />
          </div>
        )}
      </div>

      {card.display_type !== "area" && (
        <div className={cn("flex items-center justify-between gap-2 text-muted", present ? "text-sm" : "text-xs")}>
          <span>{latest ? `Latest: ${latest.label}` : " "}</span>
          <span className="flex items-center gap-2">
            {m.source_type === "external" && <Database className="size-3.5" aria-label="External source" />}
            {showNarrative && latest?.narrative && (
              <MessageSquareText className="size-3.5 opacity-60 transition group-hover:opacity-100" aria-label="Has narrative" />
            )}
          </span>
        </div>
      )}
    </div>
  );

  if (!showNarrative || !data) return body;
  return (
    <HoverCard openDelay={250} closeDelay={80}>
      <HoverCardTrigger asChild>{body}</HoverCardTrigger>
      <HoverCardContent side="bottom" align="start">
        <NarrativePanel title={title} metric={m} points={data.points ?? []} />
      </HoverCardContent>
    </HoverCard>
  );
}
