export type MonthCloseSeverity = "critical" | "warning" | "info";
export type MonthCloseResultStatus = "open" | "assigned" | "acknowledged" | "resolved" | "waived";

export interface MonthCloseCheckOptions {
  staleDays: number;
  stalePendingCostDays: number;
  staleLoanDays: number;
  pettyCashNegativeCriticalDays: number;
  pettyCashNegativeCriticalAmountMinor: number;
}

export interface MonthCloseCheckResultInput {
  checkType: string;
  severity: MonthCloseSeverity;
  entityType: string;
  entityId: string;
  businessDate: string | null;
  currencyCode: string | null;
  amountMinor: number | null;
  usdtCostMinor: number | null;
  message: string;
  suggestedAction: string;
}

export interface MonthCloseHandledCheckResult extends MonthCloseCheckResultInput {
  status: MonthCloseResultStatus;
}

export interface MonthCloseSummary {
  criticalCount: number;
  warningCount: number;
  infoCount: number;
}

export interface DocumentWorkflowCheckRow {
  id: string;
  status: "draft" | "pending" | "rejected" | string;
  period: string;
  businessDate: string;
  createdAt: string;
  submittedAt: string | null;
}

export interface AccountBalanceCheckRow {
  accountId: string;
  accountType: string;
  ownerPersonId: string | null;
  isCompanyAccount: boolean;
  allowNegative: boolean;
  currencyCode: string;
  balanceMinor: number;
}

export interface PendingCostCheckRow {
  id: string;
  documentId: string;
  personId: string;
  accountId: string;
  currencyCode: string;
  remainingAmountMinor: number;
  expenseDate: string;
  ageDays: number;
}

export interface LoanAgingCheckRow {
  loanItemId: string;
  borrowerPersonId: string;
  currencyCode: string;
  remainingAmountMinor: number;
  remainingUsdtCostMinor: number;
  loanDate: string;
  ageDays: number;
}

export interface ProjectIntegrityCheckRow {
  documentId: string;
  documentType: string;
  businessDate: string;
  projectId: string | null;
  merchantId: string | null;
  merchantProjectId: string | null;
}

export function documentWorkflowChecks(
  rows: DocumentWorkflowCheckRow[],
  _options: MonthCloseCheckOptions
): MonthCloseCheckResultInput[] {
  return rows.flatMap((row) => {
    if (row.status === "pending") {
      return [
        checkResult({
          checkType: "pending_document",
          severity: "critical",
          entityType: "document",
          entityId: row.id,
          businessDate: row.businessDate,
          message: "期间内存在待审核单据，不能月结锁账",
          suggestedAction: "审核或退回该单据后再继续月结"
        })
      ];
    }

    if (row.status === "draft") {
      return [
        checkResult({
          checkType: "draft_document",
          severity: "info",
          entityType: "document",
          entityId: row.id,
          businessDate: row.businessDate,
          message: "期间内存在未提交草稿",
          suggestedAction: "确认是否提交、作废或留到后续期间处理"
        })
      ];
    }

    if (row.status === "rejected") {
      return [
        checkResult({
          checkType: "rejected_document",
          severity: "warning",
          entityType: "document",
          entityId: row.id,
          businessDate: row.businessDate,
          message: "期间内存在被退回但未修正的单据",
          suggestedAction: "修正后重新提交，或确认该业务不进入本期"
        })
      ];
    }

    return [];
  });
}

export function accountBalanceChecks(
  rows: AccountBalanceCheckRow[],
  _options: MonthCloseCheckOptions
): MonthCloseCheckResultInput[] {
  return rows.flatMap((row) => {
    if (row.balanceMinor >= 0) return [];

    if (row.accountType === "petty_cash") {
      return [
        checkResult({
          checkType: "negative_petty_cash",
          severity: "warning",
          entityType: "petty_cash_account",
          entityId: row.accountId,
          currencyCode: row.currencyCode,
          amountMinor: row.balanceMinor,
          message: "备用金账户余额为负数",
          suggestedAction: "确认是否存在后勤垫付，补充备用金申请或报销说明"
        })
      ];
    }

    if (row.isCompanyAccount && !row.allowNegative) {
      return [
        checkResult({
          checkType: "negative_company_account",
          severity: "critical",
          entityType: "account",
          entityId: row.accountId,
          currencyCode: row.currencyCode,
          amountMinor: row.balanceMinor,
          message: "公司账户余额为负数",
          suggestedAction: "核对账户流水、换汇批次和冲正单据"
        })
      ];
    }

    return [];
  });
}

export function pendingCostChecks(
  rows: PendingCostCheckRow[],
  options: MonthCloseCheckOptions
): MonthCloseCheckResultInput[] {
  return rows.flatMap((row) => {
    if (row.remainingAmountMinor <= 0) return [];

    const isStale = row.ageDays >= options.stalePendingCostDays;
    return [
      checkResult({
        checkType: isStale ? "stale_pending_cost" : "pending_cost",
        severity: isStale ? "critical" : "warning",
        entityType: "pending_cost_match",
        entityId: row.id,
        businessDate: row.expenseDate,
        currencyCode: row.currencyCode,
        amountMinor: row.remainingAmountMinor,
        message: isStale ? "存在超期待匹配成本" : "存在尚未匹配 USDT 成本的备用金费用",
        suggestedAction: "补充备用金资金匹配，或确认该待匹配项的月结处理方式"
      })
    ];
  });
}

export function loanAgingChecks(
  rows: LoanAgingCheckRow[],
  options: MonthCloseCheckOptions
): MonthCloseCheckResultInput[] {
  return rows.flatMap((row) => {
    if (row.remainingAmountMinor <= 0 || row.ageDays < options.staleLoanDays) return [];

    return [
      checkResult({
        checkType: "stale_loan",
        severity: "warning",
        entityType: "loan_item",
        entityId: row.loanItemId,
        businessDate: row.loanDate,
        currencyCode: row.currencyCode,
        amountMinor: row.remainingAmountMinor,
        usdtCostMinor: row.remainingUsdtCostMinor,
        message: "借款长期未结清",
        suggestedAction: "确认还款、核销或继续挂账原因"
      })
    ];
  });
}

export function projectIntegrityChecks(
  rows: ProjectIntegrityCheckRow[],
  _options: MonthCloseCheckOptions
): MonthCloseCheckResultInput[] {
  return rows.flatMap((row) => {
    if (row.documentType !== "project_income") return [];

    if (!row.merchantId) {
      return [
        checkResult({
          checkType: "project_income_missing_merchant",
          severity: "critical",
          entityType: "document",
          entityId: row.documentId,
          businessDate: row.businessDate,
          message: "项目收入单缺少商户",
          suggestedAction: "补充收入来源商户后再继续月结"
        })
      ];
    }

    if (row.projectId && row.merchantProjectId && row.projectId !== row.merchantProjectId) {
      return [
        checkResult({
          checkType: "merchant_project_mismatch",
          severity: "critical",
          entityType: "document",
          entityId: row.documentId,
          businessDate: row.businessDate,
          message: "收入单商户归属项目与单据项目不一致",
          suggestedAction: "修正单据项目或商户归属关系"
        })
      ];
    }

    return [];
  });
}

export function summarizeCheckResults(rows: Array<Pick<MonthCloseCheckResultInput, "severity">>): MonthCloseSummary {
  return rows.reduce<MonthCloseSummary>(
    (summary, row) => {
      if (row.severity === "critical") return { ...summary, criticalCount: summary.criticalCount + 1 };
      if (row.severity === "warning") return { ...summary, warningCount: summary.warningCount + 1 };
      return { ...summary, infoCount: summary.infoCount + 1 };
    },
    { criticalCount: 0, warningCount: 0, infoCount: 0 }
  );
}

export function canLockFromCheckResults(rows: MonthCloseHandledCheckResult[]): boolean {
  return rows.every((row) => {
    if (row.severity === "critical") return row.status === "resolved";
    if (row.severity === "warning") return ["acknowledged", "resolved", "waived"].includes(row.status);
    return true;
  });
}

function checkResult(
  input: Omit<MonthCloseCheckResultInput, "businessDate" | "currencyCode" | "amountMinor" | "usdtCostMinor"> &
    Partial<Pick<MonthCloseCheckResultInput, "businessDate" | "currencyCode" | "amountMinor" | "usdtCostMinor">>
): MonthCloseCheckResultInput {
  return {
    businessDate: null,
    currencyCode: null,
    amountMinor: null,
    usdtCostMinor: null,
    ...input
  };
}
