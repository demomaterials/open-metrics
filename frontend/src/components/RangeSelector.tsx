import { CalendarRange, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";
import {
  convertSel,
  iso,
  MONTH_NAMES,
  monthToken,
  PRESETS,
  quarterToken,
  shiftToken,
  tokenBounds,
  weeksInYear,
  weekToken,
  type RangeMode,
  type RangeSel,
} from "@/lib/range";
import { cn } from "@/lib/utils";
import { Button } from "./ui/button";
import { Input, Select } from "./ui/input";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, Tabs, TabsList, TabsTrigger } from "./ui/misc";

const MODES: { mode: RangeMode; label: string }[] = [
  { mode: "week", label: "Weekly" },
  { mode: "month", label: "Monthly" },
  { mode: "quarter", label: "Quarterly" },
  { mode: "custom", label: "Custom" },
];

const thisYear = new Date().getUTCFullYear();
const YEARS = Array.from({ length: 9 }, (_, i) => thisYear - 6 + i);

function split(mode: RangeMode, token: string): [number, number] {
  if (mode === "week") return token.split("-W").map(Number) as [number, number];
  if (mode === "quarter") return token.split("-Q").map(Number) as [number, number];
  return token.split("-").map(Number) as [number, number];
}

function PeriodPicker({
  mode,
  value,
  onChange,
  label,
}: {
  mode: Exclude<RangeMode, "custom">;
  value: string;
  onChange: (t: string) => void;
  label: string;
}) {
  const [year, n] = split(mode, value);
  const make = (y: number, k: number) =>
    mode === "week" ? weekToken(y, Math.min(k, weeksInYear(y))) : mode === "month" ? monthToken(y, k) : quarterToken(y, k);
  const options =
    mode === "week"
      ? Array.from({ length: weeksInYear(year) }, (_, i) => ({ v: i + 1, l: `Week ${i + 1}` }))
      : mode === "month"
        ? MONTH_NAMES.map((m, i) => ({ v: i + 1, l: m }))
        : [1, 2, 3, 4].map((q) => ({ v: q, l: `Q${q}` }));
  return (
    <div className="flex items-center gap-1" aria-label={label}>
      <Select
        aria-label={`${label} ${mode}`}
        className={cn("h-8 border-transparent bg-transparent pl-2 pr-7 shadow-none hover:bg-surface-2", mode === "month" ? "w-[8.5rem]" : "w-[7.25rem]")}
        value={n}
        onChange={(e) => onChange(make(year, Number(e.target.value)))}
      >
        {options.map((o) => (
          <option key={o.v} value={o.v}>
            {o.l}
          </option>
        ))}
      </Select>
      <Select
        aria-label={`${label} year`}
        className="h-8 w-[5.75rem] border-transparent bg-transparent pl-2 pr-7 shadow-none hover:bg-surface-2"
        value={year}
        onChange={(e) => onChange(make(Number(e.target.value), n))}
      >
        {YEARS.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </Select>
    </div>
  );
}

export default function RangeSelector({ sel, onChange }: { sel: RangeSel; onChange: (s: RangeSel) => void }) {
  const shift = (n: number) => onChange({ ...sel, from: shiftToken(sel.mode, sel.from, n), to: shiftToken(sel.mode, sel.to, n) });
  const setFrom = (from: string) => onChange(from > sel.to ? { ...sel, from, to: from } : { ...sel, from });
  const setTo = (to: string) => onChange(to < sel.from ? { ...sel, from: to, to } : { ...sel, to });

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Tabs value={sel.mode} onValueChange={(m) => onChange(convertSel(sel, m as RangeMode))}>
        <TabsList>
          {MODES.map((m) => (
            <TabsTrigger key={m.mode} value={m.mode}>
              {m.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex max-w-full items-center rounded-xl border border-border bg-surface p-0.5 shadow-xs">
        <Button variant="ghost" size="icon" className="size-8" onClick={() => shift(-1)} title="Previous period">
          <ChevronLeft />
        </Button>
        {sel.mode === "custom" ? (
          <div className="flex min-w-0 flex-wrap items-center gap-1 px-1">
            <Input
              type="date"
              aria-label="From date"
              className="h-8 w-[9.5rem] border-transparent shadow-none"
              value={sel.from}
              max={sel.to}
              onChange={(e) => e.target.value && setFrom(e.target.value)}
            />
            <span className="text-muted">→</span>
            <Input
              type="date"
              aria-label="To date"
              className="h-8 w-[9.5rem] border-transparent shadow-none"
              value={sel.to}
              min={sel.from}
              onChange={(e) => e.target.value && setTo(e.target.value)}
            />
          </div>
        ) : (
          <div className="flex min-w-0 flex-wrap items-center">
            <PeriodPicker mode={sel.mode} value={sel.from} onChange={setFrom} label="From" />
            <span className="px-1 text-muted">→</span>
            <PeriodPicker mode={sel.mode} value={sel.to} onChange={setTo} label="To" />
          </div>
        )}
        <Button variant="ghost" size="icon" className="size-8" onClick={() => shift(1)} title="Next period">
          <ChevronRight />
        </Button>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="secondary" size="sm" className="h-9">
            <CalendarRange /> Quick ranges <ChevronDown className="text-muted" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          {PRESETS.map((p) => (
            <DropdownMenuItem key={p.label} onSelect={() => onChange(p.sel())}>
              {p.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function rangeDatesLabel(sel: RangeSel) {
  const a = tokenBounds(sel.mode, sel.from)[0];
  const b = tokenBounds(sel.mode, sel.to)[1];
  return `${iso(a)} → ${iso(b)}`;
}
