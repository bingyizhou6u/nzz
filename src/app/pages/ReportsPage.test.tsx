// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportsPage } from "./ReportsPage";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
    root = null;
  }

  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ReportsPage", () => {
  it("shows one report group at a time instead of stacking every report table", async () => {
    vi.stubGlobal("fetch", reportFetch());

    const container = await renderReportsPage();

    await waitFor(() => {
      expect(container.querySelector(".status-slot")?.textContent).toContain("已更新");
    });

    const detailRegion = reportDetailRegion(container);
    expect(detailRegion.getAttribute("role")).toBe("tabpanel");
    expect(detailRegion.textContent).toContain("账户余额表");
    expect(detailRegion.textContent).toContain("FIFO 消耗明细");
    expect(detailRegion.textContent).not.toContain("项目收支表");
    expect(container.querySelectorAll(".report-category-button")).toHaveLength(6);
  });

  it("switches report groups from the category navigation", async () => {
    vi.stubGlobal("fetch", reportFetch());

    const container = await renderReportsPage();

    await waitFor(() => {
      expect(container.querySelector(".status-slot")?.textContent).toContain("已更新");
    });

    await act(async () => {
      buttonByText(container, "项目经营4 张表").click();
    });

    const detailRegion = reportDetailRegion(container);
    expect(detailRegion.getAttribute("aria-labelledby")).toBe("report-group-tab-project");
    expect(detailRegion.textContent).toContain("项目收支表");
    expect(detailRegion.textContent).toContain("商户收入表");
    expect(detailRegion.textContent).not.toContain("账户余额表");
    expect(buttonByText(container, "项目经营4 张表").getAttribute("aria-selected")).toBe("true");
  });

  it("supports keyboard switching between report categories", async () => {
    vi.stubGlobal("fetch", reportFetch());

    const container = await renderReportsPage();

    await waitFor(() => {
      expect(container.querySelector(".status-slot")?.textContent).toContain("已更新");
    });

    await act(async () => {
      buttonByText(container, "资金3 张表").dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight", bubbles: true }));
    });

    expect(reportDetailRegion(container).textContent).toContain("项目收支表");
  });

  it("renders formal selector filters from report filter options", async () => {
    const fetchMock = reportFetch();
    vi.stubGlobal("fetch", fetchMock);

    const container = await renderReportsPage();

    await waitFor(() => {
      expect(selectByLabel(container, "项目").textContent).toContain("P1 项目一");
    });

    expect(selectByLabel(container, "商户").textContent).toContain("M1 商户一");
    expect(selectByLabel(container, "人员").textContent).toContain("Alice / ali");
    expect(selectByLabel(container, "币种").textContent).toContain("USDT Tether");

    await act(async () => {
      setSelectValue(selectByLabel(container, "项目"), "proj_1");
    });

    await waitFor(() => {
      const requestedUrls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(requestedUrls).toContain("/api/reports/project-income?projectId=proj_1&staleDays=30");
    });
  });

  it("shows group summary cards before the active report tables", async () => {
    vi.stubGlobal("fetch", reportFetch());

    const container = await renderReportsPage();

    await waitFor(() => {
      expect(container.querySelector(".report-summary-grid")?.textContent).toContain("资金余额");
    });

    expect(container.querySelector(".report-summary-grid")?.textContent).toContain("1,200");
    expect(container.querySelector(".report-summary-grid")?.textContent).toContain("换汇批次");
  });

  it("shows the active data source and export context in the workspace toolbar", async () => {
    vi.stubGlobal("fetch", reportFetch());

    const container = await renderReportsPage();

    await waitFor(() => {
      expect(container.querySelector(".report-source-context")?.textContent).toContain("实时数据 / 当前筛选");
    });

    expect(container.querySelector(".report-export-context")?.textContent).toContain("资金报表 / 实时数据 / 当前筛选");
  });

  it("keeps secondary report tables behind explicit collapsed sections", async () => {
    vi.stubGlobal("fetch", reportFetch());

    const container = await renderReportsPage();

    await waitFor(() => {
      expect(container.querySelector(".status-slot")?.textContent).toContain("已更新");
    });

    expect(container.querySelector(".report-primary-table")?.textContent).toContain("账户余额表");
    const secondarySections = Array.from(container.querySelectorAll("details.report-secondary-section"));
    expect(secondarySections).toHaveLength(2);
    expect(secondarySections[0]?.querySelector("summary")?.textContent).toContain("换汇批次表");
    expect(secondarySections[1]?.querySelector("summary")?.textContent).toContain("FIFO 消耗明细");
  });

  it("adds row counts, empty states, and horizontal scroll hints to report tables", async () => {
    vi.stubGlobal("fetch", reportFetch());

    const container = await renderReportsPage();

    await waitFor(() => {
      expect(container.querySelector(".report-table-scroll-hint")?.textContent).toContain("横向滚动");
    });

    const tableRegion = container.querySelector(".report-panel .table-wrap");
    expect(tableRegion?.getAttribute("role")).toBe("region");
    expect(tableRegion?.getAttribute("aria-label")).toContain("账户余额表");
    expect(tableRegion?.getAttribute("tabindex")).toBe("0");

    await act(async () => {
      buttonByText(container, "费用2 张表").click();
    });

    expect(reportDetailRegion(container).textContent).toContain("1 行");
    expect(reportDetailRegion(container).textContent).toContain("当前表格暂无记录");
  });

  it("drills from project profit rows into related income and expense details", async () => {
    vi.stubGlobal("fetch", reportFetch());

    const container = await renderReportsPage();

    await waitFor(() => {
      expect(container.querySelector(".status-slot")?.textContent).toContain("已更新");
    });

    await act(async () => {
      buttonByText(container, "项目经营4 张表").click();
    });

    await act(async () => {
      buttonByText(container, "钻取项目 proj_1").click();
    });

    const drilldown = container.querySelector(".report-drilldown-panel");
    expect(drilldown?.textContent).toContain("项目 proj_1");
    expect(drilldown?.textContent).toContain("项目收入表");
    expect(drilldown?.textContent).toContain("费用明细表");
    expect(drilldown?.textContent).toContain("doc_expense_1");
  });

  it("renders exceptions as a risk-sorted action list", async () => {
    vi.stubGlobal("fetch", reportFetch());

    const container = await renderReportsPage();

    await waitFor(() => {
      expect(container.querySelector(".status-slot")?.textContent).toContain("已更新");
    });

    await act(async () => {
      buttonByText(container, "异常1 张表").click();
    });

    const exceptionItems = Array.from(container.querySelectorAll(".exception-action-item"));
    expect(exceptionItems).toHaveLength(2);
    expect(exceptionItems[0]?.textContent).toContain("critical");
    expect(exceptionItems[0]?.textContent).toContain("负数余额");
    expect(exceptionItems[1]?.textContent).toContain("warning");
  });

  it("exports the active report group as CSV and XLSX files", async () => {
    const createObjectUrl = vi.fn(() => "blob:report");
    const revokeObjectUrl = vi.fn();
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    Object.defineProperty(globalThis.URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    Object.defineProperty(globalThis.URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
    vi.stubGlobal("fetch", reportFetch());

    const container = await renderReportsPage();

    await waitFor(() => {
      expect(container.querySelector(".status-slot")?.textContent).toContain("已更新");
    });

    await act(async () => {
      buttonByText(container, "导出CSV").click();
    });

    await act(async () => {
      buttonByText(container, "导出XLSX").click();
    });

    expect(createObjectUrl).toHaveBeenCalledTimes(2);
    expect(anchorClick).toHaveBeenCalledTimes(2);
    expect(revokeObjectUrl).toHaveBeenCalledTimes(2);
  });

  it("switches report data from realtime queries to a locked month close snapshot", async () => {
    const fetchMock = reportFetch();
    vi.stubGlobal("fetch", fetchMock);

    const container = await renderReportsPage();

    await waitFor(() => {
      expect(container.querySelector(".status-slot")?.textContent).toContain("已更新");
    });

    await act(async () => {
      setInputValue(inputByLabel(container, "期间"), "2026-04");
    });

    await waitFor(() => {
      const requestedUrls = fetchMock.mock.calls.map(([input]) => String(input));
      expect(requestedUrls).toContain("/api/month-close/2026-04/snapshots");
    });

    const callsBeforeSnapshotMode = fetchMock.mock.calls.length;

    await act(async () => {
      buttonByText(container, "已结账快照").click();
    });

    await waitFor(() => {
      expect(reportDetailRegion(container).textContent).toContain("acct_snapshot");
    });

    const requestedAfterSnapshotMode = fetchMock.mock.calls.slice(callsBeforeSnapshotMode).map(([input]) => String(input));
    expect(requestedAfterSnapshotMode).toContain("/api/month-close/snapshots/snapshot_1/reports/accountBalances");
    expect(requestedAfterSnapshotMode.some((url) => url.startsWith("/api/reports/account-balances"))).toBe(false);
    expect(container.querySelector(".status-slot")?.textContent).toContain("快照 v1");
    expect(container.querySelector(".report-source-context")?.textContent).toContain("已结账快照 / 2026-04 v1");
    expect(selectByLabel(container, "项目").disabled).toBe(true);
  });

  it("uses month close snapshot filenames when exporting snapshot reports", async () => {
    const downloads: string[] = [];
    const createObjectUrl = vi.fn(() => "blob:report");
    const revokeObjectUrl = vi.fn();
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      downloads.push(this.download);
    });
    Object.defineProperty(globalThis.URL, "createObjectURL", { configurable: true, value: createObjectUrl });
    Object.defineProperty(globalThis.URL, "revokeObjectURL", { configurable: true, value: revokeObjectUrl });
    vi.stubGlobal("fetch", reportFetch());

    const container = await renderReportsPage();

    await waitFor(() => {
      expect(container.querySelector(".status-slot")?.textContent).toContain("已更新");
    });

    await act(async () => {
      setInputValue(inputByLabel(container, "期间"), "2026-04");
    });

    await waitFor(() => {
      expect(selectByLabel(container, "快照版本").textContent).toContain("2026-04 v1");
    });

    await act(async () => {
      buttonByText(container, "已结账快照").click();
    });

    await waitFor(() => {
      expect(reportDetailRegion(container).textContent).toContain("acct_snapshot");
    });

    await act(async () => {
      buttonByText(container, "项目经营4 张表").click();
    });

    await act(async () => {
      buttonByText(container, "导出CSV").click();
    });

    await act(async () => {
      buttonByText(container, "导出XLSX").click();
    });

    expect(downloads).toContain("项目经营报表-2026-04-v1.csv");
    expect(downloads).toContain("月结包-2026-04-v1.xlsx");
    expect(createObjectUrl).toHaveBeenCalledTimes(2);
    expect(anchorClick).toHaveBeenCalledTimes(2);
    expect(revokeObjectUrl).toHaveBeenCalledTimes(2);
  });
});

type FetchHandler = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function reportFetch() {
  return vi.fn<FetchHandler>().mockImplementation(async (input) => {
    const path = String(input);
    if (path === "/api/reports/filter-options") return jsonResponse({ data: filterOptions });
    if (path === "/api/month-close/2026-04/snapshots") return jsonResponse({ data: snapshotOptions });
    if (path.startsWith("/api/month-close/snapshots/snapshot_1/reports/")) {
      const reportKey = path.split("/").at(-1) ?? "";
      return jsonResponse({
        data: {
          snapshot: snapshotOptions[0],
          report: {
            id: `snapshot_report_${reportKey}`,
            snapshot_id: "snapshot_1",
            report_key: reportKey,
            row_count: snapshotReportRows[reportKey]?.length ?? 0,
            rows: snapshotReportRows[reportKey] ?? [],
            created_at: "2026-04-30T11:00:00.000Z"
          }
        }
      });
    }
    if (path.startsWith("/api/reports/account-balances")) return jsonResponse({ data: reportRows.accountBalances });
    if (path.startsWith("/api/reports/lots")) return jsonResponse({ data: reportRows.lotBalances });
    if (path.startsWith("/api/reports/lot-movements")) return jsonResponse({ data: reportRows.lotMovements });
    if (path.startsWith("/api/reports/project-profit-loss")) return jsonResponse({ data: reportRows.projectProfitLoss });
    if (path.startsWith("/api/reports/project-income")) return jsonResponse({ data: reportRows.projectIncome });
    if (path.startsWith("/api/reports/merchant-income")) return jsonResponse({ data: reportRows.merchantIncome });
    if (path.startsWith("/api/reports/expense-details")) return jsonResponse({ data: reportRows.expenseDetails });
    if (path.startsWith("/api/reports/exception-checks")) return jsonResponse({ data: reportRows.exceptionChecks });
    return jsonResponse({ data: [] });
  });
}

const filterOptions = {
  projects: [{ id: "proj_1", code: "P1", name: "项目一" }],
  merchants: [{ id: "merchant_1", code: "M1", name: "商户一", project_id: "proj_1" }],
  people: [{ id: "person_1", name: "Alice", alias: "ali" }],
  currencies: [{ code: "USDT", name: "Tether" }]
};

const reportRows = {
  accountBalances: [{ account_id: "acct_1", currency_code: "USDT", balance_minor: 1200 }],
  lotBalances: [
    {
      id: "lot_1",
      currency_code: "USDT",
      remaining_amount_minor: 1200,
      remaining_usdt_cost_minor: 1200,
      source_document_id: "doc_fx_1",
      current_account_id: "acct_1",
      current_person_id: null,
      lot_date: "2026-04-01",
      status: "open"
    }
  ],
  lotMovements: [],
  projectProfitLoss: [
    {
      period: "2026-04",
      project_id: "proj_1",
      income_usdt_minor: 5000,
      expense_usdt_minor: 1200,
      pending_expense_minor: 100,
      net_usdt_minor: 3700,
      cost_status: "incomplete"
    }
  ],
  projectIncome: [
    {
      period: "2026-04",
      project_id: "proj_1",
      merchant_id: "merchant_1",
      category_id: "cat_income",
      currency_code: "USDT",
      income_amount_minor: 5000,
      income_usdt_minor: 5000
    }
  ],
  merchantIncome: [
    {
      period: "2026-04",
      project_id: "proj_1",
      merchant_id: "merchant_1",
      currency_code: "USDT",
      income_amount_minor: 5000,
      income_usdt_minor: 5000
    }
  ],
  expenseDetails: [
    {
      document_id: "doc_expense_1",
      document_type: "petty_cash_reimbursement",
      period: "2026-04",
      business_date: "2026-04-10",
      project_id: "proj_1",
      merchant_id: null,
      category_id: "cat_expense",
      person_id: "person_1",
      borrower_person_id: null,
      currency_code: "AED",
      amount_minor: 1200,
      matched_usdt_cost_minor: 1100,
      pending_amount_minor: 100,
      cost_status: "incomplete"
    }
  ],
  exceptionChecks: [
    {
      exception_type: "pending_cost",
      severity: "warning",
      entity_type: "document",
      entity_id: "doc_expense_1",
      period: "2026-04",
      business_date: "2026-04-10",
      currency_code: "AED",
      amount_minor: 100,
      usdt_cost_minor: null,
      message: "仍有待匹配成本"
    },
    {
      exception_type: "negative_company_account",
      severity: "critical",
      entity_type: "account",
      entity_id: "acct_1",
      period: null,
      business_date: null,
      currency_code: "USDT",
      amount_minor: -100,
      usdt_cost_minor: -100,
      message: "负数余额"
    }
  ]
};

const snapshotOptions = [
  {
    id: "snapshot_1",
    period: "2026-04",
    version: 1,
    run_id: "run_1",
    locked_by: "manager_1",
    locked_at: "2026-04-30T11:00:00.000Z",
    note: "closed",
    summary_json: JSON.stringify({ criticalCount: 0, warningCount: 0, infoCount: 0 })
  }
];

const snapshotReportRows: Record<string, object[]> = {
  accountBalances: [{ account_id: "acct_snapshot", currency_code: "USDT", balance_minor: 9900 }],
  lotBalances: [],
  lotMovements: [],
  pettyCashPending: [],
  pendingCosts: [],
  loanBalances: [],
  loanAging: [],
  projectProfitLoss: [
    {
      period: "2026-04",
      project_id: "project_snapshot",
      income_usdt_minor: 7000,
      expense_usdt_minor: 1200,
      pending_expense_minor: 0,
      net_usdt_minor: 5800,
      cost_status: "complete"
    }
  ],
  projectIncome: [
    {
      period: "2026-04",
      project_id: "project_snapshot",
      merchant_id: "merchant_snapshot",
      category_id: "cat_income",
      currency_code: "USDT",
      income_amount_minor: 7000,
      income_usdt_minor: 7000
    }
  ],
  merchantIncome: [],
  expenseDetails: [],
  expenseSummary: [],
  monthlyOperatingSummary: [],
  exceptionChecks: []
};

async function renderReportsPage() {
  const container = document.createElement("div");
  document.body.appendChild(container);

  await act(async () => {
    root = createRoot(container);
    root.render(createElement(ReportsPage));
  });

  return container;
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers
    }
  });
}

async function waitFor(assertion: () => void): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }

  throw lastError;
}

function reportDetailRegion(container: HTMLElement): HTMLElement {
  const region = container.querySelector(".report-detail-region");
  if (!(region instanceof HTMLElement)) {
    throw new Error("Report detail region not found");
  }
  return region;
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.replace(/\s+/g, " ").trim() === text
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${text}`);
  }

  return button;
}

function selectByLabel(container: HTMLElement, label: string): HTMLSelectElement {
  const labels = Array.from(container.querySelectorAll("label"));
  const labelElement = labels.find((candidate) => candidate.textContent?.replace(/\s+/g, " ").trim().startsWith(label));
  const select = labelElement?.querySelector("select");
  if (!(select instanceof HTMLSelectElement)) {
    throw new Error(`Select not found: ${label}`);
  }
  return select;
}

function setSelectValue(select: HTMLSelectElement, value: string) {
  select.value = value;
  select.dispatchEvent(new Event("change", { bubbles: true }));
}

function inputByLabel(container: HTMLElement, label: string): HTMLInputElement {
  const labels = Array.from(container.querySelectorAll("label"));
  const labelElement = labels.find((candidate) => candidate.textContent?.replace(/\s+/g, " ").trim().startsWith(label));
  const input = labelElement?.querySelector("input");
  if (!(input instanceof HTMLInputElement)) {
    throw new Error(`Input not found: ${label}`);
  }
  return input;
}

function setInputValue(input: HTMLInputElement, value: string) {
  input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
}
