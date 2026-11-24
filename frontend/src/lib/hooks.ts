import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router";
import { get, qs } from "./api";
import { defaultSel, selFromParams, toDates, type RangeSel } from "./range";
import type { Board, BoardData, BoardSummary } from "./types";

export const useBoards = () => useQuery({ queryKey: ["boards"], queryFn: () => get<BoardSummary[]>("/api/boards") });

export const useBoard = (id: number | undefined) =>
  useQuery({ queryKey: ["board", id], queryFn: () => get<Board>(`/api/boards/${id}`), enabled: !!id });

/** The board-owned reporting range, kept in the URL so links and presentation mode share it. */
export function useBoardRange(board: Board | undefined) {
  const [params, setParams] = useSearchParams();
  const fromUrl = selFromParams(params);
  const sel: RangeSel = useMemo(
    () => fromUrl ?? defaultSel(board?.default_range),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [fromUrl?.mode, fromUrl?.from, fromUrl?.to, board?.default_range?.mode, board?.default_range?.periods],
  );
  const setSel = useCallback(
    (s: RangeSel) =>
      setParams(
        (p) => {
          p.set("mode", s.mode);
          p.set("from", s.from);
          p.set("to", s.to);
          return p;
        },
        { replace: true },
      ),
    [setParams],
  );
  return { sel, setSel, dates: toDates(sel) };
}

export function useBoardData(boardId: number | undefined, dates: { from: string; to: string }, refetchMs?: number) {
  return useQuery({
    queryKey: ["board-data", boardId, dates.from, dates.to],
    queryFn: () => get<BoardData>(`/api/boards/${boardId}/data${qs(dates)}`),
    enabled: !!boardId,
    placeholderData: (prev) => (prev && prev.cards ? prev : undefined),
    refetchInterval: refetchMs,
  });
}
