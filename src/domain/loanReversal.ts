import { emptyLoanPostingEffects, type LoanPostingEffects } from "./loanEffects";
import type { DocumentType } from "./types";

export interface LoanItemSnapshot {
  id: string;
  originalAmountMinor: number;
  remainingAmountMinor: number;
  originalUsdtCostMinor: number;
  remainingUsdtCostMinor: number;
}

export interface LoanAllocationSnapshot {
  loanItemId: string;
  allocationType: string;
  amountMinor: number;
  usdtCostMinor: number;
}

export function planSafeLoanReversalEffects(input: {
  reversalDocumentId: string;
  originalDocumentId: string;
  originalDocumentType: DocumentType;
  reversalDate: string;
  createdLoanItems?: LoanItemSnapshot[];
  affectedLoanItems?: LoanItemSnapshot[];
  originalAllocations?: LoanAllocationSnapshot[];
  laterAllocationLoanItemIds: string[];
}): LoanPostingEffects {
  requireNonEmpty(input.reversalDocumentId, "reversalDocumentId");
  requireNonEmpty(input.originalDocumentId, "originalDocumentId");
  const reversalDate = requireNonEmpty(input.reversalDate, "reversalDate");

  if (input.laterAllocationLoanItemIds.length > 0) {
    throw new Error("Complex loan reversal requires manual review: affected loan items have later allocations");
  }

  if (input.originalDocumentType === "loan_out") {
    return reverseLoanOut(input.createdLoanItems ?? [], reversalDate);
  }

  if (input.originalDocumentType === "loan_repayment" || input.originalDocumentType === "loan_writeoff") {
    return reverseLoanReduction(input.originalAllocations ?? [], input.affectedLoanItems ?? [], reversalDate);
  }

  return emptyLoanPostingEffects();
}

function reverseLoanOut(createdLoanItems: LoanItemSnapshot[], reversalDate: string): LoanPostingEffects {
  if (createdLoanItems.length === 0) {
    throw new Error("Complex loan reversal requires manual review: loan item snapshots are missing");
  }

  return {
    loanItemCreations: [],
    loanItemUpdates: createdLoanItems.map((item) => {
      assertFullyRemaining(item);
      return {
        loanItemId: item.id,
        amountDeltaMinor: -requirePositiveSafeInteger(item.remainingAmountMinor, "remainingAmountMinor"),
        usdtCostDeltaMinor: -requirePositiveSafeInteger(item.remainingUsdtCostMinor, "remainingUsdtCostMinor"),
        expectedRemainingAmountMinor: item.remainingAmountMinor,
        expectedRemainingUsdtCostMinor: item.remainingUsdtCostMinor
      };
    }),
    loanAllocations: createdLoanItems.map((item) => ({
      loanItemId: item.id,
      allocationType: "reversal",
      amountMinor: item.remainingAmountMinor,
      usdtCostMinor: item.remainingUsdtCostMinor,
      allocationDate: reversalDate
    }))
  };
}

function reverseLoanReduction(
  allocations: LoanAllocationSnapshot[],
  affectedLoanItems: LoanItemSnapshot[],
  reversalDate: string
): LoanPostingEffects {
  if (allocations.length === 0) {
    throw new Error("Complex loan reversal requires manual review: loan allocation snapshots are missing");
  }

  const itemsById = new Map(affectedLoanItems.map((item) => [item.id, item]));

  return {
    loanItemCreations: [],
    loanItemUpdates: allocations.map((allocation) => {
      const item = itemsById.get(allocation.loanItemId);
      if (!item) throw new Error("Affected loan item snapshot is required for loan reversal");
      return {
        loanItemId: allocation.loanItemId,
        amountDeltaMinor: requirePositiveSafeInteger(allocation.amountMinor, "allocation amountMinor"),
        usdtCostDeltaMinor: requirePositiveSafeInteger(allocation.usdtCostMinor, "allocation usdtCostMinor"),
        expectedRemainingAmountMinor: item.remainingAmountMinor,
        expectedRemainingUsdtCostMinor: item.remainingUsdtCostMinor
      };
    }),
    loanAllocations: allocations.map((allocation) => ({
      loanItemId: allocation.loanItemId,
      allocationType: "reversal",
      amountMinor: -requirePositiveSafeInteger(allocation.amountMinor, "allocation amountMinor"),
      usdtCostMinor: -requirePositiveSafeInteger(allocation.usdtCostMinor, "allocation usdtCostMinor"),
      allocationDate: reversalDate
    }))
  };
}

function assertFullyRemaining(item: LoanItemSnapshot) {
  requireNonEmpty(item.id, "loanItemId");
  requirePositiveSafeInteger(item.originalAmountMinor, "originalAmountMinor");
  requirePositiveSafeInteger(item.originalUsdtCostMinor, "originalUsdtCostMinor");
  if (item.remainingAmountMinor !== item.originalAmountMinor || item.remainingUsdtCostMinor !== item.originalUsdtCostMinor) {
    throw new Error("Complex loan reversal requires manual review: loan item has been reduced");
  }
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
