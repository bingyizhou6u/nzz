import type { Capability } from "../../session/sessionTypes";
import type { Tone } from "../../components/ui";
import type {
  MonthCloseCheckPatch,
  MonthCloseCheckResult,
  MonthCloseCheckStatus,
  MonthClosePeriod,
  MonthCloseSeverity
} from "./monthCloseTypes";

export type MonthClosePeriodStatusKey = "locked" | "checking" | "failed" | "ready" | "blocked" | "not_checked";

export interface MonthClosePeriodStatusView {
  key: MonthClosePeriodStatusKey;
  label: string;
  tone: Tone;
}

export type MonthCloseCheckAction = "assign" | "acknowledge" | "resolve" | "waive";

export function monthClosePeriodStatus(period: MonthClosePeriod): MonthClosePeriodStatusView {
  if (period.locked_at) return { key: "locked", label: "已锁账", tone: "ok" };
  if (period.latest_run_status === "running") return { key: "checking", label: "检查中", tone: "warning" };
  if (period.latest_run_status === "failed") return { key: "failed", label: "检查失败", tone: "danger" };
  if (!period.latest_run_id) return { key: "not_checked", label: "未检查", tone: "muted" };
  if (period.latest_run_status === "completed" && period.can_lock === 1) {
    return { key: "ready", label: "可锁账", tone: "ok" };
  }
  return { key: "blocked", label: "需处理", tone: "warning" };
}

export function severityTone(severity: MonthCloseSeverity): Tone {
  if (severity === "critical") return "danger";
  if (severity === "warning") return "warning";
  return "muted";
}

export function statusTone(status: MonthCloseCheckStatus): Tone {
  if (status === "open" || status === "assigned") return "warning";
  if (status === "resolved" || status === "acknowledged" || status === "waived") return "ok";
  return "muted";
}

export function severityLabel(severity: MonthCloseSeverity): string {
  if (severity === "critical") return "严重";
  if (severity === "warning") return "警告";
  return "提示";
}

export function monthCloseCheckStatusLabel(status: MonthCloseCheckStatus): string {
  const labels: Record<MonthCloseCheckStatus, string> = {
    open: "未处理",
    assigned: "已分配",
    acknowledged: "已确认",
    resolved: "已处理",
    waived: "确认保留"
  };
  return labels[status];
}

export function canRunMonthCloseChecks(capabilities: readonly Capability[] | readonly string[]): boolean {
  return capabilities.includes("periodLocks.lock");
}

export function canHandleMonthCloseChecks(capabilities: readonly Capability[] | readonly string[]): boolean {
  return capabilities.includes("periodLocks.lock");
}

export function canUnlockMonthClosePeriod(capabilities: readonly Capability[] | readonly string[]): boolean {
  return capabilities.includes("periodLocks.unlock");
}

export function buildCheckActionPatch(
  check: MonthCloseCheckResult,
  action: MonthCloseCheckAction,
  input: { note?: string; assigneePersonId?: string | null }
): MonthCloseCheckPatch {
  const note = input.note?.trim() ?? "";
  const assigneePersonId = input.assigneePersonId?.trim() ?? "";

  if (action === "assign") {
    if (!assigneePersonId) throw new Error("请选择责任人");
    return { status: "assigned", assigneePersonId };
  }

  if (action === "waive" && check.severity === "critical") {
    throw new Error("critical 检查不能确认保留");
  }

  if (!note) {
    throw new Error("请填写处理说明");
  }

  if (action === "acknowledge") return { status: "acknowledged", resolutionNote: note };
  if (action === "resolve") return { status: "resolved", resolutionNote: note, assigneePersonId: assigneePersonId || undefined };
  return { status: "waived", resolutionNote: note };
}

export function formatMinorAmount(value: number | null, currencyCode: string | null): string {
  if (value === null) return "-";
  const major = value / 100;
  const sign = value < 0 ? "-" : "";
  const formatted = Math.abs(major).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${sign}${formatted}${currencyCode ? ` ${currencyCode}` : ""}`;
}

export function checkTypeLabel(checkType: string): string {
  const labels: Record<string, string> = {
    pending_document: "待审核单据",
    draft_document: "未提交草稿",
    rejected_document: "退回未修正",
    negative_company_account: "公司账户负数",
    negative_petty_cash: "备用金负数",
    pending_cost: "待匹配成本",
    stale_pending_cost: "超期待匹配成本",
    stale_loan: "超期借款",
    project_income_missing_merchant: "项目收入缺少商户",
    merchant_project_mismatch: "商户项目不一致"
  };
  return labels[checkType] ?? checkType;
}
