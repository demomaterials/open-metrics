import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/input";
import type { DefaultRange } from "@/lib/types";

export interface BoardFormValue {
  name: string;
  description: string;
  columns: number;
  default_range: DefaultRange;
}

export function BoardForm({
  initial,
  submitLabel,
  onSubmit,
}: {
  initial?: Partial<BoardFormValue>;
  submitLabel: string;
  onSubmit: (v: BoardFormValue) => Promise<unknown>;
}) {
  const [v, setV] = useState<BoardFormValue>({
    name: initial?.name ?? "",
    description: initial?.description ?? "",
    columns: initial?.columns ?? 3,
    default_range: initial?.default_range ?? { mode: "week", periods: 12 },
  });
  const [busy, setBusy] = useState(false);
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
      <Field label="Name">
        <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} required maxLength={160} placeholder="Executive overview" />
      </Field>
      <Field label="Description">
        <Textarea value={v.description} onChange={(e) => setV({ ...v, description: e.target.value })} rows={2} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="Columns">
          <Select value={v.columns} onChange={(e) => setV({ ...v, columns: Number(e.target.value) })}>
            {[1, 2, 3, 4, 5, 6].map((n) => (
              <option key={n} value={n}>{n}</option>
            ))}
          </Select>
        </Field>
        <Field label="Default range">
          <Select
            value={v.default_range.mode}
            onChange={(e) => setV({ ...v, default_range: { ...v.default_range, mode: e.target.value as DefaultRange["mode"] } })}
          >
            <option value="week">Weeks</option>
            <option value="month">Months</option>
            <option value="quarter">Quarters</option>
          </Select>
        </Field>
        <Field label="Periods">
          <Input
            type="number"
            min={1}
            max={260}
            value={v.default_range.periods}
            onChange={(e) => setV({ ...v, default_range: { ...v.default_range, periods: Number(e.target.value) || 1 } })}
          />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-muted">
        The default range is used when a board is opened without a range in the link, e.g. the last {v.default_range.periods}{" "}
        {v.default_range.mode}s.
      </p>
      <div className="flex justify-end">
        <Button type="submit" disabled={busy}>{submitLabel}</Button>
      </div>
    </form>
  );
}
