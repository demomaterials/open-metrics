import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import MetricCard from "./MetricCard";
import type { Card, CardData } from "@/lib/types";

const card: Card = {
  id: 1, board_id: 1, metric_id: 1, display_title: "", display_type: "sparkline", position: 0, width: 1,
  colour_thresholds: null, configuration: { show_narrative: true },
  metric: { id: 1, name: "Customer satisfaction", description: "", unit: "percent", unit_label: "", decimals: 1,
    direction: "higher_is_better", period_type: "week", thresholds: { green: 85, amber: 80 }, target: null, source_type: "managed" },
};
const pt = (label: string, value: number) => ({ period_start: label, period_end: label, label, value, narrative: "n" });
const data: CardData = {
  card_id: 1, metric_id: 1, status: "good", error: null, change_abs: 4.2, change_pct: 5.1, trend: "up", sentiment: "positive",
  first: pt("W10 2026", 83.2), latest: pt("W28 2026", 87.4), points: [pt("W10 2026", 83.2), pt("W28 2026", 87.4)],
};

describe("MetricCard", () => {
  it("shows value, change, status and opens detail on click", () => {
    const onOpen = vi.fn();
    render(<MetricCard card={card} data={data} onOpen={onOpen} />);
    expect(screen.getByText("Customer satisfaction")).toBeInTheDocument();
    expect(screen.getByText("87.4%")).toBeInTheDocument();
    expect(screen.getByText("+4.2 pts")).toBeInTheDocument();
    expect(screen.getByText("On track")).toBeInTheDocument();
    expect(screen.getByText("since W10 2026")).toBeInTheDocument();
    screen.getByRole("button").click();
    expect(onOpen).toHaveBeenCalled();
  });
  it("renders a grey no-data state", () => {
    render(<MetricCard card={card} data={{ card_id: 1, metric_id: 1, status: "nodata", points: [], latest: null, error: null }} />);
    expect(screen.getByText("No data")).toBeInTheDocument();
    expect(screen.getByText("No observations in the selected range")).toBeInTheDocument();
  });
});
