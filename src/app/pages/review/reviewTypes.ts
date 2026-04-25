import type { DocumentType } from "../../../domain/types";

export type PreviewRecord = Record<string, string | number | boolean | null | undefined>;

export interface ReviewDocumentRow {
  id: string;
  document_no: string;
  document_type: DocumentType;
  business_date: string;
  period: string;
  submitted_at: string | null;
  summary: string;
  created_by: string;
  operator_person_id: string | null;
  project_id: string | null;
  merchant_id: string | null;
}

export interface ApprovalPreviewState {
  accountEntries: PreviewRecord[];
  loanEntries: PreviewRecord[];
  lotCreations: PreviewRecord[];
  lotUpdates: PreviewRecord[];
  lotMovements: PreviewRecord[];
  pendingCostCreations: PreviewRecord[];
  pendingCostUpdates: PreviewRecord[];
  pendingCostApplications: PreviewRecord[];
  loanItemCreations: PreviewRecord[];
  loanItemUpdates: PreviewRecord[];
  loanAllocations: PreviewRecord[];
}

export interface ReviewActionResult {
  id: string;
  status: "approved" | "rejected" | string;
}
