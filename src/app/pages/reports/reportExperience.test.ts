import { describe, expect, it } from "vitest";
import {
  reportDataContextLabel,
  reportExportContextLabel,
  summaryCardsForGroup
} from "./reportExperience";
import { emptyReports, type ReportsState } from "./reportTypes";

describe("summaryCardsForGroup", () => {
  it("summarizes project profit, income, and pending cost exposure", () => {
    const reports: ReportsState = {
      ...emptyReports,
      projectProfitLoss: [
        {
          period: "2026-04",
          project_id: "project_1",
          income_usdt_minor: 15000,
          expense_usdt_minor: 4500,
          pending_expense_minor: 1200,
          net_usdt_minor: 9300,
          cost_status: "incomplete"
        }
      ],
      projectIncome: [
        {
          period: "2026-04",
          project_id: "project_1",
          merchant_id: "merchant_1",
          category_id: "income",
          currency_code: "USDT",
          income_amount_minor: 15000,
          income_usdt_minor: 15000
        }
      ]
    };

    expect(summaryCardsForGroup("project", reports)).toEqual([
      { label: "项目净额", value: "9,300", detail: "1 个项目" },
      { label: "项目收入", value: "15,000", detail: "1 行收入" },
      { label: "待匹配成本", value: "1,200", detail: "影响项目净额确认" }
    ]);
  });
});

describe("report data context labels", () => {
  it("labels live reports as current filtered data", () => {
    expect(reportDataContextLabel({ source: "live" })).toBe("实时数据 / 当前筛选");
  });

  it("labels snapshot reports with locked period and version", () => {
    expect(reportDataContextLabel({ source: "snapshot", period: "2026-04", version: 2 })).toBe(
      "已结账快照 / 2026-04 v2"
    );
  });
});

describe("report export context labels", () => {
  it("describes the active group and data source for live exports", () => {
    expect(reportExportContextLabel("funding", { source: "live" })).toBe("资金报表 / 实时数据 / 当前筛选");
  });

  it("describes snapshot package exports separately from current group exports", () => {
    expect(reportExportContextLabel("project", { source: "snapshot", period: "2026-04", version: 1 }, "xlsx")).toBe(
      "月结包 / 已结账快照 / 2026-04 v1"
    );
  });
});
