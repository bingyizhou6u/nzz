import { useState } from "react";
import type {
  MonthCloseFundingReconciliation,
  MonthCloseLoanReconciliation,
  MonthClosePettyCashReconciliation,
  MonthCloseProjectReconciliation,
  MonthCloseReconciliation
} from "./monthCloseTypes";

type ReconciliationTabKey = "funding" | "pettyCash" | "loans" | "projects";

interface MonthCloseReconciliationTabsProps {
  reconciliation: MonthCloseReconciliation | null;
  isLoading: boolean;
}

const tabs: Array<{ key: ReconciliationTabKey; label: string }> = [
  { key: "funding", label: "资金对账" },
  { key: "pettyCash", label: "备用金" },
  { key: "loans", label: "借款" },
  { key: "projects", label: "项目经营" }
];

export function MonthCloseReconciliationTabs({ reconciliation, isLoading }: MonthCloseReconciliationTabsProps) {
  const [activeTab, setActiveTab] = useState<ReconciliationTabKey>("funding");
  const rows = reconciliation?.[activeTab] ?? [];

  return (
    <section className="panel month-close-reconciliation-panel">
      <div className="panel-header">
        <h2>对账汇总</h2>
        <div className="status-slot">{isLoading ? "读取中" : `${rows.length} 行`}</div>
      </div>
      <div className="month-close-reconciliation-tabs" role="tablist" aria-label="对账汇总">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            role="tab"
            className={activeTab === tab.key ? "tab active" : "tab"}
            aria-selected={activeTab === tab.key}
            data-reconciliation-tab={tab.key}
            onClick={() => setActiveTab(tab.key)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className="month-close-reconciliation-region">
        {isLoading ? <div className="workspace-placeholder">读取对账汇总中</div> : renderActiveTable(activeTab, rows)}
      </div>
    </section>
  );
}

function renderActiveTable(tab: ReconciliationTabKey, rows: MonthCloseReconciliation[ReconciliationTabKey]) {
  if (tab === "funding") return <FundingTable rows={rows as MonthCloseFundingReconciliation[]} />;
  if (tab === "pettyCash") return <PettyCashTable rows={rows as MonthClosePettyCashReconciliation[]} />;
  if (tab === "loans") return <LoanTable rows={rows as MonthCloseLoanReconciliation[]} />;
  return <ProjectTable rows={rows as MonthCloseProjectReconciliation[]} />;
}

function FundingTable({ rows }: { rows: MonthCloseFundingReconciliation[] }) {
  return (
    <ReconciliationTable
      columns={["账户", "类型", "币种", "期初", "本期流入", "本期流出", "期末"]}
      emptyText="暂无资金对账数据"
      rows={rows.map((row) => [
        row.accountId,
        row.accountType,
        row.currencyCode,
        amount(row.openingBalanceMinor),
        amount(row.periodInflowMinor),
        amount(row.periodOutflowMinor),
        amount(row.closingBalanceMinor)
      ])}
    />
  );
}

function PettyCashTable({ rows }: { rows: MonthClosePettyCashReconciliation[] }) {
  return (
    <ReconciliationTable
      columns={["人员", "账户", "币种", "期初", "本期领取", "本期报销", "期末", "待匹配"]}
      emptyText="暂无备用金对账数据"
      rows={rows.map((row) => [
        row.personId ?? "-",
        row.accountId,
        row.currencyCode,
        amount(row.openingBalanceMinor),
        amount(row.periodIssuedMinor),
        amount(row.periodReimbursedMinor),
        amount(row.closingBalanceMinor),
        amount(row.pendingCostMinor)
      ])}
    />
  );
}

function LoanTable({ rows }: { rows: MonthCloseLoanReconciliation[] }) {
  return (
    <ReconciliationTable
      columns={["借款人", "币种", "期初", "本期借出", "本期归还", "本期核销", "期末"]}
      emptyText="暂无借款对账数据"
      rows={rows.map((row) => [
        row.borrowerPersonId,
        row.currencyCode,
        amount(row.openingBalanceMinor),
        amount(row.periodLoanOutMinor),
        amount(row.periodRepaymentMinor),
        amount(row.periodWriteoffMinor),
        amount(row.closingBalanceMinor)
      ])}
    />
  );
}

function ProjectTable({ rows }: { rows: MonthCloseProjectReconciliation[] }) {
  return (
    <ReconciliationTable
      columns={["项目", "币种", "收入原币", "费用原币", "已匹配 USDT 成本", "待匹配原币"]}
      emptyText="暂无项目经营对账数据"
      rows={rows.map((row) => [
        row.projectId ?? "-",
        row.currencyCode,
        amount(row.incomeAmountMinor),
        amount(row.expenseAmountMinor),
        amount(row.matchedUsdtCostMinor),
        amount(row.pendingAmountMinor)
      ])}
    />
  );
}

function ReconciliationTable({ columns, rows, emptyText }: { columns: string[]; rows: string[][]; emptyText: string }) {
  return (
    <>
      <div className="table-wrap" role="region" aria-label="月结对账表格，可横向滚动" tabIndex={0}>
        <table className="data-table month-close-reconciliation-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row, rowIndex) => (
                <tr key={`${row[0]}-${row[1]}-${rowIndex}`}>
                  {row.map((cell, cellIndex) => (
                    <td key={`${cell}-${cellIndex}`} className={cellIndex >= 2 ? "mono" : undefined}>
                      {cell}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="empty-cell">
                  {emptyText}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="table-scroll-hint">列较多时可横向滚动查看完整字段</div>
    </>
  );
}

function amount(value: number) {
  const sign = value < 0 ? "-" : "";
  return `${sign}${Math.abs(value / 100).toLocaleString("zh-CN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}
