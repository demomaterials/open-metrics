import { describe, expect, it } from "vitest";
import { convertSel, defaultSel, isoWeekOf, isoWeekStart, lastN, rangeLabel, shiftToken, toDates, weeksInYear } from "./range";

describe("ISO weeks", () => {
  it("computes week starts and numbers", () => {
    expect(isoWeekStart(2026, 10).toISOString().slice(0, 10)).toBe("2026-03-02");
    expect(isoWeekStart(2026, 1).toISOString().slice(0, 10)).toBe("2025-12-29");
    expect(isoWeekOf(new Date(Date.UTC(2026, 0, 1)))).toEqual({ year: 2026, week: 1 });
    expect(isoWeekOf(new Date(Date.UTC(2027, 0, 1)))).toEqual({ year: 2026, week: 53 });
    expect(weeksInYear(2026)).toBe(53);
    expect(weeksInYear(2025)).toBe(52);
  });
});

describe("range selection", () => {
  it("converts Week 10 – Week 28 2026 to dates", () => {
    const sel = { mode: "week" as const, from: "2026-W10", to: "2026-W28" };
    expect(toDates(sel)).toEqual({ from: "2026-03-02", to: "2026-07-12" });
    expect(rangeLabel(sel)).toBe("Week 10 – Week 28, 2026");
  });
  it("converts months and quarters", () => {
    expect(toDates({ mode: "month", from: "2026-03", to: "2026-07" })).toEqual({ from: "2026-03-01", to: "2026-07-31" });
    expect(rangeLabel({ mode: "month", from: "2026-03", to: "2026-07" })).toBe("March – July 2026");
    expect(toDates({ mode: "quarter", from: "2026-Q1", to: "2026-Q2" })).toEqual({ from: "2026-01-01", to: "2026-06-30" });
    expect(rangeLabel({ mode: "month", from: "2025-11", to: "2026-02" })).toBe("November 2025 – February 2026");
  });
  it("shifts across year boundaries", () => {
    expect(shiftToken("week", "2026-W01", -1)).toBe("2025-W52");
    expect(shiftToken("week", "2026-W53", 1)).toBe("2027-W01");
    expect(shiftToken("month", "2026-01", -1)).toBe("2025-12");
    expect(shiftToken("quarter", "2026-Q1", -1)).toBe("2025-Q4");
  });
  it("builds default and preset ranges", () => {
    const today = new Date(Date.UTC(2026, 10, 24));
    expect(defaultSel({ mode: "week", periods: 12 }, today)).toEqual({ mode: "week", from: "2026-W37", to: "2026-W48" });
    expect(lastN("month", 6, today)).toEqual({ mode: "month", from: "2026-06", to: "2026-11" });
  });
  it("keeps the span when switching mode", () => {
    expect(convertSel({ mode: "week", from: "2026-W10", to: "2026-W28" }, "month")).toEqual({ mode: "month", from: "2026-03", to: "2026-07" });
  });
});
