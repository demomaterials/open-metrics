import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router";
import { toast } from "sonner";
import BoardGrid from "@/components/BoardGrid";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge, Panel, Spinner } from "@/components/ui/misc";
import { del, get, post, put } from "@/lib/api";
import { formatValue } from "@/lib/format";
import { useBoard, useBoardData, useBoardRange } from "@/lib/hooks";
import { rangeLabel } from "@/lib/range";
import type { Board, Card, DisplayType, Metric } from "@/lib/types";
import { PageHeader, confirmAction } from "./AdminLayout";
import { BoardForm } from "./BoardForm";

const TYPES: { value: DisplayType; label: string; hint: string }[] = [
  { value: "sparkline", label: "KPI + sparkline", hint: "Headline value with a line of the range" },
  { value: "trend", label: "KPI + trend bars", hint: "Bars per period, first vs last value" },
  { value: "area", label: "Area chart", hint: "Value with a filled area chart" },
  { value: "progress", label: "Progress to target", hint: "Latest value against a target" },
];

interface CardFormValue {
  metric_id: number;
  display_title: string;
  display_type: DisplayType;
  width: number;
  green: string;
  amber: string;
  target: string;
  show_narrative: boolean;
}

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

function CardForm({
  metrics,
  initial,
  onSubmit,
  submitLabel,
}: {
  metrics: Metric[];
  initial?: Card;
  onSubmit: (v: CardFormValue) => Promise<void>;
  submitLabel: string;
}) {
  const [v, setV] = useState<CardFormValue>({
    metric_id: initial?.metric_id ?? metrics[0]?.id ?? 0,
    display_title: initial?.display_title ?? "",
    display_type: initial?.display_type ?? "sparkline",
    width: initial?.width ?? 1,
    green: initial?.colour_thresholds?.green?.toString() ?? "",
    amber: initial?.colour_thresholds?.amber?.toString() ?? "",
    target: initial?.configuration?.target?.toString() ?? "",
    show_narrative: initial?.configuration?.show_narrative ?? true,
  });
  const [busy, setBusy] = useState(false);
  const metric = metrics.find((m) => m.id === v.metric_id);
  const dirWord = metric?.direction === "lower_is_better" ? "at or below" : "at or above";
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await onSubmit(v);
        } finally {
          setBusy(false);
        }
      }}
    >
      <Field label="Metric" hint={metric?.description}>
        <Select value={v.metric_id} onChange={(e) => setV({ ...v, metric_id: Number(e.target.value) })} required>
          {metrics.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name} · {m.period_type}ly{m.source_type === "external" ? " · external" : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Card title" hint="Leave empty to use the metric name.">
        <Input value={v.display_title} onChange={(e) => setV({ ...v, display_title: e.target.value })} placeholder={metric?.name} />
      </Field>
      <div className="grid grid-cols-2 gap-2">
        {TYPES.map((t) => (
          <button
            type="button"
            key={t.value}
            onClick={() => setV({ ...v, display_type: t.value })}
            className={`cursor-pointer rounded-xl border p-3 text-left transition ${v.display_type === t.value ? "border-indigo-500 ring-2 ring-indigo-500/25" : "border-border hover:bg-surface-2"}`}
          >
            <div className="text-sm font-medium">{t.label}</div>
            <div className="text-xs text-muted">{t.hint}</div>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Width (columns)">
          <Select value={v.width} onChange={(e) => setV({ ...v, width: Number(e.target.value) })}>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
        </Field>
        <Field label="Target override" hint={metric?.target !== null && metric ? `Metric target: ${formatValue(metric.target, metric)}` : "Used by progress cards"}>
          <Input type="number" step="any" value={v.target} onChange={(e) => setV({ ...v, target: e.target.value })} />
        </Field>
      </div>
      <fieldset className="rounded-xl border border-border p-3">
        <legend className="px-1 text-xs font-medium text-muted">Colour thresholds for this card (optional override)</legend>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Green when value is">
            <Input type="number" step="any" value={v.green} onChange={(e) => setV({ ...v, green: e.target.value })}
              placeholder={metric?.thresholds?.green?.toString() ?? ""} />
          </Field>
          <Field label="Amber when value is">
            <Input type="number" step="any" value={v.amber} onChange={(e) => setV({ ...v, amber: e.target.value })}
              placeholder={metric?.thresholds?.amber?.toString() ?? ""} />
          </Field>
        </div>
        <p className="mt-2 text-xs text-muted">
          {dirWord} the threshold. Otherwise red. Empty uses the metric's thresholds
          {metric?.thresholds?.green !== undefined && metric?.thresholds?.green !== null
            ? ` (green ${metric.thresholds.green}, amber ${metric.thresholds.amber ?? "—"})`
            : " (none set)"}
          .
        </p>
      </fieldset>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={v.show_narrative} onChange={(e) => setV({ ...v, show_narrative: e.target.checked })} className="size-4 accent-indigo-600" />
        Show narrative on hover
      </label>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy || !v.metric_id}>{submitLabel}</Button>
      </div>
    </form>
  );
}

function toPayload(v: CardFormValue) {
  const green = numOrNull(v.green);
  return {
    metric_id: v.metric_id,
    display_title: v.display_title,
    display_type: v.display_type,
    width: v.width,
    colour_thresholds: green === null ? null : { green, amber: numOrNull(v.amber) },
    clear_thresholds: green === null,
    configuration: { target: numOrNull(v.target), show_narrative: v.show_narrative },
  };
}

export default function BoardEditor() {
  const id = Number(useParams().boardId);
  const qc = useQueryClient();
  const board = useBoard(id);
  const metrics = useQuery({ queryKey: ["metrics"], queryFn: () => get<Metric[]>("/api/metrics") });
  const { sel, dates } = useBoardRange(board.data);
  const data = useBoardData(board.data ? id : undefined, dates);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Card | null>(null);
  const [settings, setSettings] = useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["board", id] });
    qc.invalidateQueries({ queryKey: ["board-data", id] });
    qc.invalidateQueries({ queryKey: ["boards"] });
  };
  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    try {
      await fn();
      if (ok) toast.success(ok);
      refresh();
      return true;
    } catch (e) {
      toast.error((e as Error).message);
      return false;
    }
  };

  if (board.isLoading) return <Spinner />;
  if (!board.data) return <p className="text-muted">Board not found.</p>;
  const b = board.data;
  const move = (idx: number, delta: number) => {
    const ids = b.cards.map((c) => c.id);
    const j = idx + delta;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    qc.setQueryData<Board>(["board", id], { ...b, cards: ids.map((cid) => b.cards.find((c) => c.id === cid)!) });
    void act(() => put(`/api/boards/${id}/cards/order`, { card_ids: ids }));
  };

  return (
    <>
      <PageHeader
        title={b.name}
        description={b.description || "No description"}
        actions={
          <>
            <Button variant="secondary" onClick={() => setSettings(true)}>
              <Pencil /> Board settings
            </Button>
            <Link to={`/boards/${b.id}`} className={buttonVariants({ variant: "secondary" })}>
              <ExternalLink /> Open board
            </Link>
            <Button onClick={() => setAdding(true)} disabled={!metrics.data?.length}>
              <Plus /> Add card
            </Button>
          </>
        }
      />

      {metrics.data?.length === 0 && (
        <Panel className="mb-4 p-4 text-sm">
          No metrics exist yet. <Link to="/admin/metrics/new" className="font-medium text-indigo-600 hover:underline">Create a metric</Link> first.
        </Panel>
      )}

      <Panel className="mb-8 divide-y divide-border">
        {b.cards.length === 0 && <div className="p-6 text-sm text-muted">No cards yet. Add a metric card to get started.</div>}
        {b.cards.map((c, i) => (
          <div key={c.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex flex-col">
              <button className="cursor-pointer text-muted hover:text-fg disabled:opacity-30" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">
                <ArrowUp className="size-4" />
              </button>
              <button className="cursor-pointer text-muted hover:text-fg disabled:opacity-30" disabled={i === b.cards.length - 1} onClick={() => move(i, 1)} title="Move down">
                <ArrowDown className="size-4" />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{c.display_title || c.metric.name}</div>
              <div className="text-xs text-muted">
                {c.metric.name} · {TYPES.find((t) => t.value === c.display_type)?.label} · width {c.width}
              </div>
            </div>
            {c.colour_thresholds && <Badge tone="accent">custom thresholds</Badge>}
            <Button variant="ghost" size="icon" onClick={() => setEditing(c)} title="Edit card">
              <Pencil />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              title="Remove card"
              onClick={() => confirmAction("Remove this card from the board?") && act(() => del(`/api/cards/${c.id}`), "Card removed")}
            >
              <Trash2 />
            </Button>
          </div>
        ))}
      </Panel>

      {b.cards.length > 0 && (
        <>
          <h2 className="mb-1 text-sm font-semibold">Preview</h2>
          <p className="mb-4 text-xs text-muted">{rangeLabel(sel)} (the board's default range)</p>
          <BoardGrid board={b} data={data.data} loading={data.isFetching} range={dates} rangeLabel={rangeLabel(sel)} />
        </>
      )}

      <Dialog open={adding} onOpenChange={setAdding}>
        <DialogContent title="Add card" className="max-w-xl">
          {metrics.data && (
            <CardForm
              metrics={metrics.data}
              submitLabel="Add card"
              onSubmit={async (v) => {
                if (await act(() => post(`/api/boards/${id}/cards`, toPayload(v)), "Card added")) setAdding(false);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent title="Edit card" className="max-w-xl">
          {metrics.data && editing && (
            <CardForm
              metrics={metrics.data}
              initial={editing}
              submitLabel="Save card"
              onSubmit={async (v) => {
                if (await act(() => put(`/api/cards/${editing.id}`, toPayload(v)), "Card saved")) setEditing(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={settings} onOpenChange={setSettings}>
        <DialogContent title="Board settings">
          <BoardForm
            initial={b}
            submitLabel="Save"
            onSubmit={async (v) => {
              if (await act(() => put(`/api/boards/${id}`, v), "Board saved")) setSettings(false);
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
