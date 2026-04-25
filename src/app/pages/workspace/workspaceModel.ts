export interface WorkspaceDocument {
  id: string;
  document_no: string;
  document_type: string;
  business_date: string;
  status: string;
  summary: string;
}

export interface WorkspaceDocumentCounts {
  draft: number;
  pending: number;
  rejected: number;
  approved: number;
}

export interface WorkspaceTask {
  id: string;
  label: string;
  meta: string;
  status: "draft" | "pending" | "rejected";
}

const taskStatuses = new Set(["draft", "pending", "rejected"]);

export function summarizeDocumentCounts(documents: readonly WorkspaceDocument[]): WorkspaceDocumentCounts {
  return documents.reduce<WorkspaceDocumentCounts>(
    (counts, document) => {
      if (document.status === "draft") return { ...counts, draft: counts.draft + 1 };
      if (document.status === "pending") return { ...counts, pending: counts.pending + 1 };
      if (document.status === "rejected") return { ...counts, rejected: counts.rejected + 1 };
      if (document.status === "approved") return { ...counts, approved: counts.approved + 1 };
      return counts;
    },
    { draft: 0, pending: 0, rejected: 0, approved: 0 }
  );
}

export function buildWorkspaceTasks(documents: readonly WorkspaceDocument[]): WorkspaceTask[] {
  return documents
    .filter((document): document is WorkspaceDocument & { status: WorkspaceTask["status"] } =>
      taskStatuses.has(document.status)
    )
    .slice(0, 8)
    .map((document) => ({
      id: document.id,
      label: document.summary || document.document_no,
      meta: `${document.document_no} / ${document.business_date}`,
      status: document.status
    }));
}
