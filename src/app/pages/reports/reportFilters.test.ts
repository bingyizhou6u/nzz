import { describe, expect, it } from "vitest";
import { buildReportQuery } from "./reportFilters";
import { reportGroupLabels } from "./reportGroups";

describe("buildReportQuery", () => {
  it("omits empty filters and encodes non-empty report filters", () => {
    expect(
      buildReportQuery({
        period: "2026-04",
        projectId: "proj 1",
        merchantId: "",
        personId: " person_1 ",
        currencyCode: " usdt ",
        staleDays: "45"
      })
    ).toBe("?period=2026-04&projectId=proj+1&personId=person_1&currencyCode=USDT&staleDays=45");
  });
});

describe("reportGroupLabels", () => {
  it("lists formal report center groups in display order", () => {
    expect(reportGroupLabels).toEqual(["资金", "项目经营", "费用", "备用金", "借款", "异常"]);
  });
});
