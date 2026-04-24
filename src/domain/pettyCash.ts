import { allocateFifo } from "./fifo";
import type { Lot, LotAllocation } from "./types";

export interface PettyCashReimbursementInput {
  personId: string;
  accountId: string;
  currencyCode: string;
  expenseDate: string;
  amountMinor: number;
  lots: Lot[];
}

interface PettyCashPendingMatch {
  personId: string;
  accountId: string;
  currencyCode: string;
  amountMinor: number;
  expenseDate: string;
}

export interface PettyCashReimbursementResult {
  allocations: LotAllocation[];
  pendingMatch: PettyCashPendingMatch | null;
}

export function reimbursePettyCash(input: PettyCashReimbursementInput): PettyCashReimbursementResult {
  const personId = requireNonEmpty(input.personId, "Person id");
  const accountId = requireNonEmpty(input.accountId, "Account id");
  const currencyCode = requireNonEmpty(input.currencyCode, "Currency code");
  const expenseDate = requireNonEmpty(input.expenseDate, "Expense date");

  const result = allocateFifo(input.lots, input.amountMinor, currencyCode, { allowUnmatched: true });
  const pendingMatch =
    result.unmatchedAmountMinor > 0
      ? {
          personId,
          accountId,
          currencyCode,
          amountMinor: result.unmatchedAmountMinor,
          expenseDate
        }
      : null;

  return { allocations: result.allocations, pendingMatch };
}

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${label} must be non-empty`);
  }
  return trimmed;
}
