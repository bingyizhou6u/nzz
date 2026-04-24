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
  const accountEntries: PostingResult["accountEntries"] = [];
  const loanEntries: PostingResult["loanEntries"] = [];

  for (const line of document.lines) {
    if (document.documentType === "project_income") {
      accountEntries.push({ accountId: line.accountId, currencyCode: line.currencyCode, amountMinor: line.amountMinor, entryDate: document.businessDate });
    }

    if (document.documentType === "loan_out") {
      if (!document.borrowerPersonId) throw new Error("borrowerPersonId is required for loan_out");
      accountEntries.push({ accountId: line.accountId, currencyCode: line.currencyCode, amountMinor: -Math.abs(line.amountMinor), entryDate: document.businessDate });
      loanEntries.push({ borrowerPersonId: document.borrowerPersonId, currencyCode: line.currencyCode, amountMinor: Math.abs(line.amountMinor), entryDate: document.businessDate });
    }
  }

  return { accountEntries, loanEntries };
}
