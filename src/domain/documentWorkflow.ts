import type { DocumentStatus, DocumentType } from "./types";

export type DocumentWorkflowAction = "submit" | "approve" | "reject" | "reopen";

export interface LockCheckInput {
  documentType: DocumentType;
  businessDate: string;
}

export function assertDocumentTransition(
  currentStatus: DocumentStatus,
  nextStatus: DocumentStatus,
  action: DocumentWorkflowAction
) {
  if (action === "submit") {
    if ((currentStatus === "draft" || currentStatus === "rejected") && nextStatus === "pending") return;
    throw new Error("Only draft or rejected documents can be submitted");
  }

  if (action === "approve") {
    if (currentStatus === "pending" && nextStatus === "approved") return;
    throw new Error("Only pending documents can be approved");
  }

  if (action === "reject") {
    if (currentStatus === "pending" && nextStatus === "rejected") return;
    throw new Error("Only pending documents can be rejected");
  }

  if (action === "reopen") {
    if (currentStatus === "rejected" && nextStatus === "draft") return;
    throw new Error("Only rejected documents can be reopened");
  }
}

export function getLockCheckDate(input: LockCheckInput) {
  return input.businessDate;
}

export function periodFromDate(dateText: string) {
  return dateText.slice(0, 7);
}
