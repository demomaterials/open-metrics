import { LayoutGrid, Plus, Settings2 } from "lucide-react";
import { Link, Navigate, useParams } from "react-router";
import BoardGrid from "@/components/BoardGrid";
import RangeSelector from "@/components/RangeSelector";
import { buttonVariants } from "@/components/ui/button";
import { Empty, Spinner } from "@/components/ui/misc";
import { useAuth } from "@/lib/auth";
import { formatDate } from "@/lib/format";
import { useBoard, useBoardData, useBoardRange, useBoards } from "@/lib/hooks";
import { rangeLabel } from "@/lib/range";

export function HomeRedirect() {
  const boards = useBoards();
  const { isAdmin } = useAuth();
  if (boards.isLoading) return <div className="grid h-[60vh] place-items-center text-muted"><Spinner /></div>;
  const first = boards.data?.[0];
  if (first) return <Navigate to={`/boards/${first.id}`} replace />;
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <Empty title="No boards yet" icon={<LayoutGrid />}>
        {isAdmin ? (
          <Link to="/admin/boards" className={buttonVariants({ className: "mt-2" })}>
            <Plus /> Create a board
          </Link>
        ) : (
          "Ask an administrator to create a board."
        )}
      </Empty>
    </main>
  );
}

export default function BoardPage() {
  const id = Number(useParams().boardId);
  const board = useBoard(id);
  const { isAdmin } = useAuth();
  const { sel, setSel, dates } = useBoardRange(board.data);
  const data = useBoardData(board.data ? id : undefined, dates);

  if (board.isLoading) return <div className="grid h-[60vh] place-items-center text-muted"><Spinner /></div>;
  if (board.isError || !board.data) return <main className="p-10 text-muted">Board not found.</main>;
  const b = board.data;
  const label = rangeLabel(sel);

  return (
    <main className="mx-auto max-w-[1600px] px-4 pb-16 sm:px-6">
      <section className="flex items-start justify-between gap-6 pb-6 pt-8">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-indigo-600 dark:text-indigo-400">Reporting period · {label}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-[2.1rem]">{b.name}</h1>
          {b.description && <p className="mt-2 max-w-3xl text-muted">{b.description}</p>}
        </div>
        {isAdmin && (
          <Link to={`/admin/boards/${b.id}`} className={buttonVariants({ variant: "secondary", size: "sm", className: "mt-1 shrink-0" })} title="Edit board">
            <Settings2 /> <span className="hidden sm:inline">Edit board</span>
          </Link>
        )}
      </section>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface/70 p-2 pl-3 shadow-xs">
        <RangeSelector sel={sel} onChange={setSel} />
        <p className="px-2 text-xs text-muted tabular-nums">
          {data.isFetching && <Spinner className="mr-2 size-3 align-[-2px]" />}
          All cards · {formatDate(dates.from)} – {formatDate(dates.to)}
        </p>
      </div>

      {b.cards.length === 0 ? (
        <Empty title="This board has no cards" icon={<LayoutGrid />}>
          {isAdmin && (
            <Link to={`/admin/boards/${b.id}`} className={buttonVariants({ className: "mt-2" })}>
              <Plus /> Add metric cards
            </Link>
          )}
        </Empty>
      ) : (
        <BoardGrid board={b} data={data.data} loading={data.isFetching} range={dates} rangeLabel={label} />
      )}
      {data.isError && <p className="mt-4 text-sm text-rose-600">{(data.error as Error).message}</p>}
    </main>
  );
}
