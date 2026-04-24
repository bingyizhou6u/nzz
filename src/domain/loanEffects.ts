export type LoanAllocationType = "repayment" | "writeoff" | "reversal";

export interface LoanOutLineInput {
  lineId: string;
  currencyCode: string;
  amountMinor: number;
  usdtCostMinor: number | null | undefined;
}

export interface LoanItemCreationEffect {
  clientLoanItemId: string;
  sourceDocumentId: string;
  sourceLineId: string;
  borrowerPersonId: string;
  currencyCode: string;
  originalAmountMinor: number;
  remainingAmountMinor: number;
  originalUsdtCostMinor: number;
  remainingUsdtCostMinor: number;
  loanDate: string;
}

export interface LoanItemUpdateEffect {
  loanItemId: string;
  amountDeltaMinor: number;
  usdtCostDeltaMinor: number;
  expectedRemainingAmountMinor: number;
  expectedRemainingUsdtCostMinor: number;
}

export interface LoanAllocationEffect {
  loanItemId: string;
  allocationType: LoanAllocationType;
  amountMinor: number;
  usdtCostMinor: number;
  allocationDate: string;
}

export interface LoanPostingEffects {
  loanItemCreations: LoanItemCreationEffect[];
  loanItemUpdates: LoanItemUpdateEffect[];
  loanAllocations: LoanAllocationEffect[];
}

export interface OpenLoanItem {
  id: string;
  sourceDocumentId: string;
  borrowerPersonId: string;
  currencyCode: string;
  remainingAmountMinor: number;
  remainingUsdtCostMinor: number;
  loanDate: string;
  createdAt: string;
}

export function emptyLoanPostingEffects(): LoanPostingEffects {
  return { loanItemCreations: [], loanItemUpdates: [], loanAllocations: [] };
}

export function planLoanOutEffects(input: {
  documentId: string;
  borrowerPersonId: string;
  loanDate: string;
  lines: LoanOutLineInput[];
}): LoanPostingEffects {
  const documentId = requireNonEmpty(input.documentId, "documentId");
  const borrowerPersonId = requireNonEmpty(input.borrowerPersonId, "borrowerPersonId");
  const loanDate = requireNonEmpty(input.loanDate, "loanDate");
  if (input.lines.length === 0) throw new Error("loan_out lines are required");

  return {
    loanItemCreations: input.lines.map((line, index) => {
      const sourceLineId = requireNonEmpty(line.lineId, "lineId");
      const currencyCode = requireNonEmpty(line.currencyCode, "line currencyCode");
      const amountMinor = requirePositiveSafeInteger(line.amountMinor, "line amountMinor");
      const usdtCostMinor = costForLoanOutLine(currencyCode, amountMinor, line.usdtCostMinor);

      return {
        clientLoanItemId: `${documentId}:loan:${index + 1}`,
        sourceDocumentId: documentId,
        sourceLineId,
        borrowerPersonId,
        currencyCode,
        originalAmountMinor: amountMinor,
        remainingAmountMinor: amountMinor,
        originalUsdtCostMinor: usdtCostMinor,
        remainingUsdtCostMinor: usdtCostMinor,
        loanDate
      };
    }),
    loanItemUpdates: [],
    loanAllocations: []
  };
}

export function planLoanReductionEffects(input: {
  documentId: string;
  borrowerPersonId: string;
  currencyCode: string;
  amountMinor: number;
  reductionDate: string;
  allocationType: Exclude<LoanAllocationType, "reversal">;
  openLoanItems: OpenLoanItem[];
  targetSourceDocumentId?: string | null;
}): LoanPostingEffects {
  requireNonEmpty(input.documentId, "documentId");
  const borrowerPersonId = requireNonEmpty(input.borrowerPersonId, "borrowerPersonId");
  const currencyCode = requireNonEmpty(input.currencyCode, "currencyCode");
  const reductionDate = requireNonEmpty(input.reductionDate, "reductionDate");
  const amountMinor = requirePositiveSafeInteger(input.amountMinor, "amountMinor");
  const allocationType = input.allocationType;
  if (allocationType !== "repayment" && allocationType !== "writeoff") {
    throw new Error("allocationType must be repayment or writeoff");
  }

  const targetSourceDocumentId = input.targetSourceDocumentId?.trim() || null;
  const orderedItems = input.openLoanItems
    .filter((item) => item.borrowerPersonId === borrowerPersonId)
    .filter((item) => item.currencyCode === currencyCode)
    .filter((item) => (targetSourceDocumentId ? item.sourceDocumentId === targetSourceDocumentId : true))
    .filter((item) => item.remainingAmountMinor > 0)
    .sort((a, b) => a.loanDate.localeCompare(b.loanDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  let remaining = amountMinor;
  const loanItemUpdates: LoanItemUpdateEffect[] = [];
  const loanAllocations: LoanAllocationEffect[] = [];

  for (const item of orderedItems) {
    validateOpenLoanItem(item);
    if (remaining === 0) break;

    const allocatedAmountMinor = Math.min(remaining, item.remainingAmountMinor);
    const allocatedUsdtCostMinor = proportionalCost(
      allocatedAmountMinor,
      item.remainingAmountMinor,
      item.remainingUsdtCostMinor
    );

    loanItemUpdates.push({
      loanItemId: item.id,
      amountDeltaMinor: -allocatedAmountMinor,
      usdtCostDeltaMinor: -allocatedUsdtCostMinor,
      expectedRemainingAmountMinor: item.remainingAmountMinor,
      expectedRemainingUsdtCostMinor: item.remainingUsdtCostMinor
    });
    loanAllocations.push({
      loanItemId: item.id,
      allocationType,
      amountMinor: allocatedAmountMinor,
      usdtCostMinor: allocatedUsdtCostMinor,
      allocationDate: reductionDate
    });

    remaining -= allocatedAmountMinor;
  }

  if (remaining > 0) throw new Error("Insufficient loan item balance");

  return { loanItemCreations: [], loanItemUpdates, loanAllocations };
}

export function totalLoanAllocationUsdtCost(effects: LoanPostingEffects): number {
  return effects.loanAllocations.reduce((sum, allocation) => sum + allocation.usdtCostMinor, 0);
}

function costForLoanOutLine(currencyCode: string, amountMinor: number, usdtCostMinor: number | null | undefined): number {
  if (currencyCode === "USDT" && usdtCostMinor == null) return amountMinor;
  if (usdtCostMinor == null) throw new Error("line usdtCostMinor is required for non-USDT loan_out");
  return requirePositiveSafeInteger(usdtCostMinor, "line usdtCostMinor");
}

function validateOpenLoanItem(item: OpenLoanItem) {
  requireNonEmpty(item.id, "loanItemId");
  requireNonEmpty(item.sourceDocumentId, "sourceDocumentId");
  requireNonEmpty(item.borrowerPersonId, "borrowerPersonId");
  requireNonEmpty(item.currencyCode, "currencyCode");
  requireNonEmpty(item.loanDate, "loanDate");
  requireNonEmpty(item.createdAt, "createdAt");
  requireNonNegativeSafeInteger(item.remainingAmountMinor, "remainingAmountMinor");
  requireNonNegativeSafeInteger(item.remainingUsdtCostMinor, "remainingUsdtCostMinor");
}

function proportionalCost(amountMinor: number, remainingAmountMinor: number, remainingUsdtCostMinor: number): number {
  if (amountMinor === remainingAmountMinor) return remainingUsdtCostMinor;
  return Math.round((amountMinor / remainingAmountMinor) * remainingUsdtCostMinor);
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

function requireNonNegativeSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer`);
  return value;
}
