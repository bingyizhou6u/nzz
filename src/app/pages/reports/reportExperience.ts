import { formatMinor } from "./reportFormat";
import type { ExceptionCheck, ReportsState } from "./reportTypes";

export type ReportGroupKey = "funding" | "project" | "expense" | "pettyCash" | "loan" | "exception";

export interface ReportGroupNavItem {
  key: ReportGroupKey;
  label: string;
  tableCount: number;
}

export interface ReportSummaryCard {
  label: string;
  value: string;
  detail: string;
}

export interface ReportDataContext {
  source: "live" | "snapshot";
  period?: string;
  version?: number;
}

export interface ReportFilterOptions {
  projects: Array<{ id: string; code: string; name: string }>;
  merchants: Array<{ id: string; code: string; name: string; project_id: string }>;
  people: Array<{ id: string; name: string; alias: string | null }>;
  currencies: Array<{ code: string; name: string }>;
}

export const emptyReportFilterOptions: ReportFilterOptions = {
  projects: [],
  merchants: [],
  people: [],
  currencies: []
};

export const reportGroupNavItems: ReportGroupNavItem[] = [
  { key: "funding", label: "资金", tableCount: 3 },
  { key: "project", label: "项目经营", tableCount: 4 },
  { key: "expense", label: "费用", tableCount: 2 },
  { key: "pettyCash", label: "备用金", tableCount: 2 },
  { key: "loan", label: "借款", tableCount: 4 },
  { key: "exception", label: "异常", tableCount: 1 }
];

export function reportGroupTabId(key: ReportGroupKey) {
  return `report-group-tab-${key}`;
}

export function reportGroupPanelId(key: ReportGroupKey) {
  return `report-group-panel-${key}`;
}

export function reportGroupLabel(key: ReportGroupKey) {
  return reportGroupNavItems.find((item) => item.key === key)?.label ?? "报表";
}

export function reportDataContextLabel(context: ReportDataContext) {
  if (context.source === "snapshot" && context.period && context.version) {
    return `已结账快照 / ${context.period} v${context.version}`;
  }

  if (context.source === "snapshot") return "已结账快照 / 请选择版本";
  return "实时数据 / 当前筛选";
}

export function reportExportContextLabel(
  group: ReportGroupKey,
  context: ReportDataContext,
  format: "csv" | "xlsx" = "csv"
) {
  const reportLabel = context.source === "snapshot" && format === "xlsx" ? "月结包" : `${reportGroupLabel(group)}报表`;
  return `${reportLabel} / ${reportDataContextLabel(context)}`;
}

export function summaryCardsForGroup(key: ReportGroupKey, reports: ReportsState): ReportSummaryCard[] {
  if (key === "funding") {
    return [
      summaryCard("资金余额", sum(reports.accountBalances.map((row) => row.balance_minor)), `${reports.accountBalances.length} 个账户`),
      summaryCard("换汇批次", reports.lotBalances.length, "开放或历史批次"),
      summaryCard("FIFO 流水", reports.lotMovements.length, "批次消耗记录")
    ];
  }

  if (key === "project") {
    return [
      summaryCard("项目净额", sum(reports.projectProfitLoss.map((row) => row.net_usdt_minor)), `${reports.projectProfitLoss.length} 个项目`),
      summaryCard("项目收入", sum(reports.projectIncome.map((row) => row.income_usdt_minor)), `${reports.projectIncome.length} 行收入`),
      summaryCard("待匹配成本", sum(reports.projectProfitLoss.map((row) => row.pending_expense_minor)), "影响项目净额确认")
    ];
  }

  if (key === "expense") {
    const incompleteCount = reports.expenseDetails.filter((row) => row.cost_status === "incomplete").length;
    return [
      summaryCard("费用原币", sum(reports.expenseDetails.map((row) => row.amount_minor)), `${reports.expenseDetails.length} 行明细`),
      summaryCard("已匹配 USDT", sum(reports.expenseDetails.map((row) => row.matched_usdt_cost_minor)), "已进入成本口径"),
      summaryCard("未完整匹配", incompleteCount, "需继续匹配换汇批次")
    ];
  }

  if (key === "pettyCash") {
    return [
      summaryCard("备用金待匹配", sum(reports.pettyCashPending.map((row) => row.remaining_amount_minor)), `${reports.pettyCashPending.length} 个余额项`),
      summaryCard("待匹配记录", reports.pendingCosts.length, "等待后续成本归集"),
      summaryCard("涉及人员", new Set(reports.pettyCashPending.map((row) => row.person_id)).size, "备用金责任人")
    ];
  }

  if (key === "loan") {
    return [
      summaryCard("借款余额", sum(reports.loanBalances.map((row) => row.balance_minor)), `${reports.loanBalances.length} 个借款人币种`),
      summaryCard("账龄记录", reports.loanAging.length, "未结清借款项"),
      summaryCard("核销金额", sum(reports.loanWriteoffs.map((row) => row.amount_minor)), `${reports.loanWriteoffs.length} 行核销`)
    ];
  }

  const sorted = sortedExceptionChecks(reports.exceptionChecks);
  return [
    summaryCard("严重异常", sorted.filter((row) => row.severity === "critical").length, "优先处理"),
    summaryCard("预警异常", sorted.filter((row) => row.severity === "warning").length, "需要跟进"),
    summaryCard("异常总数", sorted.length, "按风险排序")
  ];
}

export function sortedExceptionChecks(rows: ExceptionCheck[]) {
  return [...rows].sort((left, right) => {
    const severityDiff = severityRank(right.severity) - severityRank(left.severity);
    if (severityDiff !== 0) return severityDiff;
    return (left.business_date ?? "").localeCompare(right.business_date ?? "");
  });
}

export function exceptionActionLabel(row: ExceptionCheck) {
  if (row.exception_type.includes("negative")) return "核对账户余额与冲正单据";
  if (row.exception_type.includes("pending")) return "补充换汇批次匹配或确认报销";
  if (row.exception_type.includes("stale")) return "推动单据提交或审核";
  return "查看源数据并确认处理方式";
}

function summaryCard(label: string, rawValue: number, detail: string): ReportSummaryCard {
  return {
    label,
    value: formatMinor(rawValue),
    detail
  };
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function severityRank(severity: ExceptionCheck["severity"]) {
  if (severity === "critical") return 3;
  if (severity === "warning") return 2;
  return 1;
}
