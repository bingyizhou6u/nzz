import { describe, expect, it } from "vitest";
import { planSafeLoanReversalEffects } from "../../src/domain/loanReversal";

describe("loanReversal", () => {
  it("closes loan items created by a reversed loan_out when they were not reduced", () => {
    expect(
      planSafeLoanReversalEffects({
        reversalDocumentId: "doc_reversal",
        originalDocumentId: "doc_loan",
        originalDocumentType: "loan_out",
        reversalDate: "2026-04-26",
        createdLoanItems: [
          {
            id: "loan_item_1",
            originalAmountMinor: 100000,
            remainingAmountMinor: 100000,
            originalUsdtCostMinor: 27000,
            remainingUsdtCostMinor: 27000
          }
        ],
        originalAllocations: [],
        laterAllocationLoanItemIds: []
      })
    ).toEqual({
      loanItemCreations: [],
      loanItemUpdates: [
        {
          loanItemId: "loan_item_1",
          amountDeltaMinor: -100000,
          usdtCostDeltaMinor: -27000,
          expectedRemainingAmountMinor: 100000,
          expectedRemainingUsdtCostMinor: 27000
        }
      ],
      loanAllocations: [
        {
          loanItemId: "loan_item_1",
          allocationType: "reversal",
          amountMinor: 100000,
          usdtCostMinor: 27000,
          allocationDate: "2026-04-26"
        }
      ]
    });
  });

  it("restores loan items allocated by a reversed repayment", () => {
    expect(
      planSafeLoanReversalEffects({
        reversalDocumentId: "doc_reversal",
        originalDocumentId: "doc_repay",
        originalDocumentType: "loan_repayment",
        reversalDate: "2026-04-26",
        createdLoanItems: [],
        originalAllocations: [
          {
            loanItemId: "loan_item_1",
            allocationType: "repayment",
            amountMinor: 40000,
            usdtCostMinor: 10800
          }
        ],
        affectedLoanItems: [
          {
            id: "loan_item_1",
            originalAmountMinor: 100000,
            remainingAmountMinor: 60000,
            originalUsdtCostMinor: 27000,
            remainingUsdtCostMinor: 16200
          }
        ],
        laterAllocationLoanItemIds: []
      })
    ).toEqual({
      loanItemCreations: [],
      loanItemUpdates: [
        {
          loanItemId: "loan_item_1",
          amountDeltaMinor: 40000,
          usdtCostDeltaMinor: 10800,
          expectedRemainingAmountMinor: 60000,
          expectedRemainingUsdtCostMinor: 16200
        }
      ],
      loanAllocations: [
        {
          loanItemId: "loan_item_1",
          allocationType: "reversal",
          amountMinor: -40000,
          usdtCostMinor: -10800,
          allocationDate: "2026-04-26"
        }
      ]
    });
  });

  it("restores loan items allocated by a reversed writeoff", () => {
    const result = planSafeLoanReversalEffects({
      reversalDocumentId: "doc_reversal",
      originalDocumentId: "doc_writeoff",
      originalDocumentType: "loan_writeoff",
      reversalDate: "2026-04-26",
      createdLoanItems: [],
      originalAllocations: [
        {
          loanItemId: "loan_item_1",
          allocationType: "writeoff",
          amountMinor: 25000,
          usdtCostMinor: 6750
        }
      ],
      affectedLoanItems: [
        {
          id: "loan_item_1",
          originalAmountMinor: 100000,
          remainingAmountMinor: 75000,
          originalUsdtCostMinor: 27000,
          remainingUsdtCostMinor: 20250
        }
      ],
      laterAllocationLoanItemIds: []
    });

    expect(result.loanItemUpdates).toEqual([
      {
        loanItemId: "loan_item_1",
        amountDeltaMinor: 25000,
        usdtCostDeltaMinor: 6750,
        expectedRemainingAmountMinor: 75000,
        expectedRemainingUsdtCostMinor: 20250
      }
    ]);
    expect(result.loanAllocations).toEqual([
      {
        loanItemId: "loan_item_1",
        allocationType: "reversal",
        amountMinor: -25000,
        usdtCostMinor: -6750,
        allocationDate: "2026-04-26"
      }
    ]);
  });

  it("rejects reversal when affected loan items have later allocations", () => {
    expect(() =>
      planSafeLoanReversalEffects({
        reversalDocumentId: "doc_reversal",
        originalDocumentId: "doc_repay",
        originalDocumentType: "loan_repayment",
        reversalDate: "2026-04-26",
        createdLoanItems: [],
        originalAllocations: [
          { loanItemId: "loan_item_1", allocationType: "repayment", amountMinor: 40000, usdtCostMinor: 10800 }
        ],
        affectedLoanItems: [
          {
            id: "loan_item_1",
            originalAmountMinor: 100000,
            remainingAmountMinor: 60000,
            originalUsdtCostMinor: 27000,
            remainingUsdtCostMinor: 16200
          }
        ],
        laterAllocationLoanItemIds: ["loan_item_1"]
      })
    ).toThrow("Complex loan reversal requires manual review: affected loan items have later allocations");
  });

  it("rejects reversing a reduced loan_out item", () => {
    expect(() =>
      planSafeLoanReversalEffects({
        reversalDocumentId: "doc_reversal",
        originalDocumentId: "doc_loan",
        originalDocumentType: "loan_out",
        reversalDate: "2026-04-26",
        createdLoanItems: [
          {
            id: "loan_item_1",
            originalAmountMinor: 100000,
            remainingAmountMinor: 60000,
            originalUsdtCostMinor: 27000,
            remainingUsdtCostMinor: 16200
          }
        ],
        originalAllocations: [],
        laterAllocationLoanItemIds: []
      })
    ).toThrow("Complex loan reversal requires manual review: loan item has been reduced");
  });
});
