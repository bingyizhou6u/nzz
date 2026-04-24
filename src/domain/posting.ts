import type { ActionType, DocumentType } from "./types";

interface PostingLine {
  accountId: string;
  currencyCode: string;
  amountMinor: number;
}

interface PostingDocument {
  id: string;
  documentType: DocumentType;
  actionType: ActionType;
  businessDate: string;
  borrowerPersonId?: string;
  lines: PostingLine[];
}

export interface PostingResult {
  accountEntries: Array<{ accountId: string; currencyCode: string; amountMinor: number; entryDate: string }>;
  loanEntries: Array<{ borrowerPersonId: string; currencyCode: string; amountMinor: number; entryDate: string }>;
}

export function entriesForApprovedDocument(document: PostingDocument): PostingResult {
  if (
    document.documentType !== "project_income" &&
    document.documentType !== "loan_out" &&
    document.documentType !== "loan_repayment"
  ) {
    throw new Error(`Unsupported documentType: ${document.documentType}`);
  }

  if (document.actionType !== "normal" && document.actionType !== "reversal") {
    throw new Error(`Unsupported actionType for posting: ${document.actionType}`);
  }

  if (document.lines.length === 0) {
    throw new Error("lines are required");
  }

  let loanBorrowerPersonId = "";
  if (document.documentType === "loan_out" || document.documentType === "loan_repayment") {
    loanBorrowerPersonId = document.borrowerPersonId?.trim() ?? "";
    if (!loanBorrowerPersonId) throw new Error(`borrowerPersonId is required for ${document.documentType}`);
  }

  const accountEntries: PostingResult["accountEntries"] = [];
  const loanEntries: PostingResult["loanEntries"] = [];

  for (const line of document.lines) {
    if (!Number.isSafeInteger(line.amountMinor) || line.amountMinor <= 0) {
      throw new Error("line amountMinor must be a positive safe integer");
    }

    const accountId = line.accountId.trim();
    if (!accountId) {
      throw new Error("line accountId is required");
    }

    const currencyCode = line.currencyCode.trim();
    if (!currencyCode) {
      throw new Error("line currencyCode is required");
    }

    if (document.documentType === "project_income") {
      const amountMinor = document.actionType === "reversal" ? -line.amountMinor : line.amountMinor;
      accountEntries.push({ accountId, currencyCode, amountMinor, entryDate: document.businessDate });
    }

    if (document.documentType === "loan_out") {
      const accountAmountMinor = document.actionType === "reversal" ? line.amountMinor : -line.amountMinor;
      const loanAmountMinor = document.actionType === "reversal" ? -line.amountMinor : line.amountMinor;
      accountEntries.push({ accountId, currencyCode, amountMinor: accountAmountMinor, entryDate: document.businessDate });
      loanEntries.push({ borrowerPersonId: loanBorrowerPersonId, currencyCode, amountMinor: loanAmountMinor, entryDate: document.businessDate });
    }

    if (document.documentType === "loan_repayment") {
      const accountAmountMinor = document.actionType === "reversal" ? -line.amountMinor : line.amountMinor;
      const loanAmountMinor = document.actionType === "reversal" ? line.amountMinor : -line.amountMinor;
      accountEntries.push({ accountId, currencyCode, amountMinor: accountAmountMinor, entryDate: document.businessDate });
      loanEntries.push({ borrowerPersonId: loanBorrowerPersonId, currencyCode, amountMinor: loanAmountMinor, entryDate: document.businessDate });
    }
  }

  return { accountEntries, loanEntries };
}
