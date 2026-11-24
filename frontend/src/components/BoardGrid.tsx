import { useState } from "react";
import MetricCard from "./MetricCard";
import MetricDetail from "./MetricDetail";
import type { Board, BoardData, Card } from "@/lib/types";
import { cn } from "@/lib/utils";

export default function BoardGrid({
  board,
  data,
  loading,
  range,
  rangeLabel,
  present,
  className,
  style,
}: {
  board: Board;
  data?: BoardData;
  loading?: boolean;
  range: { from: string; to: string };
  rangeLabel: string;
  present?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  const [open, setOpen] = useState<Card | null>(null);
  const byCard = new Map(data?.cards.map((c) => [c.card_id, c]));
  return (
    <>
      <div className={cn("board-grid", present && "gap-6", className)} style={{ ["--cols" as string]: board.columns, ...style }}>
        {board.cards.map((card) => (
          <MetricCard
            key={card.id}
            card={card}
            data={byCard.get(card.id)}
            loading={loading}
            present={present}
            onOpen={() => setOpen(card)}
          />
        ))}
      </div>
      <MetricDetail card={open} range={range} rangeLabel={rangeLabel} open={!!open} onOpenChange={(o) => !o && setOpen(null)} />
    </>
  );
}
