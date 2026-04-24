import { describe, expect, it } from "vitest";
import {
  planAccountTransferEffects,
  planExchangeLotCreation,
  planPettyCashIssueEffects,
  planPettyCashReimbursementEffects,
  planPettyCashReturnEffects
} from "../../src/domain/fifoEffects";
import type { Lot } from "../../src/domain/types";

const reserveLots: Lot[] = [
  {
    id: "lot_a",
    currencyCode: "AED",
    remainingAmountMinor: 150000,
    remainingUsdtCostMinor: 41000,
    lotDate: "2026-04-20"
  },
  {
    id: "lot_b",
    currencyCode: "AED",
    remainingAmountMinor: 100000,
    remainingUsdtCostMinor: 27300,
    lotDate: "2026-04-21"
  }
];

describe("fifoEffects", () => {
  it("plans exchange lot creation from received amount and USDT cost", () => {
    expect(
      planExchangeLotCreation({
        documentId: "doc_fx",
        accountId: "acct_aed_reserve",
        currencyCode: "AED",
        amountMinor: 367000,
        usdtCostMinor: 100000,
        lotDate: "2026-04-24"
      })
    ).toEqual({
      lotCreations: [
        {
          clientLotId: "doc_fx:lot:1",
          currencyCode: "AED",
          originalAmountMinor: 367000,
          remainingAmountMinor: 367000,
          originalUsdtCostMinor: 100000,
          remainingUsdtCostMinor: 100000,
          sourceDocumentId: "doc_fx",
          currentAccountId: "acct_aed_reserve",
          currentPersonId: null,
          lotDate: "2026-04-24"
        }
      ],
      lotUpdates: [],
      lotMovements: [
        {
          lotId: "doc_fx:lot:1",
          movementType: "exchange_in",
          fromAccountId: null,
          toAccountId: "acct_aed_reserve",
          fromPersonId: null,
          toPersonId: null,
          amountMinor: 367000,
          usdtCostMinor: 100000,
          movementDate: "2026-04-24"
        }
      ],
      pendingCostCreations: [],
      pendingCostUpdates: [],
      pendingCostApplications: []
    });
  });

  it("plans petty cash issue by moving reserve lots to staff lots", () => {
    const result = planPettyCashIssueEffects({
      documentId: "doc_issue",
      fromAccountId: "acct_aed_reserve",
      toAccountId: "acct_petty_bob",
      personId: "person_bob",
      currencyCode: "AED",
      amountMinor: 200000,
      businessDate: "2026-04-24",
      sourceLots: reserveLots,
      openPendingMatches: []
    });

    expect(result.lotUpdates).toEqual([
      {
        lotId: "lot_a",
        amountDeltaMinor: -150000,
        usdtCostDeltaMinor: -41000,
        expectedRemainingAmountMinor: 150000,
        expectedRemainingUsdtCostMinor: 41000
      },
      {
        lotId: "lot_b",
        amountDeltaMinor: -50000,
        usdtCostDeltaMinor: -13650,
        expectedRemainingAmountMinor: 100000,
        expectedRemainingUsdtCostMinor: 27300
      }
    ]);
    expect(result.lotCreations).toEqual([
      {
        clientLotId: "doc_issue:issue:1",
        currencyCode: "AED",
        originalAmountMinor: 150000,
        remainingAmountMinor: 150000,
        originalUsdtCostMinor: 41000,
        remainingUsdtCostMinor: 41000,
        sourceDocumentId: "doc_issue",
        currentAccountId: "acct_petty_bob",
        currentPersonId: "person_bob",
        lotDate: "2026-04-24"
      },
      {
        clientLotId: "doc_issue:issue:2",
        currencyCode: "AED",
        originalAmountMinor: 50000,
        remainingAmountMinor: 50000,
        originalUsdtCostMinor: 13650,
        remainingUsdtCostMinor: 13650,
        sourceDocumentId: "doc_issue",
        currentAccountId: "acct_petty_bob",
        currentPersonId: "person_bob",
        lotDate: "2026-04-24"
      }
    ]);
    expect(result.lotMovements).toEqual([
      {
        lotId: "lot_a",
        movementType: "petty_cash_issue",
        fromAccountId: "acct_aed_reserve",
        toAccountId: "acct_petty_bob",
        fromPersonId: null,
        toPersonId: "person_bob",
        amountMinor: 150000,
        usdtCostMinor: 41000,
        movementDate: "2026-04-24"
      },
      {
        lotId: "lot_b",
        movementType: "petty_cash_issue",
        fromAccountId: "acct_aed_reserve",
        toAccountId: "acct_petty_bob",
        fromPersonId: null,
        toPersonId: "person_bob",
        amountMinor: 50000,
        usdtCostMinor: 13650,
        movementDate: "2026-04-24"
      }
    ]);
    expect(result.pendingCostUpdates).toEqual([]);
  });

  it("matches newly issued petty cash against oldest pending costs first", () => {
    const result = planPettyCashIssueEffects({
      documentId: "doc_issue",
      fromAccountId: "acct_aed_reserve",
      toAccountId: "acct_petty_bob",
      personId: "person_bob",
      currencyCode: "AED",
      amountMinor: 200000,
      businessDate: "2026-04-24",
      sourceLots: reserveLots,
      openPendingMatches: [
        { id: "pending_old", remainingAmountMinor: 120000, expenseDate: "2026-04-22", createdAt: "2026-04-22T10:00:00.000Z" },
        { id: "pending_new", remainingAmountMinor: 100000, expenseDate: "2026-04-23", createdAt: "2026-04-23T10:00:00.000Z" }
      ]
    });

    expect(result.pendingCostUpdates).toEqual([
      { pendingCostMatchId: "pending_old", amountDeltaMinor: -120000, expectedRemainingAmountMinor: 120000 },
      { pendingCostMatchId: "pending_new", amountDeltaMinor: -80000, expectedRemainingAmountMinor: 100000 }
    ]);
    expect(result.lotCreations.map((lot) => lot.remainingAmountMinor)).toEqual([0, 0]);
    expect(result.lotCreations.map((lot) => lot.remainingUsdtCostMinor)).toEqual([0, 0]);
    expect(result.lotCreations.map((lot) => lot.clientLotId)).toEqual(["doc_issue:issue:1", "doc_issue:issue:2"]);
    expect(result.lotMovements.filter((movement) => movement.movementType === "pending_cost_match")).toEqual([
      {
        lotId: "doc_issue:issue:1",
        movementType: "pending_cost_match",
        fromAccountId: "acct_petty_bob",
        toAccountId: null,
        fromPersonId: "person_bob",
        toPersonId: null,
        amountMinor: 120000,
        usdtCostMinor: 32800,
        movementDate: "2026-04-24"
      },
      {
        lotId: "doc_issue:issue:1",
        movementType: "pending_cost_match",
        fromAccountId: "acct_petty_bob",
        toAccountId: null,
        fromPersonId: "person_bob",
        toPersonId: null,
        amountMinor: 30000,
        usdtCostMinor: 8200,
        movementDate: "2026-04-24"
      },
      {
        lotId: "doc_issue:issue:2",
        movementType: "pending_cost_match",
        fromAccountId: "acct_petty_bob",
        toAccountId: null,
        fromPersonId: "person_bob",
        toPersonId: null,
        amountMinor: 50000,
        usdtCostMinor: 13650,
        movementDate: "2026-04-24"
      }
    ]);
  });

  it("keeps unmatched issued amount and cost available after pending cost matching", () => {
    const result = planPettyCashIssueEffects({
      documentId: "doc_issue",
      fromAccountId: "acct_aed_reserve",
      toAccountId: "acct_petty_bob",
      personId: "person_bob",
      currencyCode: "AED",
      amountMinor: 200000,
      businessDate: "2026-04-24",
      sourceLots: reserveLots,
      openPendingMatches: [
        { id: "pending_partial", remainingAmountMinor: 160000, expenseDate: "2026-04-22", createdAt: "2026-04-22T10:00:00.000Z" }
      ]
    });

    expect(result.pendingCostUpdates).toEqual([
      { pendingCostMatchId: "pending_partial", amountDeltaMinor: -160000, expectedRemainingAmountMinor: 160000 }
    ]);
    expect(result.lotCreations.map((lot) => lot.remainingAmountMinor)).toEqual([0, 40000]);
    expect(result.lotCreations.map((lot) => lot.remainingUsdtCostMinor)).toEqual([0, 10920]);
  });

  it("uses created staff lot ids instead of source reserve lot ids for pending cost matches", () => {
    const result = planPettyCashIssueEffects({
      documentId: "doc_issue",
      fromAccountId: "acct_aed_reserve",
      toAccountId: "acct_petty_bob",
      personId: "person_bob",
      currencyCode: "AED",
      amountMinor: 200000,
      businessDate: "2026-04-24",
      sourceLots: reserveLots,
      openPendingMatches: [
        { id: "pending_partial", remainingAmountMinor: 160000, expenseDate: "2026-04-22", createdAt: "2026-04-22T10:00:00.000Z" }
      ]
    });

    const pendingCostLotIds = result.lotMovements
      .filter((movement) => movement.movementType === "pending_cost_match")
      .map((movement) => movement.lotId);

    expect(pendingCostLotIds).toEqual(["doc_issue:issue:1", "doc_issue:issue:2"]);
    expect(pendingCostLotIds).not.toContain("lot_a");
    expect(pendingCostLotIds).not.toContain("lot_b");
  });

  it("records pending cost application effects when petty cash issue matches pending costs", () => {
    const result = planPettyCashIssueEffects({
      documentId: "doc_issue",
      fromAccountId: "acct_company",
      toAccountId: "acct_staff",
      personId: "person_staff",
      currencyCode: "AED",
      amountMinor: 200000,
      businessDate: "2026-04-25",
      sourceLots: [
        {
          id: "lot_a",
          currencyCode: "AED",
          remainingAmountMinor: 200000,
          remainingUsdtCostMinor: 54000,
          lotDate: "2026-04-01"
        }
      ],
      openPendingMatches: [
        { id: "pending_old", remainingAmountMinor: 120000, expenseDate: "2026-04-20", createdAt: "2026-04-20T10:00:00.000Z" }
      ]
    });

    expect(result.pendingCostApplications).toEqual([
      {
        pendingCostMatchId: "pending_old",
        lotId: "doc_issue:issue:1",
        amountMinor: 120000,
        usdtCostMinor: 32400,
        applicationDate: "2026-04-25"
      }
    ]);
  });

  it("plans petty cash reimbursement with FIFO consumption and pending cost for unmatched amount", () => {
    const result = planPettyCashReimbursementEffects({
      documentId: "doc_reim",
      accountId: "acct_petty_bob",
      personId: "person_bob",
      currencyCode: "AED",
      amountMinor: 300000,
      expenseDate: "2026-04-24",
      sourceLots: reserveLots
    });

    expect(result.lotUpdates).toEqual([
      {
        lotId: "lot_a",
        amountDeltaMinor: -150000,
        usdtCostDeltaMinor: -41000,
        expectedRemainingAmountMinor: 150000,
        expectedRemainingUsdtCostMinor: 41000
      },
      {
        lotId: "lot_b",
        amountDeltaMinor: -100000,
        usdtCostDeltaMinor: -27300,
        expectedRemainingAmountMinor: 100000,
        expectedRemainingUsdtCostMinor: 27300
      }
    ]);
    expect(result.lotMovements).toEqual([
      {
        lotId: "lot_a",
        movementType: "petty_cash_reimbursement",
        fromAccountId: "acct_petty_bob",
        toAccountId: null,
        fromPersonId: "person_bob",
        toPersonId: null,
        amountMinor: 150000,
        usdtCostMinor: 41000,
        movementDate: "2026-04-24"
      },
      {
        lotId: "lot_b",
        movementType: "petty_cash_reimbursement",
        fromAccountId: "acct_petty_bob",
        toAccountId: null,
        fromPersonId: "person_bob",
        toPersonId: null,
        amountMinor: 100000,
        usdtCostMinor: 27300,
        movementDate: "2026-04-24"
      }
    ]);
    expect(result.pendingCostCreations).toEqual([
      {
        documentId: "doc_reim",
        personId: "person_bob",
        accountId: "acct_petty_bob",
        currencyCode: "AED",
        amountMinor: 50000,
        remainingAmountMinor: 50000,
        expenseDate: "2026-04-24"
      }
    ]);
  });

  it("plans account transfer by moving source lots to target account lots", () => {
    const result = planAccountTransferEffects({
      documentId: "doc_transfer",
      fromAccountId: "acct_aed_reserve",
      toAccountId: "acct_aed_bank",
      currencyCode: "AED",
      amountMinor: 200000,
      businessDate: "2026-04-24",
      sourceLots: reserveLots
    });

    expect(result.lotUpdates).toEqual([
      {
        lotId: "lot_a",
        amountDeltaMinor: -150000,
        usdtCostDeltaMinor: -41000,
        expectedRemainingAmountMinor: 150000,
        expectedRemainingUsdtCostMinor: 41000
      },
      {
        lotId: "lot_b",
        amountDeltaMinor: -50000,
        usdtCostDeltaMinor: -13650,
        expectedRemainingAmountMinor: 100000,
        expectedRemainingUsdtCostMinor: 27300
      }
    ]);
    expect(result.lotCreations).toEqual([
      {
        clientLotId: "doc_transfer:transfer:1",
        currencyCode: "AED",
        originalAmountMinor: 150000,
        remainingAmountMinor: 150000,
        originalUsdtCostMinor: 41000,
        remainingUsdtCostMinor: 41000,
        sourceDocumentId: "doc_transfer",
        currentAccountId: "acct_aed_bank",
        currentPersonId: null,
        lotDate: "2026-04-24"
      },
      {
        clientLotId: "doc_transfer:transfer:2",
        currencyCode: "AED",
        originalAmountMinor: 50000,
        remainingAmountMinor: 50000,
        originalUsdtCostMinor: 13650,
        remainingUsdtCostMinor: 13650,
        sourceDocumentId: "doc_transfer",
        currentAccountId: "acct_aed_bank",
        currentPersonId: null,
        lotDate: "2026-04-24"
      }
    ]);
    expect(result.lotMovements).toEqual([
      {
        lotId: "lot_a",
        movementType: "account_transfer",
        fromAccountId: "acct_aed_reserve",
        toAccountId: "acct_aed_bank",
        fromPersonId: null,
        toPersonId: null,
        amountMinor: 150000,
        usdtCostMinor: 41000,
        movementDate: "2026-04-24"
      },
      {
        lotId: "lot_b",
        movementType: "account_transfer",
        fromAccountId: "acct_aed_reserve",
        toAccountId: "acct_aed_bank",
        fromPersonId: null,
        toPersonId: null,
        amountMinor: 50000,
        usdtCostMinor: 13650,
        movementDate: "2026-04-24"
      }
    ]);
  });

  it("plans petty cash return by moving staff lots back to reserve lots", () => {
    const staffLots = [
      {
        id: "staff_lot_a",
        currencyCode: "AED",
        remainingAmountMinor: 90000,
        remainingUsdtCostMinor: 24570,
        lotDate: "2026-04-23"
      }
    ];

    const result = planPettyCashReturnEffects({
      documentId: "doc_return",
      fromAccountId: "acct_petty_bob",
      toAccountId: "acct_aed_reserve",
      personId: "person_bob",
      currencyCode: "AED",
      amountMinor: 80000,
      businessDate: "2026-04-24",
      sourceLots: staffLots
    });

    expect(result.lotUpdates).toEqual([
      {
        lotId: "staff_lot_a",
        amountDeltaMinor: -80000,
        usdtCostDeltaMinor: -21840,
        expectedRemainingAmountMinor: 90000,
        expectedRemainingUsdtCostMinor: 24570
      }
    ]);
    expect(result.lotCreations).toEqual([
      {
        clientLotId: "doc_return:return:1",
        currencyCode: "AED",
        originalAmountMinor: 80000,
        remainingAmountMinor: 80000,
        originalUsdtCostMinor: 21840,
        remainingUsdtCostMinor: 21840,
        sourceDocumentId: "doc_return",
        currentAccountId: "acct_aed_reserve",
        currentPersonId: null,
        lotDate: "2026-04-24"
      }
    ]);
    expect(result.lotMovements).toEqual([
      {
        lotId: "staff_lot_a",
        movementType: "petty_cash_return",
        fromAccountId: "acct_petty_bob",
        toAccountId: "acct_aed_reserve",
        fromPersonId: "person_bob",
        toPersonId: null,
        amountMinor: 80000,
        usdtCostMinor: 21840,
        movementDate: "2026-04-24"
      }
    ]);
  });

  it("throws when petty cash issue source lots are insufficient", () => {
    expect(() =>
      planPettyCashIssueEffects({
        documentId: "doc_issue",
        fromAccountId: "acct_aed_reserve",
        toAccountId: "acct_petty_bob",
        personId: "person_bob",
        currencyCode: "AED",
        amountMinor: 300000,
        businessDate: "2026-04-24",
        sourceLots: reserveLots,
        openPendingMatches: []
      })
    ).toThrow("Insufficient lot balance");
  });

  it("sorts pending matches by id when expense date and createdAt are equal", () => {
    const result = planPettyCashIssueEffects({
      documentId: "doc_issue",
      fromAccountId: "acct_aed_reserve",
      toAccountId: "acct_petty_bob",
      personId: "person_bob",
      currencyCode: "AED",
      amountMinor: 2000,
      businessDate: "2026-04-24",
      sourceLots: [
        {
          id: "lot_same_day",
          currencyCode: "AED",
          remainingAmountMinor: 2000,
          remainingUsdtCostMinor: 200,
          lotDate: "2026-04-20"
        }
      ],
      openPendingMatches: [
        { id: "pending_b", remainingAmountMinor: 1000, expenseDate: "2026-04-22", createdAt: "2026-04-22T10:00:00.000Z" },
        { id: "pending_a", remainingAmountMinor: 1000, expenseDate: "2026-04-22", createdAt: "2026-04-22T10:00:00.000Z" }
      ]
    });

    expect(result.pendingCostUpdates).toEqual([
      { pendingCostMatchId: "pending_a", amountDeltaMinor: -1000, expectedRemainingAmountMinor: 1000 },
      { pendingCostMatchId: "pending_b", amountDeltaMinor: -1000, expectedRemainingAmountMinor: 1000 }
    ]);
  });
});
