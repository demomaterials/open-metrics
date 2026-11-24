import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Database, PenLine, Play } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import { Panel, Spinner } from "@/components/ui/misc";
import { get, post, put, qs } from "@/lib/api";
import { formatValue } from "@/lib/format";
import type { Column, DataSource, Metric, MetricInput, Point } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "./AdminLayout";

const EMPTY: MetricInput = {
  name: "",
  description: "",
  unit: "number",
  unit_label: "",
  decimals: 1,
  direction: "higher_is_better",
  period_type: "week",
  thresholds: { green: null, amber: null },
  target: null,
  source_type: "managed",
  data_source_id: null,
  source_schema: "public",
  source_table: null,
  date_column: null,
  value_column: null,
  narrative_column: null,
  aggregation: "sum",
};

function Section({ step, title, description, children }: { step: number; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Panel className="p-6">
      <div className="mb-5 flex gap-3">
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-indigo-500/15 text-xs font-semibold text-indigo-700 dark:text-indigo-300">{step}</span>
        <div>
          <h2 className="font-semibold">{title}</h2>
          {description && <p className="text-sm text-muted">{description}</p>}
        </div>
      </div>
      {children}
    </Panel>
  );
}

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

export default function MetricEditor() {
  const { metricId } = useParams();
  const isNew = !metricId;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const existing = useQuery({ queryKey: ["metric", metricId], queryFn: () => get<Metric>(`/api/metrics/${metricId}`), enabled: !isNew });
  const sources = useQuery({ queryKey: ["datasources"], queryFn: () => get<DataSource[]>("/api/datasources") });
  const [m, setM] = useState<MetricInput>(EMPTY);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ points?: Point[]; error?: string; loading?: boolean }>({});

  useEffect(() => {
    if (existing.data) setM({ ...EMPTY, ...existing.data, thresholds: existing.data.thresholds ?? { green: null, amber: null } });
  }, [existing.data]);

  const set = <K extends keyof MetricInput>(k: K, v: MetricInput[K]) => setM((p) => ({ ...p, [k]: v }));
  const ext = m.source_type === "external";
  const dsId = m.data_source_id;

  const schemas = useQuery({
    queryKey: ["ds-schemas", dsId],
    queryFn: () => get<string[]>(`/api/datasources/${dsId}/schemas`),
    enabled: ext && !!dsId,
  });
  const tables = useQuery({
    queryKey: ["ds-tables", dsId, m.source_schema],
    queryFn: () => get<{ name: string; type: string }[]>(`/api/datasources/${dsId}/tables${qs({ schema: m.source_schema })}`),
    enabled: ext && !!dsId && !!m.source_schema,
  });
  const columns = useQuery({
    queryKey: ["ds-columns", dsId, m.source_schema, m.source_table],
    queryFn: () => get<Column[]>(`/api/datasources/${dsId}/columns${qs({ schema: m.source_schema, table: m.source_table })}`),
    enabled: ext && !!dsId && !!m.source_schema && !!m.source_table,
  });
  const cols = columns.data ?? [];
  const mappingReady = ext && dsId && m.source_table && m.date_column && m.value_column;

  const runPreview = async () => {
    setPreview({ loading: true });
    try {
      const r = await post<{ points: Point[] }>("/api/metrics/preview", {
        data_source_id: dsId,
        source_schema: m.source_schema,
        source_table: m.source_table,
        date_column: m.date_column,
        value_column: m.value_column,
        narrative_column: m.narrative_column || null,
        aggregation: m.aggregation,
        period_type: m.period_type,
        limit: 24,
      });
      setPreview({ points: r.points });
    } catch (e) {
      setPreview({ error: (e as Error).message });
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const body = {
        ...m,
        thresholds: m.thresholds?.green === null || m.thresholds?.green === undefined ? null : m.thresholds,
      };
      const saved = isNew ? await post<Metric>("/api/metrics", body) : await put<Metric>(`/api/metrics/${metricId}`, body);
      toast.success(isNew ? "Metric created" : "Metric saved");
      qc.invalidateQueries();
      navigate(isNew && saved.source_type === "managed" ? `/admin/metrics/${saved.id}/values` : "/admin/metrics");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!isNew && existing.isLoading) return <Spinner />;
  const fmt = { unit: m.unit, unit_label: m.unit_label, decimals: m.decimals };
  const cmp = m.direction === "lower_is_better" ? "≤" : "≥";

  return (
    <form onSubmit={save} className="flex flex-col gap-5">
      <PageHeader
        title={isNew ? "New metric" : `Edit ${existing.data?.name ?? "metric"}`}
        description="A metric is defined once and can appear on several boards."
        actions={
          <>
            {!isNew && m.source_type === "managed" && (
              <Link to={`/admin/metrics/${metricId}/values`} className="text-sm font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                Edit values →
              </Link>
            )}
            <Button type="submit" disabled={busy}>
              <Check /> {isNew ? "Create metric" : "Save metric"}
            </Button>
          </>
        }
      />

      <Section step={1} title="Definition">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name">
            <Input value={m.name} onChange={(e) => set("name", e.target.value)} required maxLength={160} placeholder="Customer satisfaction" />
          </Field>
          <Field label="Reporting period" hint="How often a new value is reported. External data is grouped into these periods.">
            <Select value={m.period_type} onChange={(e) => set("period_type", e.target.value as MetricInput["period_type"])}>
              <option value="week">Weekly (ISO weeks)</option>
              <option value="month">Monthly</option>
              <option value="quarter">Quarterly</option>
              <option value="day">Daily</option>
            </Select>
          </Field>
          <Field label="Description" className="md:col-span-2" hint="Shown in the narrative popover and detail view.">
            <Textarea value={m.description} onChange={(e) => set("description", e.target.value)} rows={2} />
          </Field>
        </div>
      </Section>

      <Section step={2} title="Display & performance" description="How values are formatted and when a card turns green, amber or red.">
        <div className="grid gap-4 md:grid-cols-4">
          <Field label="Unit">
            <Select value={m.unit} onChange={(e) => set("unit", e.target.value as MetricInput["unit"])}>
              <option value="number">Number</option>
              <option value="percent">Percentage</option>
              <option value="currency">Currency</option>
              <option value="days">Days</option>
              <option value="hours">Hours</option>
              <option value="ratio">Ratio</option>
              <option value="custom">Custom suffix</option>
            </Select>
          </Field>
          <Field label={m.unit === "currency" ? "Currency symbol" : "Suffix"}>
            <Input value={m.unit_label} maxLength={16} disabled={!["currency", "custom"].includes(m.unit)} onChange={(e) => set("unit_label", e.target.value)} placeholder={m.unit === "currency" ? "£" : ""} />
          </Field>
          <Field label="Decimals">
            <Input type="number" min={0} max={6} value={m.decimals} onChange={(e) => set("decimals", Number(e.target.value))} />
          </Field>
          <Field label="Direction">
            <Select value={m.direction} onChange={(e) => set("direction", e.target.value as MetricInput["direction"])}>
              <option value="higher_is_better">Higher is better</option>
              <option value="lower_is_better">Lower is better</option>
              <option value="neutral">Neutral</option>
            </Select>
          </Field>
          <Field label={`Green when value ${cmp}`}>
            <Input type="number" step="any" value={m.thresholds?.green ?? ""} onChange={(e) => set("thresholds", { green: numOrNull(e.target.value), amber: m.thresholds?.amber ?? null })} />
          </Field>
          <Field label={`Amber when value ${cmp}`}>
            <Input type="number" step="any" value={m.thresholds?.amber ?? ""} onChange={(e) => set("thresholds", { green: m.thresholds?.green ?? null, amber: numOrNull(e.target.value) })} />
          </Field>
          <Field label="Target" hint="Used by progress cards.">
            <Input type="number" step="any" value={m.target ?? ""} onChange={(e) => set("target", numOrNull(e.target.value))} />
          </Field>
          <div className="flex flex-col justify-end gap-1 text-xs text-muted">
            <span>Example: {formatValue(1234.5678, fmt)}</span>
            {m.thresholds?.green !== null && m.thresholds?.green !== undefined ? (
              <span>
                <b className="text-emerald-600">Green</b> {cmp} {m.thresholds.green}
                {m.thresholds.amber !== null && <>, <b className="text-amber-600">amber</b> {cmp} {m.thresholds.amber}</>}, otherwise <b className="text-rose-600">red</b>.
              </span>
            ) : (
              <span>No thresholds: cards stay neutral.</span>
            )}
          </div>
        </div>
      </Section>

      <Section step={3} title="Data" description="Where the values come from.">
        <div className="mb-5 grid gap-3 md:grid-cols-2">
          {(
            [
              ["managed", PenLine, "Managed in open-metrics", "Enter values and narratives by hand or import a CSV file."],
              ["external", Database, "External PostgreSQL table", "Map date, value and narrative columns of an existing table or view."],
            ] as const
          ).map(([kind, Icon, title, text]) => (
            <button
              type="button"
              key={kind}
              onClick={() => set("source_type", kind)}
              className={cn(
                "flex cursor-pointer gap-3 rounded-xl border p-4 text-left transition",
                m.source_type === kind ? "border-indigo-500 ring-2 ring-indigo-500/25" : "border-border hover:bg-surface-2",
              )}
            >
              <Icon className="mt-0.5 size-5 text-indigo-600 dark:text-indigo-400" />
              <div>
                <div className="font-medium">{title}</div>
                <div className="text-sm text-muted">{text}</div>
              </div>
            </button>
          ))}
        </div>

        {ext && (
          <div className="flex flex-col gap-4">
            {sources.data?.length === 0 && (
              <p className="rounded-lg bg-amber-500/10 px-3 py-2 text-sm">
                No data sources yet. <Link to="/admin/sources" className="font-medium underline">Add a connection</Link> first.
              </p>
            )}
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="Data source">
                <Select
                  value={dsId ?? ""}
                  onChange={(e) => setM((p) => ({ ...p, data_source_id: Number(e.target.value) || null, source_table: null, date_column: null, value_column: null, narrative_column: null }))}
                  required
                >
                  <option value="">Select…</option>
                  {sources.data?.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Schema" hint={schemas.isError ? <span className="text-rose-600">{(schemas.error as Error).message}</span> : undefined}>
                <Select
                  value={m.source_schema ?? ""}
                  disabled={!schemas.data}
                  onChange={(e) => setM((p) => ({ ...p, source_schema: e.target.value, source_table: null, date_column: null, value_column: null, narrative_column: null }))}
                >
                  {!schemas.data?.includes(m.source_schema ?? "") && <option value={m.source_schema ?? ""}>{m.source_schema}</option>}
                  {schemas.data?.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Table or view">
                <Select
                  value={m.source_table ?? ""}
                  disabled={!tables.data}
                  onChange={(e) => setM((p) => ({ ...p, source_table: e.target.value || null, date_column: null, value_column: null, narrative_column: null }))}
                  required
                >
                  <option value="">Select…</option>
                  {tables.data?.map((t) => (
                    <option key={t.name} value={t.name}>{t.name}{t.type === "view" ? " (view)" : ""}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Date column">
                <Select value={m.date_column ?? ""} disabled={!cols.length} onChange={(e) => set("date_column", e.target.value || null)} required>
                  <option value="">Select…</option>
                  {cols.filter((c) => c.kind === "date").map((c) => (
                    <option key={c.name} value={c.name}>{c.name} · {c.data_type}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Value column">
                <Select value={m.value_column ?? ""} disabled={!cols.length} onChange={(e) => set("value_column", e.target.value || null)} required>
                  <option value="">Select…</option>
                  {cols.filter((c) => c.kind === "numeric" || m.aggregation === "count").map((c) => (
                    <option key={c.name} value={c.name}>{c.name} · {c.data_type}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Narrative column (optional)">
                <Select value={m.narrative_column ?? ""} disabled={!cols.length} onChange={(e) => set("narrative_column", e.target.value || null)}>
                  <option value="">None</option>
                  {cols.filter((c) => c.kind === "text").map((c) => (
                    <option key={c.name} value={c.name}>{c.name} · {c.data_type}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Aggregation per period" hint="Rows in the same period are combined with this function. 'Last' takes the latest row; narrative always uses the latest non-empty text.">
                <Select value={m.aggregation} onChange={(e) => set("aggregation", e.target.value as MetricInput["aggregation"])}>
                  <option value="sum">Sum</option>
                  <option value="avg">Average</option>
                  <option value="min">Minimum</option>
                  <option value="max">Maximum</option>
                  <option value="count">Count of rows</option>
                  <option value="last">Last value</option>
                </Select>
              </Field>
              <div className="flex items-end md:col-span-2">
                <Button type="button" variant="secondary" disabled={!mappingReady || preview.loading} onClick={runPreview}>
                  {preview.loading ? <Spinner /> : <Play />} Preview data
                </Button>
              </div>
            </div>

            {preview.error && <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-700 dark:text-rose-300">{preview.error}</p>}
            {preview.points && (
              <div className="grid gap-4 rounded-xl border border-border p-4 lg:grid-cols-[1fr_22rem]">
                <div>
                  <div className="mb-2 text-xs text-muted">Last {preview.points.length} {m.period_type}s</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={preview.points}>
                      <CartesianGrid vertical={false} stroke="var(--border)" />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} minTickGap={20} />
                      <YAxis tick={{ fontSize: 11, fill: "var(--muted)" }} tickLine={false} axisLine={false} width={60} tickFormatter={(v: number) => formatValue(v, fmt)} />
                      <Tooltip formatter={(v) => formatValue(Number(v), fmt)} contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8 }} />
                      <Area type="monotone" dataKey="value" stroke="var(--color-accent)" fill="var(--color-accent)" fillOpacity={0.12} strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="max-h-64 overflow-auto text-xs scrollbar-thin">
                  <table className="w-full">
                    <tbody>
                      {[...preview.points].reverse().map((p) => (
                        <tr key={p.period_start} className="border-b border-border align-top">
                          <td className="py-1.5 pr-2 font-medium whitespace-nowrap">{p.label}</td>
                          <td className="py-1.5 pr-2 text-right tabular-nums">{formatValue(p.value, fmt)}</td>
                          <td className="py-1.5 text-muted">{p.narrative}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {preview.points.length === 0 && <p className="text-muted">The mapping returned no rows.</p>}
                </div>
              </div>
            )}
          </div>
        )}
        {!ext && (
          <p className="text-sm text-muted">
            {isNew ? "After creating the metric you can enter values and narratives, or import a CSV file." : "Values are stored in open-metrics."}
          </p>
        )}
      </Section>
    </form>
  );
}
