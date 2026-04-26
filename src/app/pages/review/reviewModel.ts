import type { ApprovalPreviewState, PreviewRecord, ReviewDocumentRow } from "./reviewTypes";

export interface PreviewSection {
  label: string;
  rows: PreviewRecord[];
}

export interface PreviewGroup {
  title: string;
  count: number;
  sections: PreviewSection[];
}

export type ReviewRiskTone = "muted" | "ok" | "warning";
export type ReviewLoadState = "idle" | "loading" | "ready" | "error";
export type ReviewActionKey = "approve" | "reject" | null;

export interface ReviewActionAvailabilityInput {
  selectedId: string | null;
  previewState: ReviewLoadState;
  actionKey: ReviewActionKey;
  rejectReason: string;
}

export interface ReviewActionAvailability {
  canApprove: boolean;
  canReject: boolean;
  isBusy: boolean;
  isRejectReasonReady: boolean;
}

export type ReviewPreviewContext = Pick<
  ReviewDocumentRow,
  "document_type" | "project_id" | "merchant_id" | "business_date" | "summary"
>;

export const documentTypeLabels: Record<string, string> = {
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

export function waitingLabel(submittedAt: string | null | undefined, now = new Date()): string {
  if (!submittedAt) return "未记录";

  const submittedTime = new Date(submittedAt).getTime();
  if (!Number.isFinite(submittedTime)) return "未记录";

  const elapsedMs = Math.max(0, now.getTime() - submittedTime);
  const elapsedHours = elapsedMs / (60 * 60 * 1000);
  if (elapsedHours < 1) return "1 小时内";
  if (elapsedHours < 24) return `${Math.max(1, Math.floor(elapsedHours))} 小时`;

  return `${Math.max(1, Math.floor(elapsedHours / 24))} 天`;
}

export function reviewRiskTone(
  input: { submitted_at: string | null | undefined },
  now = new Date()
): ReviewRiskTone {
  if (!input.submitted_at) return "muted";

  const submittedTime = new Date(input.submitted_at).getTime();
  const nowTime = now.getTime();
  if (!Number.isFinite(submittedTime) || !Number.isFinite(nowTime)) return "muted";

  const elapsedMs = Math.max(0, nowTime - submittedTime);
  const warningThresholdMs = 3 * 24 * 60 * 60 * 1000;
  return elapsedMs >= warningThresholdMs ? "warning" : "ok";
}

export function sortReviewQueueByRisk<TDocument extends Pick<ReviewDocumentRow, "document_no" | "submitted_at">>(
  documents: readonly TDocument[],
  now = new Date()
): TDocument[] {
  const riskRank: Record<ReviewRiskTone, number> = { warning: 0, ok: 1, muted: 2 };

  return [...documents].sort((left, right) => {
    const riskDelta = riskRank[reviewRiskTone(left, now)] - riskRank[reviewRiskTone(right, now)];
    if (riskDelta !== 0) return riskDelta;

    const waitDelta = waitingDurationMs(right.submitted_at, now) - waitingDurationMs(left.submitted_at, now);
    if (waitDelta !== 0) return waitDelta;

    return left.document_no.localeCompare(right.document_no, "zh-Hans-CN");
  });
}

export function reviewActionAvailability(input: ReviewActionAvailabilityInput): ReviewActionAvailability {
  const isBusy = input.actionKey !== null;
  const hasSelectedDocument = Boolean(input.selectedId);
  const isRejectReasonReady = input.rejectReason.trim().length > 0;

  return {
    canApprove: hasSelectedDocument && input.previewState === "ready" && !isBusy,
    canReject: hasSelectedDocument && isRejectReasonReady && !isBusy,
    isBusy,
    isRejectReasonReady
  };
}

export function previewGroups(preview: ApprovalPreviewState, context?: ReviewPreviewContext | null): PreviewGroup[] {
  return [
    buildGroup("资金影响", [
      { label: "账户分录", rows: preview.accountEntries },
      { label: "批次新增", rows: preview.lotCreations },
      { label: "批次余额更新", rows: preview.lotUpdates },
      { label: "批次流水", rows: preview.lotMovements }
    ]),
    buildGroup("备用金影响", [
      { label: "待匹配新增", rows: preview.pendingCostCreations },
      { label: "待匹配余额更新", rows: preview.pendingCostUpdates },
      { label: "匹配应用", rows: preview.pendingCostApplications }
    ]),
    buildGroup("借款影响", [
      { label: "借款分录", rows: preview.loanEntries },
      { label: "借款项目新增", rows: preview.loanItemCreations },
      { label: "借款项目更新", rows: preview.loanItemUpdates },
      { label: "借款核销/还款分配", rows: preview.loanAllocations }
    ]),
    buildGroup("项目影响", [{ label: "项目归属", rows: projectImpactRows(context) }])
  ].filter((group) => group.count > 0);
}

function buildGroup(title: string, sections: PreviewSection[]): PreviewGroup {
  const populatedSections = sections.filter((section) => section.rows.length > 0);
  return {
    title,
    sections: populatedSections,
    count: populatedSections.reduce((sum, section) => sum + section.rows.length, 0)
  };
}

export function formatPreviewRecord(row: PreviewRecord): string {
  return Object.entries(row)
    .filter(([, value]) => value !== null && value !== undefined && value !== "")
    .map(([key, value]) => `${key}: ${String(value)}`)
    .join(" / ");
}

function waitingDurationMs(submittedAt: string | null | undefined, now: Date): number {
  if (!submittedAt) return -1;

  const submittedTime = new Date(submittedAt).getTime();
  const nowTime = now.getTime();
  if (!Number.isFinite(submittedTime) || !Number.isFinite(nowTime)) return -1;

  return Math.max(0, nowTime - submittedTime);
}

function projectImpactRows(context: ReviewPreviewContext | null | undefined): PreviewRecord[] {
  if (!context) return [];

  const hasProjectImpact =
    Boolean(context.project_id || context.merchant_id) ||
    context.document_type === "project_income" ||
    context.document_type === "petty_cash_reimbursement";
  if (!hasProjectImpact) return [];

  return [
    {
      documentType: documentTypeLabels[context.document_type] ?? context.document_type,
      projectId: context.project_id,
      merchantId: context.merchant_id,
      businessDate: context.business_date,
      summary: context.summary
    }
  ];
}
