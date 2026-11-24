import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { toast } from "sonner";
import { Button, buttonVariants } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge, Empty } from "@/components/ui/misc";
import { del, post } from "@/lib/api";
import { useBoards } from "@/lib/hooks";
import type { Board } from "@/lib/types";
import { PageHeader, Table, Td, Th, confirmAction } from "./AdminLayout";
import { BoardForm } from "./BoardForm";

export default function BoardsAdmin() {
  const boards = useBoards();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const refresh = () => qc.invalidateQueries({ queryKey: ["boards"] });

  const duplicate = useMutation({
    mutationFn: (id: number) => post<Board>(`/api/boards/${id}/duplicate`),
    onSuccess: (b) => {
      toast.success(`Created “${b.name}”`);
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (id: number) => del(`/api/boards/${id}`),
    onSuccess: () => {
      toast.success("Board deleted");
      refresh();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <PageHeader
        title="Boards"
        description="Presentation pages. Each board owns one reporting range shared by all its cards."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus /> New board
          </Button>
        }
      />
      {boards.data?.length === 0 ? (
        <Empty title="No boards yet">Create a board, then add metric cards to it.</Empty>
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Layout</Th>
              <Th>Default range</Th>
              <Th className="text-right">Cards</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {boards.data?.map((b) => (
              <tr key={b.id}>
                <Td>
                  <Link to={`/admin/boards/${b.id}`} className="font-medium hover:underline">{b.name}</Link>
                  {b.description && <div className="line-clamp-1 text-xs text-muted">{b.description}</div>}
                </Td>
                <Td><Badge>{b.columns} columns</Badge></Td>
                <Td className="text-muted">Last {b.default_range.periods} {b.default_range.mode}s</Td>
                <Td className="text-right tabular-nums">{b.card_count}</Td>
                <Td className="whitespace-nowrap text-right">
                  <Link to={`/boards/${b.id}`} className={buttonVariants({ variant: "ghost", size: "icon" })} title="Open board">
                    <ExternalLink />
                  </Link>
                  <Link to={`/admin/boards/${b.id}`} className={buttonVariants({ variant: "ghost", size: "icon" })} title="Edit">
                    <Pencil />
                  </Link>
                  <Button variant="ghost" size="icon" title="Duplicate" onClick={() => duplicate.mutate(b.id)}>
                    <Copy />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    title="Delete"
                    onClick={() => confirmAction(`Delete board “${b.name}”? Metrics are kept.`) && remove.mutate(b.id)}
                  >
                    <Trash2 />
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent title="New board">
          <BoardForm
            submitLabel="Create board"
            onSubmit={async (v) => {
              try {
                const b = await post<Board>("/api/boards", v);
                refresh();
                setCreating(false);
                navigate(`/admin/boards/${b.id}`);
              } catch (e) {
                toast.error((e as Error).message);
              }
            }}
          />
        </DialogContent>
      </Dialog>
    </>
  );
}
