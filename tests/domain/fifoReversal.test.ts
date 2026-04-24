import { describe, expect, it } from "vitest";
import { planSafeFifoReversalEffects } from "../../src/domain/fifoReversal";

describe("planSafeFifoReversalEffects", () => {
  it("closes an unconsumed exchange-created lot", () => {
    expect(
      planSafeFifoReversalEffects({
        reversalDocumentId: "doc_rev",
        originalDocumentId: "doc_fx",
        originalDocumentType: "exchange",
        reversalDate: "2026-04-25",
        originalMovements: [
          {
            id: "move_fx",
            lotId: "lot_fx",
            movementType: "exchange_in",
            fromAccountId: null,
            toAccountId: "acct_aed_reserve",
            fromPersonId: null,
            toPersonId: null,
            amountMinor: 367000,
            usdtCostMinor: 100000,
            createdAt: "2026-04-24T10:00:00.000Z"
          }
        ],
        lots: [
          {
            id: "lot_fx",
            originalAmountMinor: 367000,
            remainingAmountMinor: 367000,
            originalUsdtCostMinor: 100000,
            remainingUsdtCostMinor: 100000,
            currentAccountId: "acct_aed_reserve",
            currentPersonId: null,
            sourceDocumentId: "doc_fx"
          }
        ],
        pendingCosts: [],
        laterMovementLotIds: []
      })
    ).toEqual({
      lotCreations: [],
      lotUpdates: [
        {
          lotId: "lot_fx",
          amountDeltaMinor: -367000,
          usdtCostDeltaMinor: -100000,
          expectedRemainingAmountMinor: 367000,
          expectedRemainingUsdtCostMinor: 100000
        }
      ],
      lotMovements: [
        {
          lotId: "lot_fx",
          movementType: "fifo_reversal",
          fromAccountId: "acct_aed_reserve",
          toAccountId: null,
          fromPersonId: null,
          toPersonId: null,
          amountMinor: 367000,
          usdtCostMinor: 100000,
          movementDate: "2026-04-25"
        }
      ],
      pendingCostCreations: [],
      pendingCostUpdates: []
    });
  });

  it("restores transfer source lots and closes target lots created by the original transfer", () => {
    const result = planSafeFifoReversalEffects({
      reversalDocumentId: "doc_rev",
      originalDocumentId: "doc_transfer",
      originalDocumentType: "account_transfer",
      reversalDate: "2026-04-25",
      originalMovements: [
        {
          id: "move_transfer",
          lotId: "lot_source",
          movementType: "account_transfer",
          fromAccountId: "acct_aed_reserve",
          toAccountId: "acct_aed_bank",
          fromPersonId: null,
          toPersonId: null,
          amountMinor: 50000,
          usdtCostMinor: 13650,
          createdAt: "2026-04-24T10:00:00.000Z"
        }
      ],
      lots: [
        {
          id: "lot_source",
          originalAmountMinor: 100000,
          remainingAmountMinor: 50000,
          originalUsdtCostMinor: 27300,
          remainingUsdtCostMinor: 13650,
          currentAccountId: "acct_aed_reserve",
          currentPersonId: null,
          sourceDocumentId: "doc_fx"
        },
        {
          id: "lot_created",
          originalAmountMinor: 50000,
          remainingAmountMinor: 50000,
          originalUsdtCostMinor: 13650,
          remainingUsdtCostMinor: 13650,
          currentAccountId: "acct_aed_bank",
          currentPersonId: null,
          sourceDocumentId: "doc_transfer"
        }
      ],
      pendingCosts: [],
      laterMovementLotIds: []
    });

    expect(result.lotUpdates).toEqual([
      {
        lotId: "lot_source",
        amountDeltaMinor: 50000,
        usdtCostDeltaMinor: 13650,
        expectedRemainingAmountMinor: 50000,
        expectedRemainingUsdtCostMinor: 13650
      },
      {
        lotId: "lot_created",
        amountDeltaMinor: -50000,
        usdtCostDeltaMinor: -13650,
        expectedRemainingAmountMinor: 50000,
        expectedRemainingUsdtCostMinor: 13650
      }
    ]);
    expect(result.lotMovements).toEqual([
      {
        lotId: "lot_source",
        movementType: "fifo_reversal",
        fromAccountId: "acct_aed_bank",
        toAccountId: "acct_aed_reserve",
        fromPersonId: null,
        toPersonId: null,
        amountMinor: 50000,
        usdtCostMinor: 13650,
        movementDate: "2026-04-25"
      }
    ]);
  });

  it("restores reimbursement-consumed staff lots when no pending cost was created", () => {
    expect(
      planSafeFifoReversalEffects({
        reversalDocumentId: "doc_rev",
        originalDocumentId: "doc_reim",
        originalDocumentType: "petty_cash_reimbursement",
        reversalDate: "2026-04-25",
        originalMovements: [
          {
            id: "move_reim",
            lotId: "staff_lot",
            movementType: "petty_cash_reimbursement",
            fromAccountId: "acct_petty_bob",
            toAccountId: null,
            fromPersonId: "person_bob",
            toPersonId: null,
            amountMinor: 80000,
            usdtCostMinor: 21840,
            createdAt: "2026-04-24T10:00:00.000Z"
          }
        ],
        lots: [
          {
            id: "staff_lot",
            originalAmountMinor: 90000,
            remainingAmountMinor: 10000,
            originalUsdtCostMinor: 24570,
            remainingUsdtCostMinor: 2730,
            currentAccountId: "acct_petty_bob",
            currentPersonId: "person_bob",
            sourceDocumentId: "doc_issue"
          }
        ],
        pendingCosts: [],
        laterMovementLotIds: []
      }).lotUpdates
    ).toEqual([
      {
        lotId: "staff_lot",
        amountDeltaMinor: 80000,
        usdtCostDeltaMinor: 21840,
        expectedRemainingAmountMinor: 10000,
        expectedRemainingUsdtCostMinor: 2730
      }
    ]);
  });

  it("rejects reversal when affected lots have later movements", () => {
    expect(() =>
      planSafeFifoReversalEffects({
        reversalDocumentId: "doc_rev",
        originalDocumentId: "doc_transfer",
        originalDocumentType: "account_transfer",
        reversalDate: "2026-04-25",
        originalMovements: [],
        lots: [],
        pendingCosts: [],
        laterMovementLotIds: ["lot_source"]
      })
    ).toThrow("Complex FIFO reversal requires manual review: affected lots have later movements");
  });

  it("rejects reversal when pending costs are involved", () => {
    expect(() =>
      planSafeFifoReversalEffects({
        reversalDocumentId: "doc_rev",
        originalDocumentId: "doc_reim",
        originalDocumentType: "petty_cash_reimbursement",
        reversalDate: "2026-04-25",
        originalMovements: [],
        lots: [],
        pendingCosts: [{ id: "pending_1", remainingAmountMinor: 1000 }],
        laterMovementLotIds: []
      })
    ).toThrow("Complex FIFO reversal requires manual review: pending costs are involved");
  });
});
