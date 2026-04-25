import type { ApprovalPreviewState, PreviewRecord } from "./reviewTypes";

export interface PreviewSection {
  label: string;
  rows: PreviewRecord[];
}

export interface PreviewGroup {
  title: string;
  count: number;
  sections: PreviewSection[];
}

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

export function previewGroups(preview: ApprovalPreviewState): PreviewGroup[] {
  return [
    buildGroup("账户影响", [{ label: "账户分录", rows: preview.accountEntries }]),
    buildGroup("FIFO批次影响", [
      { label: "批次新增", rows: preview.lotCreations },
      { label: "批次余额更新", rows: preview.lotUpdates },
      { label: "批次流水", rows: preview.lotMovements }
    ]),
    buildGroup("备用金待匹配", [
      { label: "待匹配新增", rows: preview.pendingCostCreations },
      { label: "待匹配余额更新", rows: preview.pendingCostUpdates },
      { label: "匹配应用", rows: preview.pendingCostApplications }
    ]),
    buildGroup("借款影响", [
      { label: "借款分录", rows: preview.loanEntries },
      { label: "借款项目新增", rows: preview.loanItemCreations },
      { label: "借款项目更新", rows: preview.loanItemUpdates },
      { label: "借款核销/还款分配", rows: preview.loanAllocations }
    ])
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
