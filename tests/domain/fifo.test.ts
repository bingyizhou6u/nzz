import { describe, expect, it } from "vitest";
import { allocateFifo } from "../../src/domain/fifo";
import type { Lot } from "../../src/domain/types";

const lots: Lot[] = [
  { id: "lot_1", currencyCode: "AED", remainingAmountMinor: 365000, remainingUsdtCostMinor: 100000, lotDate: "2026-01-01" },
  { id: "lot_2", currencyCode: "AED", remainingAmountMinor: 367000, remainingUsdtCostMinor: 100000, lotDate: "2026-01-02" }
];

describe("allocateFifo", () => {
  it("allocates from the oldest lot first", () => {
    const result = allocateFifo(lots, 400000);
    expect(result.allocations).toEqual([
      { lotId: "lot_1", amountMinor: 365000, usdtCostMinor: 100000 },
      { lotId: "lot_2", amountMinor: 35000, usdtCostMinor: 9537 }
    ]);
    expect(result.unmatchedAmountMinor).toBe(0);
  });

  it("returns unmatched amount when lots are insufficient and negative is allowed", () => {
    const result = allocateFifo(lots, 800000, { allowUnmatched: true });
    expect(result.unmatchedAmountMinor).toBe(68000);
  });

  it("throws when lots are insufficient and negative is not allowed", () => {
    expect(() => allocateFifo(lots, 800000)).toThrow("Insufficient lot balance");
  });
});
