import { emptyFifoPostingEffects, type FifoPostingEffects, type LotMovementType } from "./fifoEffects";
import type { DocumentType } from "./types";

export interface OriginalLotMovement {
  id: string;
  lotId: string;
  movementType: LotMovementType;
  fromAccountId: string | null;
  toAccountId: string | null;
  fromPersonId: string | null;
  toPersonId: string | null;
  amountMinor: number;
  usdtCostMinor: number;
  createdAt: string;
}

export interface ReversalLotSnapshot {
  id: string;
  originalAmountMinor: number;
  remainingAmountMinor: number;
  originalUsdtCostMinor: number;
  remainingUsdtCostMinor: number;
  currentAccountId: string;
  currentPersonId: string | null;
  sourceDocumentId: string;
}

export interface ReversalPendingCostSnapshot {
  id: string;
  remainingAmountMinor: number;
}

export interface SafeFifoReversalInput {
  reversalDocumentId: string;
  originalDocumentId: string;
  originalDocumentType: DocumentType;
  reversalDate: string;
  originalMovements: OriginalLotMovement[];
  lots: ReversalLotSnapshot[];
  pendingCosts: ReversalPendingCostSnapshot[];
  laterMovementLotIds: string[];
}

export function planSafeFifoReversalEffects(input: SafeFifoReversalInput): FifoPostingEffects {
  requireNonEmpty(input.reversalDocumentId, "reversalDocumentId");
  const originalDocumentId = requireNonEmpty(input.originalDocumentId, "originalDocumentId");
  const reversalDate = requireNonEmpty(input.reversalDate, "reversalDate");

  if (!isFifoDocumentType(input.originalDocumentType)) {
    return emptyFifoPostingEffects();
  }
  if (input.laterMovementLotIds.length > 0) {
    throw new Error("Complex FIFO reversal requires manual review: affected lots have later movements");
  }
  if (input.pendingCosts.length > 0 || input.originalMovements.some((movement) => movement.movementType === "pending_cost_match")) {
    throw new Error("Complex FIFO reversal requires manual review: pending costs are involved");
  }

  if (input.originalDocumentType === "exchange") {
    return closeCreatedLots({
      originalDocumentId,
      reversalDate,
      lots: requireExchangeCreatedLots({
        originalDocumentId,
        movements: movementsOfType(input.originalMovements, "exchange_in"),
        lots: input.lots
      })
    });
  }

  if (input.originalDocumentType === "petty_cash_reimbursement") {
    return restoreMovementLots({
      reversalDate,
      movements: movementsOfType(input.originalMovements, "petty_cash_reimbursement"),
      lots: input.lots
    });
  }

  const movementType = movementTypeForTransferLike(input.originalDocumentType);
  if (!movementType) {
    return emptyFifoPostingEffects();
  }

  const movements = movementsOfType(input.originalMovements, movementType);
  const restoreEffects = restoreMovementLots({
    reversalDate,
    movements,
    lots: input.lots
  });
  const closeEffects = closeCreatedLots({
    originalDocumentId,
    reversalDate,
    lots: requireCreatedLotsForMovements(input.lots, originalDocumentId, movements)
  });

  return {
    lotCreations: [],
    lotUpdates: [...restoreEffects.lotUpdates, ...closeEffects.lotUpdates],
    lotMovements: restoreEffects.lotMovements,
    pendingCostCreations: [],
    pendingCostUpdates: [],
    pendingCostApplications: []
  };
}

function restoreMovementLots(input: {
  reversalDate: string;
  movements: OriginalLotMovement[];
  lots: ReversalLotSnapshot[];
}): FifoPostingEffects {
  const lotsById = new Map(input.lots.map((lot) => [lot.id, lot]));
  return {
    lotCreations: [],
    lotUpdates: input.movements.map((movement) => {
      const lot = requireLot(lotsById, movement.lotId);
      return {
        lotId: lot.id,
        amountDeltaMinor: requirePositiveSafeInteger(movement.amountMinor, "movement amountMinor"),
        usdtCostDeltaMinor: requirePositiveSafeInteger(movement.usdtCostMinor, "movement usdtCostMinor"),
        expectedRemainingAmountMinor: lot.remainingAmountMinor,
        expectedRemainingUsdtCostMinor: lot.remainingUsdtCostMinor
      };
    }),
    lotMovements: input.movements.map((movement) => ({
      lotId: movement.lotId,
      movementType: "fifo_reversal" as const,
      fromAccountId: movement.toAccountId,
      toAccountId: movement.fromAccountId,
      fromPersonId: movement.toPersonId,
      toPersonId: movement.fromPersonId,
      amountMinor: movement.amountMinor,
      usdtCostMinor: movement.usdtCostMinor,
      movementDate: input.reversalDate
    })),
    pendingCostCreations: [],
    pendingCostUpdates: [],
    pendingCostApplications: []
  };
}

function requireExchangeCreatedLots(input: {
  originalDocumentId: string;
  movements: OriginalLotMovement[];
  lots: ReversalLotSnapshot[];
}): ReversalLotSnapshot[] {
  const lotsById = new Map(input.lots.map((lot) => [lot.id, lot]));
  return input.movements.map((movement) => {
    const lot = requireLot(lotsById, movement.lotId);
    if (lot.sourceDocumentId !== input.originalDocumentId) {
      throw new Error(`Created lot snapshot is required for reversal: ${input.originalDocumentId}`);
    }
    return lot;
  });
}

function requireCreatedLotsForMovements(
  lots: ReversalLotSnapshot[],
  originalDocumentId: string,
  movements: OriginalLotMovement[]
): ReversalLotSnapshot[] {
  const createdLots = lots.filter((lot) => lot.sourceDocumentId === originalDocumentId);
  if (createdLots.length === 0) {
    throw new Error(`Created lot snapshot is required for reversal: ${originalDocumentId}`);
  }
  if (createdLots.length !== movements.length) {
    throw new Error(`Created lot snapshots do not match original FIFO movements for reversal: ${originalDocumentId}`);
  }
  return createdLots;
}

function closeCreatedLots(input: {
  originalDocumentId: string;
  reversalDate: string;
  lots: ReversalLotSnapshot[];
}): FifoPostingEffects {
  requireNonEmpty(input.originalDocumentId, "originalDocumentId");

  return {
    lotCreations: [],
    lotUpdates: input.lots.map((lot) => {
      if (lot.remainingAmountMinor !== lot.originalAmountMinor || lot.remainingUsdtCostMinor !== lot.originalUsdtCostMinor) {
        throw new Error("Complex FIFO reversal requires manual review: created lots are no longer fully available");
      }
      return {
        lotId: lot.id,
        amountDeltaMinor: -requirePositiveSafeInteger(lot.remainingAmountMinor, "lot remainingAmountMinor"),
        usdtCostDeltaMinor: -requirePositiveSafeInteger(lot.remainingUsdtCostMinor, "lot remainingUsdtCostMinor"),
        expectedRemainingAmountMinor: lot.remainingAmountMinor,
        expectedRemainingUsdtCostMinor: lot.remainingUsdtCostMinor
      };
    }),
    lotMovements: input.lots.map((lot) => ({
      lotId: lot.id,
      movementType: "fifo_reversal" as const,
      fromAccountId: lot.currentAccountId,
      toAccountId: null,
      fromPersonId: lot.currentPersonId,
      toPersonId: null,
      amountMinor: lot.remainingAmountMinor,
      usdtCostMinor: lot.remainingUsdtCostMinor,
      movementDate: input.reversalDate
    })),
    pendingCostCreations: [],
    pendingCostUpdates: [],
    pendingCostApplications: []
  };
}

function movementsOfType(movements: OriginalLotMovement[], movementType: LotMovementType): OriginalLotMovement[] {
  const filtered = movements.filter((movement) => movement.movementType === movementType);
  if (filtered.length === 0) {
    throw new Error("Original document has no FIFO movements to reverse");
  }
  return filtered;
}

function movementTypeForTransferLike(documentType: DocumentType): LotMovementType | null {
  if (documentType === "account_transfer") return "account_transfer";
  if (documentType === "petty_cash_issue") return "petty_cash_issue";
  if (documentType === "petty_cash_return") return "petty_cash_return";
  return null;
}

function isFifoDocumentType(documentType: DocumentType): boolean {
  return (
    documentType === "exchange" ||
    documentType === "account_transfer" ||
    documentType === "petty_cash_issue" ||
    documentType === "petty_cash_return" ||
    documentType === "petty_cash_reimbursement"
  );
}

function requireLot(lotsById: Map<string, ReversalLotSnapshot>, lotId: string): ReversalLotSnapshot {
  const lot = lotsById.get(lotId);
  if (!lot) throw new Error(`Lot snapshot is required for reversal: ${lotId}`);
  return lot;
}

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} must be non-empty`);
  return trimmed;
}

function requirePositiveSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer`);
  return value;
}
