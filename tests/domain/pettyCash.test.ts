import { describe, expect, it } from "vitest";
import { reimbursePettyCash } from "../../src/domain/pettyCash";
import type { Lot } from "../../src/domain/types";

const lots: Lot[] = [
  { id: "lot_1", currencyCode: "AED", remainingAmountMinor: 365000, remainingUsdtCostMinor: 100000, lotDate: "2026-01-01" },
  { id: "lot_2", currencyCode: "AED", remainingAmountMinor: 367000, remainingUsdtCostMinor: 100000, lotDate: "2026-01-02" }
];

describe("reimbursePettyCash", () => {
  it("creates a pending match when reimbursement exceeds petty-cash lots", () => {
    const result = reimbursePettyCash({
      personId: " staff_1 ",
      accountId: " petty_aed ",
      currencyCode: " AED ",
      expenseDate: " 2026-02-10 ",
      amountMinor: 800000,
      lots
    });

    expect(result.allocations).toEqual([
      { lotId: "lot_1", amountMinor: 365000, usdtCostMinor: 100000 },
      { lotId: "lot_2", amountMinor: 367000, usdtCostMinor: 100000 }
    ]);
    expect(result.pendingMatch).toEqual({
      personId: "staff_1",
      accountId: "petty_aed",
      currencyCode: "AED",
      amountMinor: 68000,
      expenseDate: "2026-02-10"
    });
  });

  it("returns no pending match when reimbursement is fully matched", () => {
    const result = reimbursePettyCash({
      personId: "staff_1",
      accountId: "petty_aed",
      currencyCode: "AED",
      expenseDate: "2026-02-10",
      amountMinor: 400000,
      lots
    });

    expect(result.allocations).toEqual([
      { lotId: "lot_1", amountMinor: 365000, usdtCostMinor: 100000 },
      { lotId: "lot_2", amountMinor: 35000, usdtCostMinor: 9537 }
    ]);
    expect(result.pendingMatch).toBeNull();
  });

  it("rejects blank pending-match identity fields before FIFO allocation", () => {
    const validInput = {
      personId: "staff_1",
      accountId: "petty_aed",
      currencyCode: "AED",
      expenseDate: "2026-02-10",
      amountMinor: 1000,
      lots
    };

    expect(() => reimbursePettyCash({ ...validInput, personId: " " })).toThrow("Person id must be non-empty");
    expect(() => reimbursePettyCash({ ...validInput, accountId: " " })).toThrow("Account id must be non-empty");
    expect(() => reimbursePettyCash({ ...validInput, currencyCode: " " })).toThrow("Currency code must be non-empty");
    expect(() => reimbursePettyCash({ ...validInput, expenseDate: " " })).toThrow("Expense date must be non-empty");
  });

  it("keeps FIFO validation for invalid amounts and mismatched lot currency", () => {
    const validInput = {
      personId: "staff_1",
      accountId: "petty_aed",
      currencyCode: "AED",
      expenseDate: "2026-02-10",
      amountMinor: 1000,
      lots
    };

    expect(() => reimbursePettyCash({ ...validInput, amountMinor: 0 })).toThrow(
      "Requested amount must be a positive safe integer"
    );
    expect(() => reimbursePettyCash({ ...validInput, lots: [{ ...lots[0], currencyCode: "USD" }] })).toThrow(
      "Lot currency does not match requested currency"
    );
  });
});
