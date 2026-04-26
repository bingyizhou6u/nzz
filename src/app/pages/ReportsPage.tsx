import { useEffect, useState } from "react";
import type { KeyboardEvent } from "react";
import { getJson, type ApiEnvelope } from "../api";
import { defaultReportFilters, buildReportQuery } from "./reports/reportFilters";
import { downloadReportExport } from "./reports/reportExport";
import {
  emptyReportFilterOptions,
  reportGroupNavItems,
  reportGroupPanelId,
  reportGroupTabId,
  summaryCardsForGroup,
  type ReportFilterOptions,
  type ReportGroupKey
} from "./reports/reportExperience";
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
  const [filterOptions, setFilterOptions] = useState<ReportFilterOptions>(emptyReportFilterOptions);
  const [filterOptionsError, setFilterOptionsError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeReportGroup, setActiveReportGroup] = useState<ReportGroupKey>("funding");
  const [projectDrilldownId, setProjectDrilldownId] = useState<string | null>(null);
  const query = buildReportQuery(filters);
  const summaryCards = summaryCardsForGroup(activeReportGroup, reports);
  const merchantOptions = filters.projectId
    ? filterOptions.merchants.filter((merchant) => merchant.project_id === filters.projectId)
    : filterOptions.merchants;

  function focusReportGroup(key: ReportGroupKey) {
    setActiveReportGroup(key);
    const focusTab = () => {
      document.getElementById(reportGroupTabId(key))?.focus();
    };
    if (typeof window.requestAnimationFrame === "function") {
      window.requestAnimationFrame(focusTab);
    } else {
      focusTab();
    }
  }

  function handleReportGroupKeyDown(event: KeyboardEvent<HTMLButtonElement>, key: ReportGroupKey) {
    const currentIndex = reportGroupNavItems.findIndex((item) => item.key === key);
    if (currentIndex === -1) return;

    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      const nextItem = reportGroupNavItems[(currentIndex + 1) % reportGroupNavItems.length];
      if (nextItem) focusReportGroup(nextItem.key);
      return;
    }

    if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      const previousItem = reportGroupNavItems[(currentIndex - 1 + reportGroupNavItems.length) % reportGroupNavItems.length];
      if (previousItem) focusReportGroup(previousItem.key);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      const firstItem = reportGroupNavItems[0];
      if (firstItem) focusReportGroup(firstItem.key);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      const lastItem = reportGroupNavItems[reportGroupNavItems.length - 1];
      if (lastItem) focusReportGroup(lastItem.key);
    }
  }

  useEffect(() => {
    let isCurrent = true;

    async function loadFilterOptions() {
      setFilterOptionsError(null);
      try {
        const response = await getJson<ApiEnvelope<ReportFilterOptions>>("/api/reports/filter-options");
        if (isCurrent) {
          setFilterOptions(response.data);
        }
      } catch (loadError) {
        if (isCurrent) {
          setFilterOptionsError(loadError instanceof Error ? loadError.message : "读取筛选项失败");
        }
      }
    }

    void loadFilterOptions();

    return () => {
      isCurrent = false;
    };
  }, []);

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
            项目
            <select
              value={filters.projectId}
              onChange={(event) => setFilters((current) => ({ ...current, projectId: event.target.value, merchantId: "" }))}
            >
              <option value="">全部项目</option>
              {filterOptions.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code} {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            商户
            <select
              value={filters.merchantId}
              onChange={(event) => setFilters((current) => ({ ...current, merchantId: event.target.value }))}
            >
              <option value="">全部商户</option>
              {merchantOptions.map((merchant) => (
                <option key={merchant.id} value={merchant.id}>
                  {merchant.code} {merchant.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            人员
            <select value={filters.personId} onChange={(event) => setFilters((current) => ({ ...current, personId: event.target.value }))}>
              <option value="">全部人员</option>
              {filterOptions.people.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.alias ? `${person.name} / ${person.alias}` : person.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            币种
            <select
              value={filters.currencyCode}
              onChange={(event) => setFilters((current) => ({ ...current, currencyCode: event.target.value }))}
            >
              <option value="">全部币种</option>
              {filterOptions.currencies.map((currency) => (
                <option key={currency.code} value={currency.code}>
                  {currency.code} {currency.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            异常天数
            <select value={filters.staleDays} onChange={(event) => setFilters((current) => ({ ...current, staleDays: event.target.value }))}>
              <option value="7">7 天</option>
              <option value="14">14 天</option>
              <option value="30">30 天</option>
              <option value="60">60 天</option>
              <option value="90">90 天</option>
            </select>
          </label>
        </div>
        {filterOptionsError ? <div className="notice error">{filterOptionsError}</div> : null}
      </section>

      <section className="report-workspace">
        <div className="report-category-nav" role="tablist" aria-label="报表分类">
          {reportGroupNavItems.map((item) => (
            <button
              key={item.key}
              id={reportGroupTabId(item.key)}
              type="button"
              role="tab"
              className={
                item.key === activeReportGroup
                  ? "report-category-button report-category-button-active"
                  : "report-category-button"
              }
              aria-selected={item.key === activeReportGroup}
              aria-controls={reportGroupPanelId(item.key)}
              tabIndex={item.key === activeReportGroup ? 0 : -1}
              onClick={() => setActiveReportGroup(item.key)}
              onKeyDown={(event) => handleReportGroupKeyDown(event, item.key)}
            >
              <span>{item.label}</span>
              <small>{item.tableCount} 张表</small>
            </button>
          ))}
        </div>

        <div className="report-workspace-main">
          <div className="report-workspace-toolbar">
            <div className="report-summary-grid" aria-label="当前报表摘要">
              {summaryCards.map((card) => (
                <div key={card.label} className="report-summary-card">
                  <span>{card.label}</span>
                  <strong>{card.value}</strong>
                  <small>{card.detail}</small>
                </div>
              ))}
            </div>
            <div className="report-export-actions">
              <button type="button" className="secondary-button" onClick={() => downloadReportExport(activeReportGroup, reports, "csv")}>
                导出CSV
              </button>
              <button type="button" className="secondary-button" onClick={() => downloadReportExport(activeReportGroup, reports, "xlsx")}>
                导出XLSX
              </button>
            </div>
          </div>

          <div
            id={reportGroupPanelId(activeReportGroup)}
            className="report-detail-region"
            role="tabpanel"
            aria-labelledby={reportGroupTabId(activeReportGroup)}
          >
            {renderReportGroup(activeReportGroup, reports, rowLabel, {
              selectedProjectId: projectDrilldownId,
              onSelectProject: setProjectDrilldownId,
              onClearProject: () => setProjectDrilldownId(null)
            })}
          </div>
        </div>
      </section>
    </div>
  );
}

function renderReportGroup(
  key: ReportGroupKey,
  reports: ReportsState,
  rowLabel: string,
  drilldown: {
    selectedProjectId: string | null;
    onSelectProject: (projectId: string | null) => void;
    onClearProject: () => void;
  }
) {
  if (key === "funding") return <FundingReports reports={reports} emptyLabel={rowLabel} />;
  if (key === "project") {
    return (
      <ProjectReports
        reports={reports}
        emptyLabel={rowLabel}
        selectedProjectId={drilldown.selectedProjectId}
        onSelectProject={drilldown.onSelectProject}
        onClearProject={drilldown.onClearProject}
      />
    );
  }
  if (key === "expense") return <ExpenseReports reports={reports} emptyLabel={rowLabel} />;
  if (key === "pettyCash") return <PettyCashReports reports={reports} emptyLabel={rowLabel} />;
  if (key === "loan") return <LoanReports reports={reports} emptyLabel={rowLabel} />;
  return <ExceptionReports reports={reports} emptyLabel={rowLabel} />;
}
