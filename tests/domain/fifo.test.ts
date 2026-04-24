import { describe, expect, it } from "vitest";
import { allocateFifo } from "../../src/domain/fifo";
import type { Lot } from "../../src/domain/types";

const lots: Lot[] = [
  { id: "lot_1", currencyCode: "AED", remainingAmountMinor: 365000, remainingUsdtCostMinor: 100000, lotDate: "2026-01-01" },
  { id: "lot_2", currencyCode: "AED", remainingAmountMinor: 367000, remainingUsdtCostMinor: 100000, lotDate: "2026-01-02" }
];

describe("allocateFifo", () => {
  it("allocates from the oldest lot first", () => {
    const result = allocateFifo(lots, 400000, "AED");
    expect(result.allocations).toEqual([
      { lotId: "lot_1", amountMinor: 365000, usdtCostMinor: 100000 },
      { lotId: "lot_2", amountMinor: 35000, usdtCostMinor: 9537 }
    ]);
    expect(result.unmatchedAmountMinor).toBe(0);
  });

  it("returns unmatched amount when lots are insufficient and negative is allowed", () => {
    const result = allocateFifo(lots, 800000, "AED", { allowUnmatched: true });
    expect(result.unmatchedAmountMinor).toBe(68000);
  });

  it("throws when lots are insufficient and negative is not allowed", () => {
    expect(() => allocateFifo(lots, 800000, "AED")).toThrow("Insufficient lot balance");
  });

  it("rejects lots with a different currency", () => {
    expect(() => allocateFifo([{ ...lots[0], currencyCode: "USD" }], 1000, "AED")).toThrow(
      "Lot currency does not match requested currency"
    );
  });

  it("rejects unsafe or fractional requested amounts", () => {
    expect(() => allocateFifo(lots, 1.5, "AED")).toThrow("Requested amount must be a positive safe integer");
    expect(() => allocateFifo(lots, Number.MAX_SAFE_INTEGER + 1, "AED")).toThrow(
      "Requested amount must be a positive safe integer"
    );
  });

  it("rejects negative lot amount or cost", () => {
    expect(() => allocateFifo([{ ...lots[0], remainingAmountMinor: -1 }], 1000, "AED")).toThrow(
      "Lot remaining amount must be a non-negative safe integer"
    );
    expect(() => allocateFifo([{ ...lots[0], remainingUsdtCostMinor: -1 }], 1000, "AED")).toThrow(
      "Lot remaining USDT cost must be a non-negative safe integer"
    );
  });

  it("rejects lots with missing identity fields", () => {
    expect(() => allocateFifo([{ ...lots[0], id: "" }], 1000, "AED")).toThrow("Lot id must be non-empty");
    expect(() => allocateFifo([{ ...lots[0], lotDate: "" }], 1000, "AED")).toThrow("Lot date must be non-empty");
  });

  it("orders lots with the same date by id", () => {
    const sameDateLots: Lot[] = [
      { id: "lot_b", currencyCode: "AED", remainingAmountMinor: 1000, remainingUsdtCostMinor: 100, lotDate: "2026-01-01" },
      { id: "lot_a", currencyCode: "AED", remainingAmountMinor: 1000, remainingUsdtCostMinor: 100, lotDate: "2026-01-01" }
    ];

    const result = allocateFifo(sameDateLots, 1500, "AED");
    expect(result.allocations).toEqual([
      { lotId: "lot_a", amountMinor: 1000, usdtCostMinor: 100 },
      { lotId: "lot_b", amountMinor: 500, usdtCostMinor: 50 }
    ]);
  });
});
