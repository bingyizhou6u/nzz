import { allocateFifo } from "./fifo";
import type { Lot, LotAllocation } from "./types";

export type LotMovementType =
  | "exchange_in"
  | "account_transfer"
  | "petty_cash_issue"
  | "petty_cash_return"
  | "petty_cash_reimbursement"
  | "pending_cost_match"
  | "fifo_reversal";

export interface LotCreationEffect {
  clientLotId: string;
  currencyCode: string;
  originalAmountMinor: number;
  remainingAmountMinor: number;
  originalUsdtCostMinor: number;
  remainingUsdtCostMinor: number;
  sourceDocumentId: string;
  currentAccountId: string;
  currentPersonId: string | null;
  lotDate: string;
}

export interface LotUpdateEffect {
  lotId: string;
  amountDeltaMinor: number;
  usdtCostDeltaMinor: number;
  expectedRemainingAmountMinor: number;
  expectedRemainingUsdtCostMinor: number;
}

export interface LotMovementEffect {
  lotId: string;
  movementType: LotMovementType;
  fromAccountId: string | null;
  toAccountId: string | null;
  fromPersonId: string | null;
  toPersonId: string | null;
  amountMinor: number;
  usdtCostMinor: number;
  movementDate: string;
}

export interface PendingCostCreationEffect {
  documentId: string;
  personId: string;
  accountId: string;
  currencyCode: string;
  amountMinor: number;
  remainingAmountMinor: number;
  expenseDate: string;
}

export interface PendingCostUpdateEffect {
  pendingCostMatchId: string;
  amountDeltaMinor: number;
  expectedRemainingAmountMinor: number;
}

export interface OpenPendingCostMatch {
  id: string;
  remainingAmountMinor: number;
  expenseDate: string;
  createdAt: string;
}

export interface FifoPostingEffects {
  lotCreations: LotCreationEffect[];
  lotUpdates: LotUpdateEffect[];
  lotMovements: LotMovementEffect[];
  pendingCostCreations: PendingCostCreationEffect[];
  pendingCostUpdates: PendingCostUpdateEffect[];
}

export interface ExchangeLotCreationInput {
  documentId: string;
  accountId: string;
  currencyCode: string;
  amountMinor: number;
  usdtCostMinor: number;
  lotDate: string;
}

export interface AccountTransferEffectsInput {
  documentId: string;
  fromAccountId: string;
  toAccountId: string;
  currencyCode: string;
  amountMinor: number;
  businessDate: string;
  sourceLots: Lot[];
}

export interface PettyCashReturnEffectsInput extends AccountTransferEffectsInput {
  personId: string;
}

export interface PettyCashIssueEffectsInput {
  documentId: string;
  fromAccountId: string;
  toAccountId: string;
  personId: string;
  currencyCode: string;
  amountMinor: number;
  businessDate: string;
  sourceLots: Lot[];
  openPendingMatches: OpenPendingCostMatch[];
}

export interface PettyCashReimbursementEffectsInput {
  documentId: string;
  accountId: string;
  personId: string;
  currencyCode: string;
  amountMinor: number;
  expenseDate: string;
  sourceLots: Lot[];
}

interface IssuedLotState {
  creation: LotCreationEffect;
}

export function emptyFifoPostingEffects(): FifoPostingEffects {
  return {
    lotCreations: [],
    lotUpdates: [],
    lotMovements: [],
    pendingCostCreations: [],
    pendingCostUpdates: []
  };
}

export function planExchangeLotCreation(input: ExchangeLotCreationInput): FifoPostingEffects {
  const documentId = requireNonEmpty(input.documentId, "documentId");
  const accountId = requireNonEmpty(input.accountId, "accountId");
  const currencyCode = requireNonEmpty(input.currencyCode, "currencyCode");
  const amountMinor = requirePositiveSafeInteger(input.amountMinor, "amountMinor");
  const usdtCostMinor = requirePositiveSafeInteger(input.usdtCostMinor, "usdtCostMinor");
  const lotDate = requireNonEmpty(input.lotDate, "lotDate");
  const clientLotId = `${documentId}:lot:1`;

  return {
    lotCreations: [
      {
        clientLotId,
        currencyCode,
        originalAmountMinor: amountMinor,
        remainingAmountMinor: amountMinor,
        originalUsdtCostMinor: usdtCostMinor,
        remainingUsdtCostMinor: usdtCostMinor,
        sourceDocumentId: documentId,
        currentAccountId: accountId,
        currentPersonId: null,
        lotDate
      }
    ],
    lotUpdates: [],
    lotMovements: [
      {
        lotId: clientLotId,
        movementType: "exchange_in",
        fromAccountId: null,
        toAccountId: accountId,
        fromPersonId: null,
        toPersonId: null,
        amountMinor,
        usdtCostMinor,
        movementDate: lotDate
      }
    ],
    pendingCostCreations: [],
    pendingCostUpdates: []
  };
}

export function planAccountTransferEffects(input: AccountTransferEffectsInput): FifoPostingEffects {
  return planLotTransfer({
    documentId: input.documentId,
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    fromPersonId: null,
    toPersonId: null,
    currencyCode: input.currencyCode,
    amountMinor: input.amountMinor,
    businessDate: input.businessDate,
    sourceLots: input.sourceLots,
    movementType: "account_transfer",
    clientLotPrefix: "transfer"
  });
}

export function planPettyCashReturnEffects(input: PettyCashReturnEffectsInput): FifoPostingEffects {
  const personId = requireNonEmpty(input.personId, "personId");
  return planLotTransfer({
    documentId: input.documentId,
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    fromPersonId: personId,
    toPersonId: null,
    currencyCode: input.currencyCode,
    amountMinor: input.amountMinor,
    businessDate: input.businessDate,
    sourceLots: input.sourceLots,
    movementType: "petty_cash_return",
    clientLotPrefix: "return"
  });
}

export function planPettyCashIssueEffects(input: PettyCashIssueEffectsInput): FifoPostingEffects {
  const documentId = requireNonEmpty(input.documentId, "documentId");
  const fromAccountId = requireNonEmpty(input.fromAccountId, "fromAccountId");
  const toAccountId = requireNonEmpty(input.toAccountId, "toAccountId");
  const personId = requireNonEmpty(input.personId, "personId");
  const currencyCode = requireNonEmpty(input.currencyCode, "currencyCode");
  const businessDate = requireNonEmpty(input.businessDate, "businessDate");
  const allocationResult = allocateFifo(input.sourceLots, input.amountMinor, currencyCode);
  const lotCreations = allocationResult.allocations.map((allocation, index) =>
    staffLotCreation(allocation, `${documentId}:issue:${index + 1}`, documentId, toAccountId, personId, currencyCode, businessDate)
  );
  const issuedLots = lotCreations.map((creation) => ({ creation }));
  const pendingCostApplication = applyPendingCostMatches({
    pendingMatches: input.openPendingMatches,
    issuedLots,
    accountId: toAccountId,
    personId,
    movementDate: businessDate
  });

  return {
    lotCreations,
    lotUpdates: lotUpdatesForAllocations(allocationResult.allocations),
    lotMovements: [
      ...allocationResult.allocations.map((allocation) => ({
        lotId: allocation.lotId,
        movementType: "petty_cash_issue" as const,
        fromAccountId,
        toAccountId,
        fromPersonId: null,
        toPersonId: personId,
        amountMinor: allocation.amountMinor,
        usdtCostMinor: allocation.usdtCostMinor,
        movementDate: businessDate
      })),
      ...pendingCostApplication.lotMovements
    ],
    pendingCostCreations: [],
    pendingCostUpdates: pendingCostApplication.pendingCostUpdates
  };
}

export function planPettyCashReimbursementEffects(input: PettyCashReimbursementEffectsInput): FifoPostingEffects {
  const documentId = requireNonEmpty(input.documentId, "documentId");
  const accountId = requireNonEmpty(input.accountId, "accountId");
  const personId = requireNonEmpty(input.personId, "personId");
  const currencyCode = requireNonEmpty(input.currencyCode, "currencyCode");
  const expenseDate = requireNonEmpty(input.expenseDate, "expenseDate");
  const allocationResult = allocateFifo(input.sourceLots, input.amountMinor, currencyCode, { allowUnmatched: true });
  const pendingCostCreations =
    allocationResult.unmatchedAmountMinor > 0
      ? [
          {
            documentId,
            personId,
            accountId,
            currencyCode,
            amountMinor: allocationResult.unmatchedAmountMinor,
            remainingAmountMinor: allocationResult.unmatchedAmountMinor,
            expenseDate
          }
        ]
      : [];

  return {
    lotCreations: [],
    lotUpdates: lotUpdatesForAllocations(allocationResult.allocations),
    lotMovements: allocationResult.allocations.map((allocation) => ({
      lotId: allocation.lotId,
      movementType: "petty_cash_reimbursement",
      fromAccountId: accountId,
      toAccountId: null,
      fromPersonId: personId,
      toPersonId: null,
      amountMinor: allocation.amountMinor,
      usdtCostMinor: allocation.usdtCostMinor,
      movementDate: expenseDate
    })),
    pendingCostCreations,
    pendingCostUpdates: []
  };
}

function planLotTransfer(input: {
  documentId: string;
  fromAccountId: string;
  toAccountId: string;
  fromPersonId: string | null;
  toPersonId: string | null;
  currencyCode: string;
  amountMinor: number;
  businessDate: string;
  sourceLots: Lot[];
  movementType: LotMovementType;
  clientLotPrefix: string;
}): FifoPostingEffects {
  const documentId = requireNonEmpty(input.documentId, "documentId");
  const fromAccountId = requireNonEmpty(input.fromAccountId, "fromAccountId");
  const toAccountId = requireNonEmpty(input.toAccountId, "toAccountId");
  const currencyCode = requireNonEmpty(input.currencyCode, "currencyCode");
  const businessDate = requireNonEmpty(input.businessDate, "businessDate");
  const allocationResult = allocateFifo(input.sourceLots, input.amountMinor, currencyCode);

  return {
    lotCreations: allocationResult.allocations.map((allocation, index) =>
      transferredLotCreation(
        allocation,
        `${documentId}:${input.clientLotPrefix}:${index + 1}`,
        documentId,
        toAccountId,
        input.toPersonId,
        currencyCode,
        businessDate
      )
    ),
    lotUpdates: lotUpdatesForAllocations(allocationResult.allocations),
    lotMovements: allocationResult.allocations.map((allocation) => ({
      lotId: allocation.lotId,
      movementType: input.movementType,
      fromAccountId,
      toAccountId,
      fromPersonId: input.fromPersonId,
      toPersonId: input.toPersonId,
      amountMinor: allocation.amountMinor,
      usdtCostMinor: allocation.usdtCostMinor,
      movementDate: businessDate
    })),
    pendingCostCreations: [],
    pendingCostUpdates: []
  };
}

function transferredLotCreation(
  allocation: LotAllocation,
  clientLotId: string,
  documentId: string,
  accountId: string,
  personId: string | null,
  currencyCode: string,
  lotDate: string
): LotCreationEffect {
  return {
    clientLotId,
    currencyCode,
    originalAmountMinor: allocation.amountMinor,
    remainingAmountMinor: allocation.amountMinor,
    originalUsdtCostMinor: allocation.usdtCostMinor,
    remainingUsdtCostMinor: allocation.usdtCostMinor,
    sourceDocumentId: documentId,
    currentAccountId: accountId,
    currentPersonId: personId,
    lotDate
  };
}

function staffLotCreation(
  allocation: LotAllocation,
  clientLotId: string,
  documentId: string,
  accountId: string,
  personId: string,
  currencyCode: string,
  lotDate: string
): LotCreationEffect {
  return {
    clientLotId,
    currencyCode,
    originalAmountMinor: allocation.amountMinor,
    remainingAmountMinor: allocation.amountMinor,
    originalUsdtCostMinor: allocation.usdtCostMinor,
    remainingUsdtCostMinor: allocation.usdtCostMinor,
    sourceDocumentId: documentId,
    currentAccountId: accountId,
    currentPersonId: personId,
    lotDate
  };
}

function lotUpdatesForAllocations(allocations: LotAllocation[]): LotUpdateEffect[] {
  return allocations.map((allocation) => ({
    lotId: allocation.lotId,
    amountDeltaMinor: -allocation.amountMinor,
    usdtCostDeltaMinor: -allocation.usdtCostMinor,
    expectedRemainingAmountMinor: allocation.remainingAmountMinorBefore,
    expectedRemainingUsdtCostMinor: allocation.remainingUsdtCostMinorBefore
  }));
}

function applyPendingCostMatches(input: {
  pendingMatches: OpenPendingCostMatch[];
  issuedLots: IssuedLotState[];
  accountId: string;
  personId: string;
  movementDate: string;
}): { pendingCostUpdates: PendingCostUpdateEffect[]; lotMovements: LotMovementEffect[] } {
  const pendingCostUpdates: PendingCostUpdateEffect[] = [];
  const lotMovements: LotMovementEffect[] = [];

  for (const pendingMatch of sortPendingMatches(input.pendingMatches)) {
    const pendingCostMatchId = requireNonEmpty(pendingMatch.id, "pendingCostMatchId");
    const expectedRemainingAmountMinor = requirePositiveSafeInteger(
      pendingMatch.remainingAmountMinor,
      "pending remainingAmountMinor"
    );
    let remainingPendingAmount = expectedRemainingAmountMinor;
    let matchedAmount = 0;

    for (const issuedLot of input.issuedLots) {
      if (remainingPendingAmount === 0) break;
      if (issuedLot.creation.remainingAmountMinor === 0) continue;

      const amountMinor = Math.min(remainingPendingAmount, issuedLot.creation.remainingAmountMinor);
      const usdtCostMinor = proportionalCost(
        amountMinor,
        issuedLot.creation.remainingAmountMinor,
        issuedLot.creation.remainingUsdtCostMinor
      );

      issuedLot.creation.remainingAmountMinor -= amountMinor;
      issuedLot.creation.remainingUsdtCostMinor -= usdtCostMinor;
      remainingPendingAmount -= amountMinor;
      matchedAmount += amountMinor;

      lotMovements.push({
        lotId: issuedLot.creation.clientLotId,
        movementType: "pending_cost_match",
        fromAccountId: input.accountId,
        toAccountId: null,
        fromPersonId: input.personId,
        toPersonId: null,
        amountMinor,
        usdtCostMinor,
        movementDate: input.movementDate
      });
    }

    if (matchedAmount > 0) {
      pendingCostUpdates.push({
        pendingCostMatchId,
        amountDeltaMinor: -matchedAmount,
        expectedRemainingAmountMinor
      });
    }
  }

  return { pendingCostUpdates, lotMovements };
}

function sortPendingMatches(pendingMatches: OpenPendingCostMatch[]): OpenPendingCostMatch[] {
  return [...pendingMatches].sort(
    (a, b) => a.expenseDate.localeCompare(b.expenseDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
  );
}

function proportionalCost(amountMinor: number, remainingAmountMinor: number, remainingUsdtCostMinor: number): number {
  if (amountMinor === remainingAmountMinor) return remainingUsdtCostMinor;
  return Math.round((amountMinor / remainingAmountMinor) * remainingUsdtCostMinor);
}

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} must be non-empty`);
  }
  return trimmed;
}

function requirePositiveSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value;
}
