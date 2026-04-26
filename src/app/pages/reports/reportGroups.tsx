import { ReportTable } from "./ReportTable";
import type { ReportColumn } from "./ReportTable";
import { exceptionActionLabel, sortedExceptionChecks } from "./reportExperience";
import { formatMinor, formatOptional } from "./reportFormat";
import type {
  AccountBalance,
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

export const reportGroupLabels = ["资金", "项目经营", "费用", "备用金", "借款", "异常"] as const;

function SecondaryReportSection<T>({
  title,
  description,
  rows,
  rowKey,
  emptyLabel,
  columns
}: {
  title: string;
  description: string;
  rows: T[];
  rowKey: (row: T) => string;
  emptyLabel: string;
  columns: ReportColumn<T>[];
}) {
  return (
    <details className="report-secondary-section">
      <summary>
        <span>{title}</span>
        <small>{rows.length} 行</small>
      </summary>
      <ReportTable
        className="report-secondary-table"
        title={title}
        description={description}
        rows={rows}
        rowKey={rowKey}
        emptyLabel={emptyLabel}
        columns={columns}
      />
    </details>
  );
}

export function FundingReports({ reports, emptyLabel }: { reports: ReportsState; emptyLabel: string }) {
  return (
    <div className="report-group">
      <h2 className="report-group-title">资金</h2>
      <ReportTable
        className="report-primary-table"
        title="账户余额表"
        description="公司账户按币种汇总的当前余额，是资金分类的主表。"
        rows={reports.accountBalances}
        rowKey={(row) => `${row.account_id}-${row.currency_code}`}
        emptyLabel={emptyLabel}
        columns={accountBalanceColumns}
      />
      <SecondaryReportSection
        title="换汇批次表"
        description="查看 USDT 换汇后形成的 FIFO 批次余额。"
        rows={reports.lotBalances}
        rowKey={(row) => row.id}
        emptyLabel={emptyLabel}
        columns={lotBalanceColumns}
      />
      <SecondaryReportSection
        title="FIFO 消耗明细"
        description="查看备用金、报销和划转消耗批次的明细流水。"
        rows={reports.lotMovements}
        rowKey={(row) => row.id}
        emptyLabel={emptyLabel}
        columns={lotMovementColumns}
      />
    </div>
  );
}

export function ProjectReports({
  reports,
  emptyLabel,
  selectedProjectId,
  onSelectProject,
  onClearProject
}: {
  reports: ReportsState;
  emptyLabel: string;
  selectedProjectId?: string | null;
  onSelectProject?: (projectId: string | null) => void;
  onClearProject?: () => void;
}) {
  const profitColumns: ReportColumn<ProjectProfitLoss>[] = onSelectProject
    ? [
        ...projectProfitLossColumns,
        {
          key: "drilldown",
          header: "钻取",
          render: (row) => (
            <button type="button" className="secondary-button table-action-button" onClick={() => onSelectProject(row.project_id)}>
              钻取项目 {formatOptional(row.project_id)}
            </button>
          )
        }
      ]
    : projectProfitLossColumns;
  const drilldownIncome = reports.projectIncome.filter((row) => row.project_id === selectedProjectId);
  const drilldownMerchantIncome = reports.merchantIncome.filter((row) => row.project_id === selectedProjectId);
  const drilldownExpenses = reports.expenseDetails.filter((row) => row.project_id === selectedProjectId);

  return (
    <div className="report-group">
      <h2 className="report-group-title">项目经营</h2>
      <ReportTable
        className="report-primary-table"
        title="项目收支表"
        description="按项目展示收入、费用、待匹配成本和项目净额。"
        rows={reports.projectProfitLoss}
        rowKey={(row) => `${row.period}-${row.project_id ?? "none"}`}
        emptyLabel={emptyLabel}
        columns={profitColumns}
      />
      {selectedProjectId ? (
        <div className="report-drilldown-panel">
          <div className="report-drilldown-header">
            <div>
              <span>钻取视图</span>
              <h2>项目 {selectedProjectId}</h2>
            </div>
            <button type="button" className="secondary-button" onClick={onClearProject}>
              关闭钻取
            </button>
          </div>
          <ReportTable
            title="项目收入表"
            description="当前钻取项目的收入明细。"
            rows={drilldownIncome}
            rowKey={(row) =>
              `${row.period}-${row.project_id ?? "none"}-${row.merchant_id ?? "none"}-${row.category_id ?? "none"}-${row.currency_code}`
            }
            emptyLabel={emptyLabel}
            columns={projectIncomeColumns}
          />
          <ReportTable
            title="商户收入表"
            description="当前钻取项目下的商户收入汇总。"
            rows={drilldownMerchantIncome}
            rowKey={(row) => `${row.period}-${row.project_id ?? "none"}-${row.merchant_id ?? "none"}-${row.currency_code}`}
            emptyLabel={emptyLabel}
            columns={merchantIncomeColumns}
          />
          <ReportTable
            title="费用明细表"
            description="当前钻取项目下已经进入费用口径的单据明细。"
            rows={drilldownExpenses}
            rowKey={(row) => row.document_id}
            emptyLabel={emptyLabel}
            columns={expenseDetailColumns}
          />
        </div>
      ) : null}
      <SecondaryReportSection
        title="项目收入表"
        description="项目收入按项目、商户、分类、币种展开。"
        rows={reports.projectIncome}
        rowKey={(row) =>
          `${row.period}-${row.project_id ?? "none"}-${row.merchant_id ?? "none"}-${row.category_id ?? "none"}-${row.currency_code}`
        }
        emptyLabel={emptyLabel}
        columns={projectIncomeColumns}
      />
      <SecondaryReportSection
        title="商户收入表"
        description="商户维度收入汇总，用于和项目收入交叉核对。"
        rows={reports.merchantIncome}
        rowKey={(row) => `${row.period}-${row.project_id ?? "none"}-${row.merchant_id ?? "none"}-${row.currency_code}`}
        emptyLabel={emptyLabel}
        columns={merchantIncomeColumns}
      />
      <SecondaryReportSection
        title="月度经营总表"
        description="期间整体经营汇总，用于查看月度收入、成本和净额。"
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
        className="report-primary-table"
        title="费用明细表"
        description="费用单据按项目、人员、分类、币种展开，是费用分类的主表。"
        rows={reports.expenseDetails}
        rowKey={(row) => row.document_id}
        emptyLabel={emptyLabel}
        columns={expenseDetailColumns}
      />
      <SecondaryReportSection
        title="费用汇总表"
        description="费用按期间、项目、分类、人员、币种汇总。"
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
        className="report-primary-table"
        title="备用金余额表"
        description="后勤人员和账户维度的备用金余额。"
        rows={reports.pettyCashPending}
        rowKey={(row) => `${row.person_id}-${row.account_id}-${row.currency_code}`}
        emptyLabel={emptyLabel}
        columns={pettyCashPendingColumns}
      />
      <SecondaryReportSection
        title="待匹配成本表"
        description="备用金花费后尚未匹配到 FIFO 批次的成本记录。"
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
        className="report-primary-table"
        title="借款余额表"
        description="按借款人和币种汇总当前未结清借款。"
        rows={reports.loanBalances}
        rowKey={(row) => `${row.borrower_person_id}-${row.currency_code}`}
        emptyLabel={emptyLabel}
        columns={loanBalanceColumns}
      />
      <SecondaryReportSection
        title="借款账龄表"
        description="未结清借款项的账龄和剩余成本。"
        rows={reports.loanAging}
        rowKey={(row) => row.loan_item_id}
        emptyLabel={emptyLabel}
        columns={loanAgingColumns}
      />
      <SecondaryReportSection
        title="借款明细表"
        description="借款还款、核销和分配流水。"
        rows={reports.loanAllocations}
        rowKey={(row) => row.allocation_id}
        emptyLabel={emptyLabel}
        columns={loanAllocationColumns}
      />
      <SecondaryReportSection
        title="借款核销表"
        description="借款核销进入项目或费用口径的明细。"
        rows={reports.loanWriteoffs}
        rowKey={(row) => `${row.document_id}-${row.borrower_person_id}-${row.currency_code}-${row.allocation_date}`}
        emptyLabel={emptyLabel}
        columns={loanWriteoffColumns}
      />
    </div>
  );
}

export function ExceptionReports({ reports, emptyLabel }: { reports: ReportsState; emptyLabel: string }) {
  const exceptionChecks = sortedExceptionChecks(reports.exceptionChecks);

  return (
    <div className="report-group">
      <h2 className="report-group-title">异常</h2>
      <section className="panel exception-action-panel">
        <div className="report-table-header">
          <h2>异常处理清单</h2>
          <span>{exceptionChecks.length} 项</span>
        </div>
        {exceptionChecks.length > 0 ? (
          <div className="exception-action-list">
            {exceptionChecks.map((row) => (
              <article key={`${row.exception_type}-${row.entity_type}-${row.entity_id}`} className={`exception-action-item ${row.severity}`}>
                <div className="exception-action-heading">
                  <div>
                    <span className="exception-action-type">{row.exception_type}</span>
                    <h3>{row.message}</h3>
                  </div>
                  <span className="exception-severity">{row.severity}</span>
                </div>
                <div className="exception-action-meta">
                  <span>{row.entity_type}</span>
                  <span className="mono">{row.entity_id}</span>
                  <span>{formatOptional(row.period)}</span>
                  <span>{formatOptional(row.business_date)}</span>
                  <span>{formatOptional(row.currency_code)}</span>
                  <span>{formatMinor(row.amount_minor)}</span>
                </div>
                <p className="exception-action-suggestion">{exceptionActionLabel(row)}</p>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <strong>{emptyLabel}</strong>
          </div>
        )}
      </section>
    </div>
  );
}
