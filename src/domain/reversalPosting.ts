export interface OriginalAccountEntry {
  accountId: string;
  currencyCode: string;
  amountMinor: number;
}

export interface OriginalLoanEntry {
  borrowerPersonId: string;
  currencyCode: string;
  amountMinor: number;
  usdtCostMinor?: number | null;
}

export interface ReversalPostingInput {
  reversalDate: string;
  originalAccountEntries: OriginalAccountEntry[];
  originalLoanEntries: OriginalLoanEntry[];
}

export interface ReversalPostingResult {
  accountEntries: Array<{ accountId: string; currencyCode: string; amountMinor: number; entryDate: string }>;
  loanEntries: Array<{
    borrowerPersonId: string;
    currencyCode: string;
    amountMinor: number;
    usdtCostMinor: number | null;
    entryDate: string;
  }>;
}

export function entriesForReversalDocument(input: ReversalPostingInput): ReversalPostingResult {
  assertNonEmpty(input.reversalDate, "reversalDate");
  if (input.originalAccountEntries.length === 0 && input.originalLoanEntries.length === 0) {
    throw new Error("Original document has no posting entries to reverse");
  }

  return {
    accountEntries: input.originalAccountEntries.map((entry) => {
      assertNonEmpty(entry.accountId, "accountId");
      assertNonEmpty(entry.currencyCode, "currencyCode");

      return {
        accountId: entry.accountId,
        currencyCode: entry.currencyCode,
        amountMinor: -requireSafeInteger(entry.amountMinor, "amountMinor"),
        entryDate: input.reversalDate
      };
    }),
    loanEntries: input.originalLoanEntries.map((entry) => {
      assertNonEmpty(entry.borrowerPersonId, "borrowerPersonId");
      assertNonEmpty(entry.currencyCode, "currencyCode");

      return {
        borrowerPersonId: entry.borrowerPersonId,
        currencyCode: entry.currencyCode,
        amountMinor: -requireSafeInteger(entry.amountMinor, "amountMinor"),
        usdtCostMinor: entry.usdtCostMinor == null ? null : -requireSafeInteger(entry.usdtCostMinor, "usdtCostMinor"),
        entryDate: input.reversalDate
      };
    })
  };
}

function assertNonEmpty(value: string, label: string): void {
  if (!value.trim()) throw new Error(`${label} must be non-empty`);
}

function requireSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
  return value;
}
