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
  reportDataContextLabel,
  reportExportContextLabel,
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
import {
  emptyReports,
  type MonthCloseReportSnapshotResponse,
  type MonthCloseSnapshot,
  type ReportsState
} from "./reports/reportTypes";
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
  const [dataMode, setDataMode] = useState<"live" | "snapshot">("live");
  const [snapshots, setSnapshots] = useState<MonthCloseSnapshot[]>([]);
  const [selectedSnapshotId, setSelectedSnapshotId] = useState("");
  const [snapshotOptionsError, setSnapshotOptionsError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [activeReportGroup, setActiveReportGroup] = useState<ReportGroupKey>("funding");
  const [projectDrilldownId, setProjectDrilldownId] = useState<string | null>(null);
  const query = buildReportQuery(filters);
  const summaryCards = summaryCardsForGroup(activeReportGroup, reports);
  const selectedSnapshot = snapshots.find((snapshot) => snapshot.id === selectedSnapshotId) ?? null;
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
    const period = filters.period.trim();
    if (!period) {
      setSnapshots([]);
      setSelectedSnapshotId("");
      setSnapshotOptionsError(null);
      return;
    }

    let isCurrent = true;

    async function loadSnapshots() {
      setSnapshotOptionsError(null);
      try {
        const response = await getJson<ApiEnvelope<MonthCloseSnapshot[]>>(
          `/api/month-close/${encodeURIComponent(period)}/snapshots`
        );
        if (!isCurrent) return;
        setSnapshots(response.data);
        setSelectedSnapshotId((current) =>
          response.data.some((snapshot) => snapshot.id === current) ? current : response.data[0]?.id ?? ""
        );
      } catch (loadError) {
        if (isCurrent) {
          setSnapshots([]);
          setSelectedSnapshotId("");
          setSnapshotOptionsError(loadError instanceof Error ? loadError.message : "读取快照版本失败");
        }
      }
    }

    void loadSnapshots();

    return () => {
      isCurrent = false;
    };
  }, [filters.period]);

  useEffect(() => {
    let isCurrent = true;

    async function loadReports() {
      setIsLoading(true);
      setError(null);
      try {
        const nextReports =
          dataMode === "snapshot"
            ? selectedSnapshotId
              ? await loadSnapshotReports(selectedSnapshotId)
              : emptyReports
            : await loadLiveReports(query);

        if (isCurrent) {
          setReports(nextReports);
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
  }, [dataMode, query, reloadKey, selectedSnapshotId]);

  const rowLabel = isLoading ? "读取中" : error ? "读取失败" : dataMode === "snapshot" && !selectedSnapshotId ? "请选择快照版本" : "暂无数据";
  const dataContext = selectedSnapshot
    ? { source: dataMode, period: selectedSnapshot.period, version: selectedSnapshot.version }
    : { source: dataMode };
  const exportContext = dataContext;
  const dataContextLabel = reportDataContextLabel(dataContext);
  const csvExportContextLabel = reportExportContextLabel(activeReportGroup, dataContext, "csv");
  const xlsxExportContextLabel = reportExportContextLabel(activeReportGroup, dataContext, "xlsx");
  const filtersDisabled = dataMode === "snapshot";

  return (
    <div className="page-stack">
      <section className="panel report-control-panel">
        <div className="panel-header">
          <div>
            <h2>报表分析工作台</h2>
            <p className="panel-subtitle report-source-context">{dataContextLabel}</p>
          </div>
          <div className="header-actions">
            <div className="status-slot" role="status" aria-live="polite">
              {isLoading
                ? "读取中"
                : error
                  ? "失败"
                  : dataMode === "snapshot" && selectedSnapshot
                    ? `快照 v${selectedSnapshot.version}`
                    : "已更新"}
            </div>
            <button type="button" className="secondary-button" onClick={() => setReloadKey((value) => value + 1)}>
              重新读取
            </button>
          </div>
        </div>

        <div className="report-version-bar" aria-label="报表版本">
          <div className="report-version-toggle" role="group" aria-label="数据来源">
            <button
              type="button"
              className={dataMode === "live" ? "segmented-button segmented-button-active" : "segmented-button"}
              onClick={() => setDataMode("live")}
            >
              实时数据
            </button>
            <button
              type="button"
              className={dataMode === "snapshot" ? "segmented-button segmented-button-active" : "segmented-button"}
              onClick={() => setDataMode("snapshot")}
            >
              已结账快照
            </button>
          </div>
          <label>
            快照版本
            <select
              value={selectedSnapshotId}
              disabled={!filters.period || snapshots.length === 0}
              onChange={(event) => {
                setSelectedSnapshotId(event.target.value);
                setDataMode("snapshot");
              }}
            >
              <option value="">选择快照</option>
              {snapshots.map((snapshot) => (
                <option key={snapshot.id} value={snapshot.id}>
                  {snapshot.period} v{snapshot.version} {snapshot.locked_at}
                </option>
              ))}
            </select>
          </label>
        </div>
        {dataMode === "snapshot" ? (
          <div className="report-snapshot-note" role="status" aria-live="polite">
            快照模式使用锁账时保存的报表数据，项目、商户、人员、币种和异常天数筛选已暂停。
          </div>
        ) : null}
        <div className="report-filter-grid">
          <label>
            期间
            <input
              value={filters.period}
              onInput={(event) => {
                const period = event.currentTarget.value;
                setFilters((current) => ({ ...current, period }));
              }}
              onChange={(event) => {
                const period = event.target.value;
                setFilters((current) => ({ ...current, period }));
              }}
            />
          </label>
          <label>
            项目
            <select
              value={filters.projectId}
              disabled={filtersDisabled}
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
              disabled={filtersDisabled}
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
            <select
              value={filters.personId}
              disabled={filtersDisabled}
              onChange={(event) => setFilters((current) => ({ ...current, personId: event.target.value }))}
            >
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
              disabled={filtersDisabled}
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
            <select
              value={filters.staleDays}
              disabled={filtersDisabled}
              onChange={(event) => setFilters((current) => ({ ...current, staleDays: event.target.value }))}
            >
              <option value="7">7 天</option>
              <option value="14">14 天</option>
              <option value="30">30 天</option>
              <option value="60">60 天</option>
              <option value="90">90 天</option>
            </select>
          </label>
        </div>
        {error ? <div className="notice error">{error}</div> : null}
        {filterOptionsError ? <div className="notice error">{filterOptionsError}</div> : null}
        {snapshotOptionsError ? <div className="notice error">{snapshotOptionsError}</div> : null}
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
              <span className="report-export-context">{csvExportContextLabel}</span>
              <button
                type="button"
                className="secondary-button"
                title={csvExportContextLabel}
                onClick={() => downloadReportExport(activeReportGroup, reports, "csv", exportContext)}
              >
                导出CSV
              </button>
              <button
                type="button"
                className="secondary-button"
                title={xlsxExportContextLabel}
                onClick={() => downloadReportExport(activeReportGroup, reports, "xlsx", exportContext)}
              >
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

async function loadLiveReports(query: string): Promise<ReportsState> {
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

  return {
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
  };
}

async function loadSnapshotReports(snapshotId: string): Promise<ReportsState> {
  const [
    accountBalances,
    lotBalances,
    lotMovements,
    pettyCashPending,
    pendingCosts,
    loanBalances,
    loanAging,
    projectProfitLoss,
    projectIncome,
    merchantIncome,
    expenseDetails,
    expenseSummary,
    monthlyOperatingSummary,
    exceptionChecks
  ] = await Promise.all([
    snapshotRows<AccountBalance>(snapshotId, "accountBalances"),
    snapshotRows<LotBalance>(snapshotId, "lotBalances"),
    snapshotRows<LotMovement>(snapshotId, "lotMovements"),
    snapshotRows<PettyCashPending>(snapshotId, "pettyCashPending"),
    snapshotRows<PendingCost>(snapshotId, "pendingCosts"),
    snapshotRows<LoanBalance>(snapshotId, "loanBalances"),
    snapshotRows<LoanAging>(snapshotId, "loanAging"),
    snapshotRows<ProjectProfitLoss>(snapshotId, "projectProfitLoss"),
    snapshotRows<ProjectIncome>(snapshotId, "projectIncome"),
    snapshotRows<MerchantIncome>(snapshotId, "merchantIncome"),
    snapshotRows<ExpenseDetail>(snapshotId, "expenseDetails"),
    snapshotRows<ExpenseSummary>(snapshotId, "expenseSummary"),
    snapshotRows<MonthlyOperatingSummary>(snapshotId, "monthlyOperatingSummary"),
    snapshotRows<ExceptionCheck>(snapshotId, "exceptionChecks")
  ]);

  return {
    accountBalances,
    pettyCashPending,
    loanBalances,
    loanAging,
    loanAllocations: [],
    loanWriteoffs: [],
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
  };
}

async function snapshotRows<T>(snapshotId: string, reportKey: string): Promise<T[]> {
  const response = await getJson<ApiEnvelope<MonthCloseReportSnapshotResponse<T>>>(
    `/api/month-close/snapshots/${encodeURIComponent(snapshotId)}/reports/${encodeURIComponent(reportKey)}`
  );
  return response.data.report.rows;
}
