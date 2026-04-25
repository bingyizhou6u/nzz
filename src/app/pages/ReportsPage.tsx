import { useEffect, useState } from "react";
import { getJson, type ApiEnvelope } from "../api";
import { defaultReportFilters, buildReportQuery } from "./reports/reportFilters";
import {
  ExceptionReports,
  ExpenseReports,
  FundingReports,
  LoanReports,
  ProjectReports,
  PettyCashReports
} from "./reports/reportGroups";
import { emptyReports, type ReportsState } from "./reports/reportTypes";
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
  ProjectProfitLoss
} from "./reports/reportTypes";

export function ReportsPage() {
  const [reports, setReports] = useState<ReportsState>(emptyReports);
  const [filters, setFilters] = useState(defaultReportFilters);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const query = buildReportQuery(filters);

  useEffect(() => {
    let isCurrent = true;

    async function loadReports() {
      setIsLoading(true);
      setError(null);
      try {
        const [
          accountBalances,
          pettyCashPending,
          loanBalances,
          loanAging,
          loanAllocations,
          loanWriteoffs,
          lotBalances,
          lotMovements,
          pendingCosts,
          projectProfitLoss,
          projectIncome,
          merchantIncome,
          expenseDetails,
          expenseSummary,
          monthlyOperatingSummary,
          exceptionChecks
        ] = await Promise.all([
          getJson<ApiEnvelope<AccountBalance[]>>("/api/reports/account-balances"),
          getJson<ApiEnvelope<PettyCashPending[]>>("/api/reports/petty-cash-pending"),
          getJson<ApiEnvelope<LoanBalance[]>>("/api/reports/loan-balances"),
          getJson<ApiEnvelope<LoanAging[]>>("/api/reports/loan-aging"),
          getJson<ApiEnvelope<LoanAllocation[]>>("/api/reports/loan-allocations"),
          getJson<ApiEnvelope<LoanWriteoff[]>>("/api/reports/loan-writeoffs"),
          getJson<ApiEnvelope<LotBalance[]>>("/api/reports/lots"),
          getJson<ApiEnvelope<LotMovement[]>>("/api/reports/lot-movements"),
          getJson<ApiEnvelope<PendingCost[]>>("/api/reports/pending-costs"),
          getJson<ApiEnvelope<ProjectProfitLoss[]>>(`/api/reports/project-profit-loss${query}`),
          getJson<ApiEnvelope<ProjectIncome[]>>(`/api/reports/project-income${query}`),
          getJson<ApiEnvelope<MerchantIncome[]>>(`/api/reports/merchant-income${query}`),
          getJson<ApiEnvelope<ExpenseDetail[]>>(`/api/reports/expense-details${query}`),
          getJson<ApiEnvelope<ExpenseSummary[]>>(`/api/reports/expense-summary${query}`),
          getJson<ApiEnvelope<MonthlyOperatingSummary[]>>(`/api/reports/monthly-operating${query}`),
          getJson<ApiEnvelope<ExceptionCheck[]>>(`/api/reports/exception-checks${query}`)
        ]);

        if (isCurrent) {
          setReports({
            accountBalances: accountBalances.data,
            pettyCashPending: pettyCashPending.data,
            loanBalances: loanBalances.data,
            loanAging: loanAging.data,
            loanAllocations: loanAllocations.data,
            loanWriteoffs: loanWriteoffs.data,
            lotBalances: lotBalances.data,
            lotMovements: lotMovements.data,
            pendingCosts: pendingCosts.data,
            projectProfitLoss: projectProfitLoss.data,
            projectIncome: projectIncome.data,
            merchantIncome: merchantIncome.data,
            expenseDetails: expenseDetails.data,
            expenseSummary: expenseSummary.data,
            monthlyOperatingSummary: monthlyOperatingSummary.data,
            exceptionChecks: exceptionChecks.data
          });
        }
      } catch (loadError) {
        if (isCurrent) {
          setError(loadError instanceof Error ? loadError.message : "读取报表失败");
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    void loadReports();

    return () => {
      isCurrent = false;
    };
  }, [query, reloadKey]);

  const rowLabel = isLoading ? "读取中" : error ? "读取失败" : "暂无数据";

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <h2>报表读取</h2>
          <div className="header-actions">
            <div className="status-slot" role="status" aria-live="polite">
              {isLoading ? "读取中" : error ? "失败" : "已更新"}
            </div>
            <button type="button" className="secondary-button" onClick={() => setReloadKey((value) => value + 1)}>
              重新读取
            </button>
          </div>
        </div>

        {error ? <div className="notice error">{error}</div> : null}
      </section>

      <section className="panel">
        <div className="report-filter-grid">
          <label>
            期间
            <input value={filters.period} onChange={(event) => setFilters((current) => ({ ...current, period: event.target.value }))} />
          </label>
          <label>
            项目ID
            <input value={filters.projectId} onChange={(event) => setFilters((current) => ({ ...current, projectId: event.target.value }))} />
          </label>
          <label>
            商户ID
            <input
              value={filters.merchantId}
              onChange={(event) => setFilters((current) => ({ ...current, merchantId: event.target.value }))}
            />
          </label>
          <label>
            人员ID
            <input value={filters.personId} onChange={(event) => setFilters((current) => ({ ...current, personId: event.target.value }))} />
          </label>
          <label>
            币种
            <input
              value={filters.currencyCode}
              onChange={(event) => setFilters((current) => ({ ...current, currencyCode: event.target.value }))}
            />
          </label>
          <label>
            异常天数
            <input value={filters.staleDays} onChange={(event) => setFilters((current) => ({ ...current, staleDays: event.target.value }))} />
          </label>
        </div>
      </section>

      <FundingReports reports={reports} emptyLabel={rowLabel} />
      <ProjectReports reports={reports} emptyLabel={rowLabel} />
      <ExpenseReports reports={reports} emptyLabel={rowLabel} />
      <PettyCashReports reports={reports} emptyLabel={rowLabel} />
      <LoanReports reports={reports} emptyLabel={rowLabel} />
      <ExceptionReports reports={reports} emptyLabel={rowLabel} />
    </div>
  );
}
