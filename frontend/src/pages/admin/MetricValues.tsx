import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FileUp, Pencil, Plus, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Badge, Panel, Spinner } from "@/components/ui/misc";
import { del, get, post, put } from "@/lib/api";
import { formatDate, formatValue } from "@/lib/format";
import { iso, isoWeekOf, tokenFor } from "@/lib/range";
import type { ImportResult, Metric, MetricValue } from "@/lib/types";
import { PageHeader, Table, Td, Th, confirmAction } from "./AdminLayout";

function ValueForm({
  metric,
  initial,
  onSubmit,
}: {
  metric: Metric;
  initial?: MetricValue;
  onSubmit: (v: { period_start: string; value: number | null; narrative: string }) => Promise<void>;
}) {
  const [date, setDate] = useState(initial?.period_start ?? iso(new Date()));
  const [value, setValue] = useState(initial?.value?.toString() ?? "");
  const [narrative, setNarrative] = useState(initial?.narrative ?? "");
  const [busy, setBusy] = useState(false);
  const d = new Date(`${date}T00:00:00Z`);
  const hint =
    metric.period_type === "week"
      ? `ISO week ${isoWeekOf(d).week}, ${isoWeekOf(d).year} (snaps to its Monday)`
      : metric.period_type === "month"
        ? `${d.toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" })}`
        : metric.period_type === "quarter"
          ? tokenFor("quarter", d).replace("-", " ")
          : "";
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSubmit({ period_start: date, value: value.trim() === "" ? null : Number(value), narrative });
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Any date in the period" hint={hint}>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>
        <Field label={`Value${metric.unit === "percent" ? " (%)" : ""}`}>
          <Input type="number" step="any" value={value} onChange={(e) => setValue(e.target.value)} autoFocus />
        </Field>
      </div>
      <Field label="Narrative" hint="Explain the result: drivers, context and actions. Shown when hovering the card.">
        <Textarea value={narrative} onChange={(e) => setNarrative(e.target.value)} rows={5} />
      </Field>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>Save value</Button>
      </div>
    </form>
  );
}

const TEMPLATE = {
  week: "period,value,narrative\n2026-W10,87.4,\"Improved after faster response times.\"\n2026-W11,88.1,\n",
  month: "period,value,narrative\n2026-03,12.8,\"Strong renewals in corporate accounts.\"\n2026-04,13.1,\n",
  quarter: "period,value,narrative\n2026-Q1,92,\"Ahead of plan.\"\n2026-Q2,94,\n",
  day: "period,value,narrative\n2026-03-02,140,\n2026-03-03,152,\n",
};

function CsvImport({ metric, onDone }: { metric: Metric; onDone: () => void }) {
  const [csv, setCsv] = useState("");
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const run = async (dry: boolean) => {
    setBusy(true);
    try {
      const r = await post<ImportResult>(`/api/metrics/${metric.id}/values/import`, { csv, dry_run: dry });
      setResult(r);
      if (!dry) {
        toast.success(`Imported ${r.inserted} new and ${r.updated} updated values`);
        setCsv("");
        setResult(null);
        onDone();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const template = TEMPLATE[metric.period_type];
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted">
        Columns: <code>period</code> (2026-W10, 2026-03, 2026-Q1 or a date), <code>value</code>, optional <code>narrative</code> and{" "}
        <code>period_end</code>. Existing periods are updated.
      </p>
      <div className="flex gap-2">
        <input
          ref={file}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) {
              setCsv(await f.text());
              setResult(null);
            }
            e.target.value = "";
          }}
        />
        <Button variant="secondary" onClick={() => file.current?.click()}>
          <FileUp /> Choose file
        </Button>
        <a
          className="inline-flex items-center gap-1.5 text-sm text-indigo-600 hover:underline dark:text-indigo-400"
          href={`data:text/csv;charset=utf-8,${encodeURIComponent(template)}`}
          download={`${metric.name.toLowerCase().replace(/\W+/g, "-")}-template.csv`}
        >
          <Download className="size-4" /> Template
        </a>
      </div>
      <Textarea value={csv} onChange={(e) => (setCsv(e.target.value), setResult(null))} rows={8} placeholder={template} className="font-mono text-xs" />
      {result && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-2">
            <Badge tone="good">{result.inserted} new</Badge>
            <Badge tone="accent">{result.updated} updates</Badge>
            {result.errors > 0 && <Badge tone="bad">{result.errors} errors</Badge>}
          </div>
          <div className="max-h-56 overflow-auto rounded-lg border border-border text-xs scrollbar-thin">
            <table className="w-full">
              <tbody>
                {result.rows.map((r) => (
                  <tr key={r.line} className="border-b border-border">
                    <td className="px-2 py-1 text-muted">#{r.line}</td>
                    <td className="px-2 py-1">{r.label}</td>
                    <td className="px-2 py-1 text-right tabular-nums">{r.error ? "" : formatValue(r.value, metric)}</td>
                    <td className="px-2 py-1">{r.error ? <span className="text-rose-600">{r.error}</span> : <span className="text-muted">{r.action}</span>}</td>
                    <td className="max-w-64 truncate px-2 py-1 text-muted">{r.narrative}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={!csv.trim() || busy} onClick={() => run(true)}>
          Validate
        </Button>
        <Button disabled={!result || result.errors > 0 || busy} onClick={() => run(false)}>
          <Upload /> Import {result ? result.inserted + result.updated : ""} rows
        </Button>
      </div>
    </div>
  );
}

export default function MetricValues() {
  const id = Number(useParams().metricId);
  const qc = useQueryClient();
  const metric = useQuery({ queryKey: ["metric", String(id)], queryFn: () => get<Metric>(`/api/metrics/${id}`) });
  const values = useQuery({ queryKey: ["values", id], queryFn: () => get<MetricValue[]>(`/api/metrics/${id}/values`), enabled: metric.data?.source_type === "managed" });
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<MetricValue | null>(null);
  const [importing, setImporting] = useState(false);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["values", id] });
    qc.invalidateQueries({ queryKey: ["board-data"] });
    qc.invalidateQueries({ queryKey: ["series"] });
    qc.invalidateQueries({ queryKey: ["metrics"] });
  };

  if (metric.isLoading) return <Spinner />;
  const m = metric.data;
  if (!m) return <p className="text-muted">Metric not found.</p>;
  if (m.source_type !== "managed")
    return (
      <Panel className="p-6 text-sm">
        “{m.name}” reads its values from {m.data_source_name} ({m.source_schema}.{m.source_table}).{" "}
        <Link to={`/admin/metrics/${m.id}`} className="text-indigo-600 hover:underline">Edit mapping</Link>
      </Panel>
    );

  return (
    <>
      <PageHeader
        title={m.name}
        description={
          <>
            {m.period_type}ly values and narratives ·{" "}
            <Link to={`/admin/metrics/${m.id}`} className="text-indigo-600 hover:underline dark:text-indigo-400">Metric settings</Link>
          </>
        }
        actions={
          <>
            <Button variant="secondary" onClick={() => setImporting(true)}>
              <Upload /> Import CSV
            </Button>
            <Button onClick={() => setAdding(true)}>
              <Plus /> Add value
            </Button>
          </>
        }
      />
      <Table>
        <thead>
          <tr>
            <Th>Period</Th>
            <Th>Dates</Th>
            <Th className="text-right">Value</Th>
            <Th>Narrative</Th>
            <Th />
          </tr>
        </thead>
        <tbody>
          {values.data?.map((v) => (
            <tr key={v.id}>
              <Td className="whitespace-nowrap font-medium">{v.label}</Td>
              <Td className="whitespace-nowrap text-xs text-muted">
                {formatDate(v.period_start)} – {formatDate(v.period_end)}
              </Td>
              <Td className="text-right tabular-nums">{formatValue(v.value, m)}</Td>
              <Td className="max-w-xl text-xs text-muted">
                <span className="line-clamp-2">{v.narrative}</span>
              </Td>
              <Td className="whitespace-nowrap text-right">
                <Button variant="ghost" size="icon" onClick={() => setEditing(v)} title="Edit">
                  <Pencil />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  title="Delete"
                  onClick={async () => {
                    if (!confirmAction(`Delete the value for ${v.label}?`)) return;
                    await del(`/api/values/${v.id}`).catch((e) => toast.error(e.message));
                    refresh();
                  }}
                >
                  <Trash2 />
                </Button>
              </Td>
            </tr>
          ))}
          {values.data?.length === 0 && (
            <tr>
              <Td colSpan={5} className="py-10 text-center text-muted">No values yet. Add one or import a CSV file.</Td>
            </tr>
          )}
        </tbody>
      </Table>

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent title={`Add value · ${m.name}`} description="If a value already exists for that period it is replaced.">
          <ValueForm
            metric={m}
            onSubmit={async (v) => {
              try {
                await post(`/api/metrics/${m.id}/values`, v);
                toast.success("Value saved");
                setAdding(false);
                refresh();
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          />
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title={`Edit ${editing?.label ?? ""}`}>
          {editing && (
            <ValueForm
              metric={m}
              initial={editing}
              onSubmit={async (v) => {
                try {
                  await put(`/api/values/${editing.id}`, v);
                  toast.success("Value saved");
                  setEditing(null);
                  refresh();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={importing} onOpenChange={setImporting}>
        <DialogContent title={`Import CSV · ${m.name}`} className="max-w-2xl">
          <CsvImport metric={m} onDone={() => (setImporting(false), refresh())} />
        </DialogContent>
      </Dialog>
    </>
  );
}
