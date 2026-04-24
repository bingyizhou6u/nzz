export interface OriginalAccountEntry {
  accountId: string;
  currencyCode: string;
  amountMinor: number;
}

export interface OriginalLoanEntry {
  borrowerPersonId: string;
  currencyCode: string;
  amountMinor: number;
}

export interface ReversalPostingInput {
  reversalDate: string;
  originalAccountEntries: OriginalAccountEntry[];
  originalLoanEntries: OriginalLoanEntry[];
}

export interface ReversalPostingResult {
  accountEntries: Array<{ accountId: string; currencyCode: string; amountMinor: number; entryDate: string }>;
  loanEntries: Array<{ borrowerPersonId: string; currencyCode: string; amountMinor: number; entryDate: string }>;
}

export function entriesForReversalDocument(input: ReversalPostingInput): ReversalPostingResult {
  const reversalDate = requireNonEmpty(input.reversalDate, "reversalDate");
  if (input.originalAccountEntries.length === 0 && input.originalLoanEntries.length === 0) {
    throw new Error("Original document has no posting entries to reverse");
  }

  return {
    accountEntries: input.originalAccountEntries.map((entry) => ({
      accountId: requireNonEmpty(entry.accountId, "accountId"),
      currencyCode: requireNonEmpty(entry.currencyCode, "currencyCode"),
      amountMinor: -requireSafeInteger(entry.amountMinor, "amountMinor"),
      entryDate: reversalDate
    })),
    loanEntries: input.originalLoanEntries.map((entry) => ({
      borrowerPersonId: requireNonEmpty(entry.borrowerPersonId, "borrowerPersonId"),
      currencyCode: requireNonEmpty(entry.currencyCode, "currencyCode"),
      amountMinor: -requireSafeInteger(entry.amountMinor, "amountMinor"),
      entryDate: reversalDate
    }))
  };
}

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} must be non-empty`);
  return trimmed;
}

function requireSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
  return value;
}
