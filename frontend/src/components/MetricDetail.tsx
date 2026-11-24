import { useQuery } from "@tanstack/react-query";
import {
  Area,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { get, qs } from "@/lib/api";
import { formatDate, formatDelta, formatValue, STATUS_COLOR } from "@/lib/format";
import type { Card, Point, SeriesResponse } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChangeChip, StatusPill } from "./MetricCard";
import { Dialog, DialogContent } from "./ui/dialog";
import { Spinner, Tabs, TabsContent, TabsList, TabsTrigger } from "./ui/misc";

function Stat({ label, value, sub }: { label: string; value: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border bg-surface-2/60 px-4 py-3">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-muted">{sub}</div>}
    </div>
  );
}

function ChartTooltip({ active, payload, card }: { active?: boolean; payload?: { payload: Point }[]; card: Card }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="max-w-xs rounded-lg border border-border bg-surface p-3 text-xs shadow-lg">
      <div className="flex justify-between gap-4">
        <span className="font-medium">{p.label}</span>
        <span className="font-semibold tabular-nums">{formatValue(p.value, card.metric)}</span>
      </div>
      {p.narrative && <p className="mt-1.5 line-clamp-5 leading-relaxed text-muted">{p.narrative}</p>}
    </div>
  );
}

export default function MetricDetail({
  card,
  range,
  rangeLabel,
  open,
  onOpenChange,
}: {
  card: Card | null;
  range: { from: string; to: string };
  rangeLabel: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const q = useQuery({
    queryKey: ["series", card?.metric_id, card?.id, range.from, range.to],
    queryFn: () => get<SeriesResponse>(`/api/metrics/${card!.metric_id}/series${qs({ ...range, card_id: card!.id })}`),
    enabled: open && !!card,
  });
  if (!card) return null;
  const m = card.metric;
  const thresholds = card.colour_thresholds ?? m.thresholds;
  const s = q.data?.summary;
  const history = q.data?.history ?? [];
  const inRange = s?.points ?? [];
  const status = s?.status ?? "nodata";
  const color = STATUS_COLOR[status];
  const firstIn = inRange[0]?.label;
  const lastIn = inRange[inRange.length - 1]?.label;
  const prev = q.data?.previous;
  const prevDelta = s?.latest && prev && s.latest.value !== null && prev.value !== null ? s.latest.value - prev.value : null;
  const prevPct = prevDelta !== null && prev?.value ? (prevDelta / Math.abs(prev.value)) * 100 : null;
  const prevTrend = prevDelta === null ? null : prevDelta > 0 ? "up" : prevDelta < 0 ? "down" : "flat";
  const prevSentiment =
    prevDelta === null || prevDelta === 0 || m.direction === "neutral"
      ? "neutral"
      : (prevDelta > 0) === (m.direction === "higher_is_better")
        ? "positive"
        : "negative";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-5xl"
        title={
          <span className="flex flex-wrap items-center gap-3">
            {card.display_title || m.name}
            <StatusPill status={status} />
          </span>
        }
        description={m.description || undefined}
      >
        {q.isLoading ? (
          <div className="grid h-80 place-items-center text-muted">
            <Spinner />
          </div>
        ) : q.isError ? (
          <p className="text-rose-600">{(q.error as Error).message}</p>
        ) : (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat
                label={`Latest${s?.latest ? ` · ${s.latest.label}` : ""}`}
                value={<span style={{ color: status === "neutral" ? undefined : color }}>{formatValue(s?.latest?.value, m)}</span>}
              />
              <Stat
                label="vs previous period"
                value={
                  prevDelta === null ? (
                    "—"
                  ) : (
                    <ChangeChip large metric={m} data={{ change_abs: prevDelta, change_pct: prevPct, trend: prevTrend, sentiment: prevSentiment }} />
                  )
                }
                sub={prev ? `${prev.label}: ${formatValue(prev.value, m)}` : "No earlier observation"}
              />
              <Stat
                label="Change over range"
                value={s?.change_abs !== null && s?.change_abs !== undefined ? <ChangeChip large metric={m} data={s} /> : "—"}
                sub={s?.change_abs !== null && s?.change_abs !== undefined ? `${formatDelta(s.change_abs, m)} · ${firstIn} → ${lastIn}` : rangeLabel}
              />
              <Stat
                label="Range min · avg · max"
                value={<span className="text-base">{formatValue(s?.min, m)} · {formatValue(s?.avg, m)} · {formatValue(s?.max, m)}</span>}
                sub={`${s?.count ?? 0} observations`}
              />
            </div>

            <div className="rounded-xl border border-border p-3 pt-4">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2 px-1 text-xs text-muted">
                <span>Full history · shaded area is the selected range ({rangeLabel})</span>
                {thresholds?.green !== null && thresholds?.green !== undefined && (
                  <span className="flex gap-3">
                    <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-[var(--color-good)]" /> Green {formatValue(thresholds.green, m)}</span>
                    {thresholds.amber !== null && <span className="flex items-center gap-1"><span className="h-0.5 w-3 bg-[var(--color-warn)]" /> Amber {formatValue(thresholds.amber, m)}</span>}
                  </span>
                )}
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={history} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="detail-grad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--border)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} minTickGap={24} />
                  <YAxis
                    tick={{ fontSize: 11, fill: "var(--muted)" }}
                    tickLine={false}
                    axisLine={false}
                    width={64}
                    domain={["auto", "auto"]}
                    tickFormatter={(v: number) => formatValue(v, { ...m, decimals: Math.min(m.decimals, 1) })}
                  />
                  {firstIn && lastIn && <ReferenceArea x1={firstIn} x2={lastIn} fill="var(--color-accent)" fillOpacity={0.07} />}
                  {thresholds?.green !== null && thresholds?.green !== undefined && (
                    <ReferenceLine y={thresholds.green} stroke="var(--color-good)" strokeDasharray="4 4" ifOverflow="extendDomain" />
                  )}
                  {thresholds?.amber !== null && thresholds?.amber !== undefined && (
                    <ReferenceLine y={thresholds.amber} stroke="var(--color-warn)" strokeDasharray="4 4" ifOverflow="extendDomain" />
                  )}
                  <Tooltip content={<ChartTooltip card={card} />} />
                  <Area type="monotone" dataKey="value" stroke="none" fill="url(#detail-grad)" connectNulls isAnimationActive={false} />
                  <Line type="monotone" dataKey="value" stroke={color} strokeWidth={2.25} dot={false} activeDot={{ r: 4 }} connectNulls isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>

            <Tabs defaultValue="narrative">
              <TabsList>
                <TabsTrigger value="narrative">Narrative history</TabsTrigger>
                <TabsTrigger value="values">Values ({inRange.length})</TabsTrigger>
                <TabsTrigger value="all">All values ({history.length})</TabsTrigger>
              </TabsList>
              <TabsContent value="narrative" className="mt-4">
                <div className="flex flex-col gap-4">
                  {inRange.filter((p) => p.narrative).length === 0 && <p className="text-sm text-muted">No narrative recorded in the selected range.</p>}
                  {inRange
                    .filter((p) => p.narrative)
                    .map((p, i, arr) => (
                      <div key={p.period_start} className="flex gap-4">
                        <div className="flex flex-col items-center">
                          <span className={cn("mt-1.5 size-2.5 rounded-full", i === arr.length - 1 ? "bg-indigo-500" : "bg-border")} />
                          {i < arr.length - 1 && <span className="w-px flex-1 bg-border" />}
                        </div>
                        <div className="pb-1">
                          <div className="flex items-baseline gap-3 text-sm">
                            <span className="font-medium">{p.label}</span>
                            <span className="tabular-nums text-muted">{formatValue(p.value, m)}</span>
                          </div>
                          <p className="mt-1 text-sm leading-relaxed text-muted whitespace-pre-line">{p.narrative}</p>
                        </div>
                      </div>
                    ))}
                </div>
              </TabsContent>
              {(["values", "all"] as const).map((tab) => (
                <TabsContent key={tab} value={tab} className="mt-4">
                  <ValuesTable points={tab === "values" ? inRange : history} card={card} />
                </TabsContent>
              ))}
            </Tabs>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ValuesTable({ points, card }: { points: Point[]; card: Card }) {
  const rows = [...points].reverse();
  return (
    <div className="max-h-96 overflow-auto rounded-xl border border-border scrollbar-thin">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-surface-2 text-left text-xs text-muted">
          <tr>
            <th className="px-3 py-2 font-medium">Period</th>
            <th className="px-3 py-2 font-medium">Dates</th>
            <th className="px-3 py-2 text-right font-medium">Value</th>
            <th className="px-3 py-2 text-right font-medium">Change</th>
            <th className="px-3 py-2 font-medium">Narrative</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((p, i) => {
            const before = rows[i + 1];
            const d = p.value !== null && before?.value !== null && before ? p.value - before.value! : null;
            return (
              <tr key={p.period_start} className="border-t border-border align-top">
                <td className="whitespace-nowrap px-3 py-2 font-medium">{p.label}</td>
                <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">
                  {formatDate(p.period_start)} – {formatDate(p.period_end)}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{formatValue(p.value, card.metric)}</td>
                <td className="px-3 py-2 text-right text-xs tabular-nums text-muted">{d === null ? "" : formatDelta(d, card.metric)}</td>
                <td className="px-3 py-2 text-xs text-muted">{p.narrative}</td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="px-3 py-6 text-center text-muted">
                No values
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
