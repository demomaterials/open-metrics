import { describe, expect, it } from "vitest";
import { formatChange, formatValue } from "./format";

const pct = { unit: "percent" as const, unit_label: "", decimals: 1 };
describe("formatting", () => {
  it("formats units", () => {
    expect(formatValue(87.4, pct)).toBe("87.4%");
    expect(formatValue(4_870_000, { unit: "currency", unit_label: "£", decimals: 1 })).toBe("£4.9M");
    expect(formatValue(12480, { unit: "number", unit_label: "", decimals: 0 })).toBe("12,480");
    expect(formatValue(922001.2, { unit: "currency", unit_label: "£", decimals: 1 })).toBe("£922k");
    expect(formatValue(3.14, { unit: "days", unit_label: "", decimals: 1 })).toBe("3.1 days");
    expect(formatValue(null, pct)).toBe("—");
  });
  it("uses percentage points for percent metrics", () => {
    expect(formatChange(4.2, 5.1, pct)).toBe("+4.2 pts");
    expect(formatChange(-3, -17.6, { unit: "number", unit_label: "", decimals: 0 })).toBe("−17.6%");
    expect(formatChange(null, null, pct)).toBeNull();
  });
});
