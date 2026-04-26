import type { Capability, PageKey } from "../../session/sessionTypes";

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

export type WorkspaceNextActionTone = "default" | "ok" | "warning" | "danger" | "muted";

export interface WorkspaceNextAction {
  id: string;
  title: string;
  description: string;
  meta: string;
  page: PageKey;
  tone: WorkspaceNextActionTone;
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

export function buildWorkspaceNextActions(
  counts: WorkspaceDocumentCounts,
  capabilities: readonly Capability[]
): WorkspaceNextAction[] {
  const canViewDocuments = hasCapability(capabilities, "documents.view");
  const canApproveDocuments = hasCapability(capabilities, "documents.approve");
  const canSubmitDocuments = hasCapability(capabilities, "documents.submit");
  const canCreateDocuments = hasCapability(capabilities, "documents.create");
  const canViewReports = hasCapability(capabilities, "reports.view");
  const canViewMonthClose = hasCapability(capabilities, "periodLocks.view");

  const pendingAction =
    counts.pending > 0 && canApproveDocuments
      ? [
          {
            id: "pending-review",
            title: "审核待处理单据",
            description: `${counts.pending} 张单据等待审核，先完成审核再进入报表或月结。`,
            meta: `${counts.pending} 张待审核`,
            page: "review" as const,
            tone: "warning" as const
          }
        ]
      : counts.pending > 0 && canViewDocuments
        ? [
            {
              id: "pending-documents",
              title: "查看待审核单据",
              description: `${counts.pending} 张单据已经提交，当前账号可查看但不能审核。`,
              meta: `${counts.pending} 张待审核`,
              page: "documents" as const,
              tone: "warning" as const
            }
          ]
        : [];

  const rejectedAction =
    counts.rejected > 0 && canViewDocuments
      ? [
          {
            id: "rejected-documents",
            title: "修正退回单据",
            description: `${counts.rejected} 张单据被退回，需要修正后重新提交。`,
            meta: `${counts.rejected} 张已退回`,
            page: "documents" as const,
            tone: "danger" as const
          }
        ]
      : [];

  const draftAction =
    counts.draft > 0 && canViewDocuments
      ? [
          {
            id: "draft-documents",
            title: canSubmitDocuments ? "提交草稿单据" : "查看草稿单据",
            description: canSubmitDocuments
              ? `${counts.draft} 张草稿尚未提交，确认字段后提交审核。`
              : `${counts.draft} 张草稿尚未提交，当前账号可查看但不能提交。`,
            meta: `${counts.draft} 张草稿`,
            page: "documents" as const,
            tone: "muted" as const
          }
        ]
      : [];

  const documentActions = [...pendingAction, ...rejectedAction, ...draftAction];
  const monthCloseActions = canViewMonthClose
    ? [
        {
          id: "month-close-checks",
          title: "检查月结异常",
          description: "运行月结检查并处理阻断项，确认期间是否可以锁账。",
          meta: "月结检查",
          page: "month-close" as const,
          tone: "default" as const
        }
      ]
    : [];
  const fallbackActions =
    documentActions.length === 0 && monthCloseActions.length === 0
      ? [
          ...(canViewDocuments && canCreateDocuments
            ? [
                {
                  id: "create-document",
                  title: "录入业务单据",
                  description: "从收入、换汇、备用金、借款或冲正业务开始录入。",
                  meta: "常用入口",
                  page: "documents" as const,
                  tone: "default" as const
                }
              ]
            : []),
          ...(canViewReports
            ? [
                {
                  id: "view-reports",
                  title: "查看管理报表",
                  description: "查看资金、项目、费用、备用金、借款和异常报表。",
                  meta: "常用入口",
                  page: "reports" as const,
                  tone: "default" as const
                }
              ]
            : [])
        ]
      : [];

  return [...documentActions, ...monthCloseActions, ...fallbackActions];
}

function hasCapability(capabilities: readonly Capability[], capability: Capability): boolean {
  return capabilities.includes(capability);
}
