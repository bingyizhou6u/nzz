import { describe, expect, it } from "vitest";
import {
  planLoanOutEffects,
  planLoanReductionEffects,
  type OpenLoanItem
} from "../../src/domain/loanEffects";

const openLoanItems: OpenLoanItem[] = [
  {
    id: "loan_item_old",
    sourceDocumentId: "doc_old_loan",
    borrowerPersonId: "person_borrower",
    currencyCode: "AED",
    remainingAmountMinor: 100000,
    remainingUsdtCostMinor: 27000,
    loanDate: "2026-04-01",
    createdAt: "2026-04-01T10:00:00.000Z"
  },
  {
    id: "loan_item_new",
    sourceDocumentId: "doc_new_loan",
    borrowerPersonId: "person_borrower",
    currencyCode: "AED",
    remainingAmountMinor: 50000,
    remainingUsdtCostMinor: 14000,
    loanDate: "2026-04-03",
    createdAt: "2026-04-03T10:00:00.000Z"
  }
];

describe("loanEffects", () => {
  it("creates one loan item per loan-out line with explicit USDT cost", () => {
    expect(
      planLoanOutEffects({
        documentId: "doc_loan",
        borrowerPersonId: "person_borrower",
        loanDate: "2026-04-25",
        lines: [
          { lineId: "line_1", currencyCode: "AED", amountMinor: 367000, usdtCostMinor: 100000 }
        ]
      })
    ).toEqual({
      loanItemCreations: [
        {
          clientLoanItemId: "doc_loan:loan:1",
          sourceDocumentId: "doc_loan",
          sourceLineId: "line_1",
          borrowerPersonId: "person_borrower",
          currencyCode: "AED",
          originalAmountMinor: 367000,
          remainingAmountMinor: 367000,
          originalUsdtCostMinor: 100000,
          remainingUsdtCostMinor: 100000,
          loanDate: "2026-04-25"
        }
      ],
      loanItemUpdates: [],
      loanAllocations: []
    });
  });

  it("defaults USDT loan cost to principal amount", () => {
    const result = planLoanOutEffects({
      documentId: "doc_loan",
      borrowerPersonId: "person_borrower",
      loanDate: "2026-04-25",
      lines: [{ lineId: "line_1", currencyCode: "USDT", amountMinor: 50000, usdtCostMinor: null }]
    });

    expect(result.loanItemCreations[0].originalUsdtCostMinor).toBe(50000);
    expect(result.loanItemCreations[0].remainingUsdtCostMinor).toBe(50000);
  });

  it("requires explicit USDT cost for non-USDT loan out", () => {
    expect(() =>
      planLoanOutEffects({
        documentId: "doc_loan",
        borrowerPersonId: "person_borrower",
        loanDate: "2026-04-25",
        lines: [{ lineId: "line_1", currencyCode: "AED", amountMinor: 100000, usdtCostMinor: null }]
      })
    ).toThrow("line usdtCostMinor is required for non-USDT loan_out");
  });

  it("allocates repayment to oldest open loan items first", () => {
    expect(
      planLoanReductionEffects({
        documentId: "doc_repay",
        borrowerPersonId: "person_borrower",
        currencyCode: "AED",
        amountMinor: 120000,
        reductionDate: "2026-04-25",
        allocationType: "repayment",
        openLoanItems
      })
    ).toEqual({
      loanItemCreations: [],
      loanItemUpdates: [
        {
          loanItemId: "loan_item_old",
          amountDeltaMinor: -100000,
          usdtCostDeltaMinor: -27000,
          expectedRemainingAmountMinor: 100000,
          expectedRemainingUsdtCostMinor: 27000
        },
        {
          loanItemId: "loan_item_new",
          amountDeltaMinor: -20000,
          usdtCostDeltaMinor: -5600,
          expectedRemainingAmountMinor: 50000,
          expectedRemainingUsdtCostMinor: 14000
        }
      ],
      loanAllocations: [
        {
          loanItemId: "loan_item_old",
          allocationType: "repayment",
          amountMinor: 100000,
          usdtCostMinor: 27000,
          allocationDate: "2026-04-25"
        },
        {
          loanItemId: "loan_item_new",
          allocationType: "repayment",
          amountMinor: 20000,
          usdtCostMinor: 5600,
          allocationDate: "2026-04-25"
        }
      ]
    });
  });

  it("targets one loan-out document when targetSourceDocumentId is supplied", () => {
    const result = planLoanReductionEffects({
      documentId: "doc_repay",
      borrowerPersonId: "person_borrower",
      currencyCode: "AED",
      amountMinor: 30000,
      reductionDate: "2026-04-25",
      allocationType: "repayment",
      targetSourceDocumentId: "doc_new_loan",
      openLoanItems
    });

    expect(result.loanAllocations.map((allocation) => allocation.loanItemId)).toEqual(["loan_item_new"]);
  });

  it("plans writeoff allocations with writeoff type", () => {
    const result = planLoanReductionEffects({
      documentId: "doc_writeoff",
      borrowerPersonId: "person_borrower",
      currencyCode: "AED",
      amountMinor: 25000,
      reductionDate: "2026-04-25",
      allocationType: "writeoff",
      openLoanItems
    });

    expect(result.loanAllocations).toEqual([
      {
        loanItemId: "loan_item_old",
        allocationType: "writeoff",
        amountMinor: 25000,
        usdtCostMinor: 6750,
        allocationDate: "2026-04-25"
      }
    ]);
  });

  it("throws when loan balance is insufficient", () => {
    expect(() =>
      planLoanReductionEffects({
        documentId: "doc_repay",
        borrowerPersonId: "person_borrower",
        currencyCode: "AED",
        amountMinor: 200000,
        reductionDate: "2026-04-25",
        allocationType: "repayment",
        openLoanItems
      })
    ).toThrow("Insufficient loan item balance");
  });
});
