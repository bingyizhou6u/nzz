import { ReportTable } from "./ReportTable";
import type { ReportColumn } from "./ReportTable";
import { formatMinor, formatOptional } from "./reportFormat";
import type {
  AccountBalance,
  ExceptionCheck,
  ExpenseDetail,
  ExpenseSummary,
  LoanAging,
  LoanAllocation,
  LoanBalance,
  LoanWriteoff,
  LotBalance,
  LotMovement,
  MerchantIncome,
  MonthlyOperatingSummary,
  PendingCost,
  PettyCashPending,
  ProjectIncome,
  ProjectProfitLoss,
  ReportsState
} from "./reportTypes";

const projectProfitLossColumns: ReportColumn<ProjectProfitLoss>[] = [
  { key: "period", header: "期间", render: (row) => <span className="mono">{row.period}</span> },
  { key: "project", header: "项目ID", render: (row) => <span className="mono">{formatOptional(row.project_id)}</span> },
  { key: "income", header: "收入USDT", className: "number-cell", render: (row) => formatMinor(row.income_usdt_minor) },
  { key: "expense", header: "费用USDT", className: "number-cell", render: (row) => formatMinor(row.expense_usdt_minor) },
  { key: "pending", header: "待匹配原币", className: "number-cell", render: (row) => formatMinor(row.pending_expense_minor) },
  { key: "net", header: "净额USDT", className: "number-cell", render: (row) => formatMinor(row.net_usdt_minor) },
  { key: "status", header: "成本状态", render: (row) => <span className="mono">{row.cost_status}</span> }
];

const projectIncomeColumns: ReportColumn<ProjectIncome>[] = [
  { key: "period", header: "期间", render: (row) => <span className="mono">{row.period}</span> },
  { key: "project", header: "项目ID", render: (row) => <span className="mono">{formatOptional(row.project_id)}</span> },
  { key: "merchant", header: "商户ID", render: (row) => <span className="mono">{formatOptional(row.merchant_id)}</span> },
  { key: "category", header: "分类ID", render: (row) => <span className="mono">{formatOptional(row.category_id)}</span> },
  { key: "currency", header: "币种", render: (row) => <span className="mono">{row.currency_code}</span> },
  { key: "amount", header: "收入原币", className: "number-cell", render: (row) => formatMinor(row.income_amount_minor) },
  { key: "usdt", header: "收入USDT", className: "number-cell", render: (row) => formatMinor(row.income_usdt_minor) }
];

const merchantIncomeColumns: ReportColumn<MerchantIncome>[] = [
  { key: "period", header: "期间", render: (row) => <span className="mono">{row.period}</span> },
  { key: "project", header: "项目ID", render: (row) => <span className="mono">{formatOptional(row.project_id)}</span> },
  { key: "merchant", header: "商户ID", render: (row) => <span className="mono">{formatOptional(row.merchant_id)}</span> },
  { key: "currency", header: "币种", render: (row) => <span className="mono">{row.currency_code}</span> },
  { key: "amount", header: "收入原币", className: "number-cell", render: (row) => formatMinor(row.income_amount_minor) },
  { key: "usdt", header: "收入USDT", className: "number-cell", render: (row) => formatMinor(row.income_usdt_minor) }
];

const expenseDetailColumns: ReportColumn<ExpenseDetail>[] = [
  { key: "document", header: "单据ID", render: (row) => <span className="mono">{row.document_id}</span> },
  { key: "type", header: "类型", render: (row) => <span className="mono">{row.document_type}</span> },
  { key: "period", header: "期间", render: (row) => <span className="mono">{row.period}</span> },
  { key: "date", header: "日期", render: (row) => <span className="mono">{row.business_date}</span> },
  { key: "project", header: "项目ID", render: (row) => <span className="mono">{formatOptional(row.project_id)}</span> },
  { key: "merchant", header: "商户ID", render: (row) => <span className="mono">{formatOptional(row.merchant_id)}</span> },
  { key: "category", header: "分类ID", render: (row) => <span className="mono">{formatOptional(row.category_id)}</span> },
  { key: "person", header: "人员ID", render: (row) => <span className="mono">{formatOptional(row.person_id)}</span> },
  { key: "borrower", header: "借款人ID", render: (row) => <span className="mono">{formatOptional(row.borrower_person_id)}</span> },
  { key: "currency", header: "币种", render: (row) => <span className="mono">{row.currency_code}</span> },
  { key: "amount", header: "费用原币", className: "number-cell", render: (row) => formatMinor(row.amount_minor) },
  { key: "matched", header: "已匹配USDT", className: "number-cell", render: (row) => formatMinor(row.matched_usdt_cost_minor) },
  { key: "pending", header: "待匹配原币", className: "number-cell", render: (row) => formatMinor(row.pending_amount_minor) },
  { key: "status", header: "成本状态", render: (row) => <span className="mono">{row.cost_status}</span> }
];

const expenseSummaryColumns: ReportColumn<ExpenseSummary>[] = [
  { key: "period", header: "期间", render: (row) => <span className="mono">{row.period}</span> },
  { key: "project", header: "项目ID", render: (row) => <span className="mono">{formatOptional(row.project_id)}</span> },
  { key: "category", header: "分类ID", render: (row) => <span className="mono">{formatOptional(row.category_id)}</span> },
  { key: "person", header: "人员ID", render: (row) => <span className="mono">{formatOptional(row.person_id)}</span> },
  { key: "currency", header: "币种", render: (row) => <span className="mono">{row.currency_code}</span> },
  { key: "amount", header: "费用原币", className: "number-cell", render: (row) => formatMinor(row.amount_minor) },
  { key: "matched", header: "已匹配USDT", className: "number-cell", render: (row) => formatMinor(row.matched_usdt_cost_minor) },
  { key: "pending", header: "待匹配原币", className: "number-cell", render: (row) => formatMinor(row.pending_amount_minor) }
];

const monthlyOperatingColumns: ReportColumn<MonthlyOperatingSummary>[] = [
  { key: "period", header: "期间", render: (row) => <span className="mono">{row.period}</span> },
  { key: "income", header: "收入USDT", className: "number-cell", render: (row) => formatMinor(row.income_usdt_minor) },
  { key: "expense", header: "费用USDT", className: "number-cell", render: (row) => formatMinor(row.expense_usdt_minor) },
  { key: "pending", header: "待匹配原币", className: "number-cell", render: (row) => formatMinor(row.pending_expense_minor) },
  { key: "net", header: "净额USDT", className: "number-cell", render: (row) => formatMinor(row.net_usdt_minor) },
  { key: "status", header: "成本状态", render: (row) => <span className="mono">{row.cost_status}</span> }
];

const accountBalanceColumns: ReportColumn<AccountBalance>[] = [
  { key: "account", header: "账户ID", render: (row) => <span className="mono">{row.account_id}</span> },
  { key: "currency", header: "币种", render: (row) => <span className="mono">{row.currency_code}</span> },
  { key: "balance", header: "余额", className: "number-cell", render: (row) => formatMinor(row.balance_minor) }
];

const lotBalanceColumns: ReportColumn<LotBalance>[] = [
  { key: "id", header: "批次ID", render: (row) => <span className="mono">{row.id}</span> },
  { key: "currency", header: "币种", render: (row) => <span className="mono">{row.currency_code}</span> },
  { key: "account", header: "账户ID", render: (row) => <span className="mono">{row.current_account_id}</span> },
  { key: "person", header: "人员ID", render: (row) => <span className="mono">{formatOptional(row.current_person_id)}</span> },
  { key: "date", header: "批次日期", render: (row) => <span className="mono">{row.lot_date}</span> },
  { key: "remaining", header: "剩余金额", className: "number-cell", render: (row) => formatMinor(row.remaining_amount_minor) },
  { key: "usdt", header: "剩余USDT成本", className: "number-cell", render: (row) => formatMinor(row.remaining_usdt_cost_minor) }
];

const lotMovementColumns: ReportColumn<LotMovement>[] = [
  { key: "id", header: "流水ID", render: (row) => <span className="mono">{row.id}</span> },
  { key: "lot", header: "批次ID", render: (row) => <span className="mono">{row.lot_id}</span> },
  { key: "document", header: "单据ID", render: (row) => <span className="mono">{row.document_id}</span> },
  { key: "type", header: "类型", render: (row) => <span className="mono">{row.movement_type}</span> },
  { key: "date", header: "日期", render: (row) => <span className="mono">{row.movement_date}</span> },
  { key: "amount", header: "金额", className: "number-cell", render: (row) => formatMinor(row.amount_minor) },
  { key: "usdt", header: "USDT成本", className: "number-cell", render: (row) => formatMinor(row.usdt_cost_minor) }
];

const pettyCashPendingColumns: ReportColumn<PettyCashPending>[] = [
  { key: "person", header: "人员ID", render: (row) => <span className="mono">{row.person_id}</span> },
  { key: "account", header: "账户ID", render: (row) => <span className="mono">{row.account_id}</span> },
  { key: "currency", header: "币种", render: (row) => <span className="mono">{row.currency_code}</span> },
  { key: "remaining", header: "剩余金额", className: "number-cell", render: (row) => formatMinor(row.remaining_amount_minor) }
];

const pendingCostColumns: ReportColumn<PendingCost>[] = [
  { key: "id", header: "记录ID", render: (row) => <span className="mono">{row.id}</span> },
  { key: "document", header: "单据ID", render: (row) => <span className="mono">{row.document_id}</span> },
  { key: "person", header: "人员ID", render: (row) => <span className="mono">{row.person_id}</span> },
  { key: "account", header: "账户ID", render: (row) => <span className="mono">{row.account_id}</span> },
  { key: "currency", header: "币种", render: (row) => <span className="mono">{row.currency_code}</span> },
  { key: "date", header: "费用日期", render: (row) => <span className="mono">{row.expense_date}</span> },
  { key: "status", header: "状态", render: (row) => <span className="mono">{row.status}</span> },
  { key: "remaining", header: "剩余金额", className: "number-cell", render: (row) => formatMinor(row.remaining_amount_minor) }
];

const loanBalanceColumns: ReportColumn<LoanBalance>[] = [
  { key: "borrower", header: "借款人ID", render: (row) => <span className="mono">{row.borrower_person_id}</span> },
  { key: "currency", header: "币种", render: (row) => <span className="mono">{row.currency_code}</span> },
  { key: "balance", header: "余额", className: "number-cell", render: (row) => formatMinor(row.balance_minor) }
];

const loanAgingColumns: ReportColumn<LoanAging>[] = [
  { key: "id", header: "借款项ID", render: (row) => <span className="mono">{row.loan_item_id}</span> },
  { key: "borrower", header: "借款人ID", render: (row) => <span className="mono">{row.borrower_person_id}</span> },
  { key: "currency", header: "币种", render: (row) => <span className="mono">{row.currency_code}</span> },
  { key: "date", header: "借款日期", render: (row) => <span className="mono">{row.loan_date}</span> },
  { key: "remaining", header: "剩余金额", className: "number-cell", render: (row) => formatMinor(row.remaining_amount_minor) },
  { key: "usdt", header: "剩余USDT成本", className: "number-cell", render: (row) => formatMinor(row.remaining_usdt_cost_minor) },
  { key: "age", header: "账龄天数", className: "number-cell", render: (row) => formatMinor(row.age_days) }
];

const loanAllocationColumns: ReportColumn<LoanAllocation>[] = [
  { key: "id", header: "分摊ID", render: (row) => <span className="mono">{row.allocation_id}</span> },
  { key: "document", header: "单据ID", render: (row) => <span className="mono">{row.document_id}</span> },
  { key: "loan", header: "借款项ID", render: (row) => <span className="mono">{row.loan_item_id}</span> },
  { key: "type", header: "类型", render: (row) => <span className="mono">{row.allocation_type}</span> },
  { key: "borrower", header: "借款人ID", render: (row) => <span className="mono">{row.borrower_person_id}</span> },
  { key: "currency", header: "币种", render: (row) => <span className="mono">{row.currency_code}</span> },
  { key: "date", header: "日期", render: (row) => <span className="mono">{row.allocation_date}</span> },
  { key: "amount", header: "金额", className: "number-cell", render: (row) => formatMinor(row.amount_minor) },
  { key: "usdt", header: "USDT成本", className: "number-cell", render: (row) => formatMinor(row.usdt_cost_minor) }
];

const loanWriteoffColumns: ReportColumn<LoanWriteoff>[] = [
  { key: "document", header: "单据ID", render: (row) => <span className="mono">{row.document_id}</span> },
  { key: "borrower", header: "借款人ID", render: (row) => <span className="mono">{row.borrower_person_id}</span> },
  { key: "project", header: "项目ID", render: (row) => <span className="mono">{formatOptional(row.project_id)}</span> },
  { key: "category", header: "分类ID", render: (row) => <span className="mono">{formatOptional(row.category_id)}</span> },
  { key: "currency", header: "币种", render: (row) => <span className="mono">{row.currency_code}</span> },
  { key: "date", header: "日期", render: (row) => <span className="mono">{row.allocation_date}</span> },
  { key: "amount", header: "金额", className: "number-cell", render: (row) => formatMinor(row.amount_minor) },
  { key: "usdt", header: "USDT成本", className: "number-cell", render: (row) => formatMinor(row.usdt_cost_minor) }
];

const exceptionCheckColumns: ReportColumn<ExceptionCheck>[] = [
  { key: "type", header: "类型", render: (row) => <span className="mono">{row.exception_type}</span> },
  { key: "severity", header: "级别", render: (row) => <span className="mono">{row.severity}</span> },
  { key: "entityType", header: "对象类型", render: (row) => <span className="mono">{row.entity_type}</span> },
  { key: "entity", header: "对象ID", render: (row) => <span className="mono">{row.entity_id}</span> },
  { key: "period", header: "期间", render: (row) => <span className="mono">{formatOptional(row.period)}</span> },
  { key: "date", header: "日期", render: (row) => <span className="mono">{formatOptional(row.business_date)}</span> },
  { key: "currency", header: "币种", render: (row) => <span className="mono">{formatOptional(row.currency_code)}</span> },
  { key: "amount", header: "金额", className: "number-cell", render: (row) => formatMinor(row.amount_minor) },
  { key: "usdt", header: "USDT成本", className: "number-cell", render: (row) => formatMinor(row.usdt_cost_minor) },
  { key: "message", header: "说明", render: (row) => row.message }
];

export const reportGroupLabels = ["资金", "项目经营", "费用", "备用金", "借款", "异常"] as const;

export function FundingReports({ reports, emptyLabel }: { reports: ReportsState; emptyLabel: string }) {
  return (
    <div className="report-group">
      <h2 className="report-group-title">资金</h2>
      <ReportTable
        title="账户余额表"
        rows={reports.accountBalances}
        rowKey={(row) => `${row.account_id}-${row.currency_code}`}
        emptyLabel={emptyLabel}
        columns={accountBalanceColumns}
      />
      <ReportTable
        title="换汇批次表"
        rows={reports.lotBalances}
        rowKey={(row) => row.id}
        emptyLabel={emptyLabel}
        columns={lotBalanceColumns}
      />
      <ReportTable
        title="FIFO 消耗明细"
        rows={reports.lotMovements}
        rowKey={(row) => row.id}
        emptyLabel={emptyLabel}
        columns={lotMovementColumns}
      />
    </div>
  );
}

export function ProjectReports({ reports, emptyLabel }: { reports: ReportsState; emptyLabel: string }) {
  return (
    <div className="report-group">
      <h2 className="report-group-title">项目经营</h2>
      <ReportTable
        title="项目收支表"
        rows={reports.projectProfitLoss}
        rowKey={(row) => `${row.period}-${row.project_id ?? "none"}`}
        emptyLabel={emptyLabel}
        columns={projectProfitLossColumns}
      />
      <ReportTable
        title="项目收入表"
        rows={reports.projectIncome}
        rowKey={(row) =>
          `${row.period}-${row.project_id ?? "none"}-${row.merchant_id ?? "none"}-${row.category_id ?? "none"}-${row.currency_code}`
        }
        emptyLabel={emptyLabel}
        columns={projectIncomeColumns}
      />
      <ReportTable
        title="商户收入表"
        rows={reports.merchantIncome}
        rowKey={(row) => `${row.period}-${row.project_id ?? "none"}-${row.merchant_id ?? "none"}-${row.currency_code}`}
        emptyLabel={emptyLabel}
        columns={merchantIncomeColumns}
      />
      <ReportTable
        title="月度经营总表"
        rows={reports.monthlyOperatingSummary}
        rowKey={(row) => row.period}
        emptyLabel={emptyLabel}
        columns={monthlyOperatingColumns}
      />
    </div>
  );
}

export function ExpenseReports({ reports, emptyLabel }: { reports: ReportsState; emptyLabel: string }) {
  return (
    <div className="report-group">
      <h2 className="report-group-title">费用</h2>
      <ReportTable
        title="费用明细表"
        rows={reports.expenseDetails}
        rowKey={(row) => row.document_id}
        emptyLabel={emptyLabel}
        columns={expenseDetailColumns}
      />
      <ReportTable
        title="费用汇总表"
        rows={reports.expenseSummary}
        rowKey={(row) =>
          `${row.period}-${row.project_id ?? "none"}-${row.category_id ?? "none"}-${row.person_id ?? "none"}-${row.currency_code}`
        }
        emptyLabel={emptyLabel}
        columns={expenseSummaryColumns}
      />
    </div>
  );
}

export function PettyCashReports({ reports, emptyLabel }: { reports: ReportsState; emptyLabel: string }) {
  return (
    <div className="report-group">
      <h2 className="report-group-title">备用金</h2>
      <ReportTable
        title="备用金余额表"
        rows={reports.pettyCashPending}
        rowKey={(row) => `${row.person_id}-${row.account_id}-${row.currency_code}`}
        emptyLabel={emptyLabel}
        columns={pettyCashPendingColumns}
      />
      <ReportTable
        title="待匹配成本表"
        rows={reports.pendingCosts}
        rowKey={(row) => row.id}
        emptyLabel={emptyLabel}
        columns={pendingCostColumns}
      />
    </div>
  );
}

export function LoanReports({ reports, emptyLabel }: { reports: ReportsState; emptyLabel: string }) {
  return (
    <div className="report-group">
      <h2 className="report-group-title">借款</h2>
      <ReportTable
        title="借款余额表"
        rows={reports.loanBalances}
        rowKey={(row) => `${row.borrower_person_id}-${row.currency_code}`}
        emptyLabel={emptyLabel}
        columns={loanBalanceColumns}
      />
      <ReportTable
        title="借款账龄表"
        rows={reports.loanAging}
        rowKey={(row) => row.loan_item_id}
        emptyLabel={emptyLabel}
        columns={loanAgingColumns}
      />
      <ReportTable
        title="借款明细表"
        rows={reports.loanAllocations}
        rowKey={(row) => row.allocation_id}
        emptyLabel={emptyLabel}
        columns={loanAllocationColumns}
      />
      <ReportTable
        title="借款核销表"
        rows={reports.loanWriteoffs}
        rowKey={(row) => `${row.document_id}-${row.borrower_person_id}-${row.currency_code}-${row.allocation_date}`}
        emptyLabel={emptyLabel}
        columns={loanWriteoffColumns}
      />
    </div>
  );
}

export function ExceptionReports({ reports, emptyLabel }: { reports: ReportsState; emptyLabel: string }) {
  return (
    <div className="report-group">
      <h2 className="report-group-title">异常</h2>
      <ReportTable
        title="异常检查"
        rows={reports.exceptionChecks}
        rowKey={(row) => `${row.exception_type}-${row.entity_type}-${row.entity_id}`}
        emptyLabel={emptyLabel}
        columns={exceptionCheckColumns}
      />
    </div>
  );
}
