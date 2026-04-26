import type { ActionType, DocumentType } from "../../../domain/types";
import { hasCapability, type Capability } from "../../session/sessionTypes";
import { isOriginalDocumentRequired } from "./documentEntryModel";
import type { DocumentWorkflowGroupId } from "./documentWorkflowModel";

export interface DocumentListItem {
  id: string;
  document_no: string;
  document_type: DocumentType;
  business_date: string;
  status: string;
  summary: string;
}

export interface DocumentResponse {
  id: string;
  documentNo: string;
  status: string;
}

export interface DocumentActionResponse {
  id: string;
  status: string;
}

export type WorkflowAction = "submit" | "approve" | "reject";
export type RightPanelMode = "detail" | "create";
export type EntryWizardStep = "type" | "details" | "review";

export const supportedDraftDocumentTypes = [
  "project_income",
  "exchange",
  "account_transfer",
  "petty_cash_issue",
  "petty_cash_return",
  "petty_cash_reimbursement",
  "loan_out",
  "loan_repayment",
  "loan_writeoff"
] as const satisfies readonly DocumentType[];

export const documentTypeLabels: Record<DocumentType, string> = {
  project_income: "项目收入",
  exchange: "换汇",
  account_transfer: "账户划转",
  petty_cash_issue: "备用金发放",
  petty_cash_return: "备用金退回",
  petty_cash_reimbursement: "备用金报销",
  loan_out: "借款发放",
  loan_repayment: "借款还款",
  loan_writeoff: "借款核销",
  manual_adjustment: "手工调整"
};

export const documentTypeOptions = Object.keys(documentTypeLabels) as DocumentType[];

export const supportedDraftActionTypes = ["normal", "reversal"] as const satisfies readonly ActionType[];

export const actionTypeLabels: Record<ActionType, string> = {
  normal: "正常",
  correction: "更正",
  reversal: "冲销",
  repost: "重记"
};

export const statusLabels: Record<string, string> = {
  draft: "草稿",
  pending: "待审核",
  approved: "已审核",
  rejected: "已退回",
  void: "已作废"
};

export const scenarioDefaults: Record<DocumentWorkflowGroupId, { documentType: DocumentType; actionType: ActionType }> = {
  income: { documentType: "project_income", actionType: "normal" },
  funds: { documentType: "exchange", actionType: "normal" },
  petty_cash: { documentType: "petty_cash_reimbursement", actionType: "normal" },
  loan: { documentType: "loan_out", actionType: "normal" },
  correction: { documentType: "project_income", actionType: "reversal" }
};

export function isLineAccountRequired(documentType: DocumentType) {
  return documentType !== "loan_writeoff";
}

export function canSubmitDocument(status: string) {
  return status === "draft" || status === "rejected";
}

export function canApproveDocument(status: string) {
  return status === "pending";
}

export function canCreateDraftDocument(capabilities: readonly Capability[]) {
  return hasCapability(capabilities, "documents.create");
}

export function documentWorkflowActions(status: string, capabilities: readonly Capability[]): WorkflowAction[] {
  const actions: WorkflowAction[] = [];
  if (canSubmitDocument(status) && hasCapability(capabilities, "documents.submit")) actions.push("submit");
  if (canApproveDocument(status)) {
    if (hasCapability(capabilities, "documents.approve")) actions.push("approve");
    if (hasCapability(capabilities, "documents.reject")) actions.push("reject");
  }
  return actions;
}

export function workflowActionBody(action: WorkflowAction, actorId: string, rejectReason = "") {
  const actor = actorId.trim();
  if (action === "approve") return actor ? { reviewer: actor } : {};
  if (action === "reject") {
    const reason = rejectReason.trim();
    return actor ? { actor, reason } : { reason };
  }
  return actor ? { actor } : {};
}

export function originalDocumentQueryType(documentType: DocumentType, actionType: ActionType): DocumentType | null {
  if (isOriginalDocumentRequired(actionType)) return documentType;
  if (actionType === "normal" && (documentType === "loan_repayment" || documentType === "loan_writeoff")) {
    return "loan_out";
  }
  return null;
}

export function isSelectedOriginalDocumentValid(
  originalDocumentId: string,
  originalDocuments: Array<{ id: string }>
) {
  const selectedId = originalDocumentId.trim();
  if (!selectedId) return true;
  return originalDocuments.some((document) => document.id === selectedId);
}

export function documentMatchesSearch(document: DocumentListItem, searchTerm: string) {
  const keyword = searchTerm.trim().toLowerCase();
  if (!keyword) return true;

  return [
    document.document_no,
    document.summary,
    document.business_date,
    document.document_type,
    documentTypeLabels[document.document_type],
    statusLabels[document.status],
    document.status
  ]
    .filter(Boolean)
    .some((value) => value.toLowerCase().includes(keyword));
}

export function statusTone(status: string) {
  if (status === "approved") return "ok";
  if (status === "pending") return "warning";
  if (status === "rejected" || status === "void") return "danger";
  return "muted";
}
