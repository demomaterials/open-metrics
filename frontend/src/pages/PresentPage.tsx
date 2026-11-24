import { ChevronLeft, ChevronRight, Maximize, Minimize, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import BoardGrid from "@/components/BoardGrid";
import { Logo, ThemeToggle } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/misc";
import { formatDate } from "@/lib/format";
import { useBoard, useBoardData, useBoardRange, useBoards } from "@/lib/hooks";
import { rangeLabel } from "@/lib/range";
import { cn } from "@/lib/utils";

/** Presentation mode: no administration, maximum screen, keyboard driven.
 *   F = full screen · ← / → = previous / next board · Esc = leave */
export default function PresentPage() {
  const id = Number(useParams().boardId);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const boards = useBoards();
  const board = useBoard(id);
  const { sel, dates } = useBoardRange(board.data);
  const data = useBoardData(board.data ? id : undefined, dates, 5 * 60_000);
  const [chrome, setChrome] = useState(true);
  const [fs, setFs] = useState(!!document.fullscreenElement);

  const go = useCallback(
    (delta: number) => {
      const list = boards.data ?? [];
      const i = list.findIndex((b) => b.id === id);
      if (i < 0 || list.length < 2) return;
      const nextBoard = list[(i + delta + list.length) % list.length];
      navigate(`/present/${nextBoard.id}?${params.toString()}`);
    },
    [boards.data, id, navigate, params],
  );
  const toggleFs = useCallback(() => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  }, []);
  const exit = useCallback(() => navigate(`/boards/${id}?${params.toString()}`), [id, navigate, params]);

  useEffect(() => {
    const onFs = () => setFs(!!document.fullscreenElement);
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest("[role=dialog]")) return;
      if (e.key === "f" || e.key === "F") toggleFs();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
      else if (e.key === "Escape" && !document.fullscreenElement) exit();
    };
    document.addEventListener("fullscreenchange", onFs);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("fullscreenchange", onFs);
      window.removeEventListener("keydown", onKey);
    };
  }, [go, toggleFs, exit]);

  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const show = () => {
      setChrome(true);
      clearTimeout(t);
      t = setTimeout(() => setChrome(false), 2500);
    };
    show();
    window.addEventListener("mousemove", show);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousemove", show);
    };
  }, []);

  if (board.isLoading) return <div className="grid h-screen place-items-center text-muted"><Spinner /></div>;
  if (!board.data) return <div className="grid h-screen place-items-center text-muted">Board not found.</div>;
  const b = board.data;
  const label = rangeLabel(sel);
  const rows = Math.max(1, Math.ceil(b.cards.reduce((n, c) => n + Math.min(c.width, b.columns), 0) / b.columns));

  return (
    <div className={cn("flex h-screen flex-col overflow-hidden px-10 pb-8 pt-8", !chrome && "cursor-none")}>
      <header className="mb-7 flex items-end justify-between gap-8">
        <div className="min-w-0">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-indigo-600 dark:text-indigo-400">{label}</p>
          <h1 className="mt-1.5 truncate text-[2.6rem] font-semibold leading-tight tracking-tight">{b.name}</h1>
          {b.description && <p className="mt-1 max-w-4xl truncate text-lg text-muted">{b.description}</p>}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2 text-right">
          <Logo className="text-lg opacity-80" />
          <span className="text-sm text-muted tabular-nums">
            {formatDate(dates.from)} – {formatDate(dates.to)}
          </span>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <BoardGrid
          board={b}
          data={data.data}
          loading={data.isFetching && !data.data}
          range={dates}
          rangeLabel={label}
          present
          className="h-full"
          style={{ gridAutoRows: rows <= 2 ? `minmax(15rem, 1fr)` : "minmax(15rem, auto)" }}
        />
      </div>

      <div
        className={cn(
          "fixed bottom-5 right-5 z-20 flex items-center gap-1 rounded-2xl border border-border bg-surface/90 p-1.5 shadow-xl backdrop-blur transition-opacity duration-300",
          chrome ? "opacity-100" : "pointer-events-none opacity-0",
        )}
      >
        {(boards.data?.length ?? 0) > 1 && (
          <>
            <Button variant="ghost" size="icon" onClick={() => go(-1)} title="Previous board (←)">
              <ChevronLeft />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => go(1)} title="Next board (→)">
              <ChevronRight />
            </Button>
          </>
        )}
        <ThemeToggle />
        <Button variant="ghost" size="icon" onClick={toggleFs} title="Full screen (F)">
          {fs ? <Minimize /> : <Maximize />}
        </Button>
        <Button variant="ghost" size="icon" onClick={exit} title="Exit presentation (Esc)">
          <X />
        </Button>
      </div>
    </div>
  );
}
