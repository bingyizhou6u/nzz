import { describe, expect, it } from "vitest";
import { buildReportQuery } from "./reportFilters";

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
