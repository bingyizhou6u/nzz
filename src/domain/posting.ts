import type { DocumentType } from "./types";

interface PostingLine {
  accountId: string;
  currencyCode: string;
  amountMinor: number;
}

interface PostingDocument {
  id: string;
  documentType: DocumentType;
  businessDate: string;
  borrowerPersonId?: string;
  lines: PostingLine[];
}

export interface PostingResult {
  accountEntries: Array<{ accountId: string; currencyCode: string; amountMinor: number; entryDate: string }>;
  loanEntries: Array<{ borrowerPersonId: string; currencyCode: string; amountMinor: number; entryDate: string }>;
}

export function entriesForApprovedDocument(document: PostingDocument): PostingResult {
  if (document.documentType !== "project_income" && document.documentType !== "loan_out") {
    throw new Error(`Unsupported documentType: ${document.documentType}`);
  }

  if (document.lines.length === 0) {
    throw new Error("lines are required");
  }

  let loanBorrowerPersonId = "";
  if (document.documentType === "loan_out") {
    loanBorrowerPersonId = document.borrowerPersonId?.trim() ?? "";
    if (!loanBorrowerPersonId) throw new Error("borrowerPersonId is required for loan_out");
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
      accountEntries.push({ accountId, currencyCode, amountMinor: line.amountMinor, entryDate: document.businessDate });
    }

    if (document.documentType === "loan_out") {
      accountEntries.push({ accountId, currencyCode, amountMinor: -line.amountMinor, entryDate: document.businessDate });
      loanEntries.push({ borrowerPersonId: loanBorrowerPersonId, currencyCode, amountMinor: line.amountMinor, entryDate: document.businessDate });
    }
  }

  return { accountEntries, loanEntries };
}
