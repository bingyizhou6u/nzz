// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MonthCloseReconciliationTabs } from "./MonthCloseReconciliationTabs";
import type { MonthCloseReconciliation } from "./monthCloseTypes";

const reconciliation: MonthCloseReconciliation = {
  funding: [
    {
      accountId: "acct_usdt",
      accountType: "usdt_wallet",
      currencyCode: "USDT",
      openingBalanceMinor: 10000,
      periodInflowMinor: 5000,
      periodOutflowMinor: 2000,
      closingBalanceMinor: 13000
    }
  ],
  pettyCash: [
    {
      personId: "person_ops",
      accountId: "acct_petty",
      currencyCode: "AED",
      openingBalanceMinor: 0,
      periodIssuedMinor: 200000,
      periodReimbursedMinor: 215000,
      closingBalanceMinor: -15000,
      pendingCostMinor: 15000
    }
  ],
  loans: [
    {
      borrowerPersonId: "person_borrower",
      currencyCode: "USDT",
      openingBalanceMinor: 0,
      periodLoanOutMinor: 120000,
      periodRepaymentMinor: 20000,
      periodWriteoffMinor: 0,
      closingBalanceMinor: 100000
    }
  ],
  projects: [
    {
      projectId: "project_alpha",
      currencyCode: "USDT",
      incomeAmountMinor: 500000,
      expenseAmountMinor: 0,
      matchedUsdtCostMinor: 0,
      pendingAmountMinor: 0
    }
  ]
};

describe("MonthCloseReconciliationTabs", () => {
  let root: Root;
  let host: HTMLDivElement;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.replaceChildren(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    document.body.replaceChildren();
  });

  it("renders only the active reconciliation tab table", async () => {
    await act(async () => {
      root.render(<MonthCloseReconciliationTabs reconciliation={reconciliation} isLoading={false} />);
    });

    expect(document.querySelector("[role='tablist']")?.textContent).toContain("资金对账");
    expect(document.querySelector("[role='tabpanel']")?.textContent).toContain("acct_usdt");
    expect(document.querySelector("[role='tabpanel']")?.textContent).not.toContain("person_ops");

    await act(async () => {
      document.querySelector<HTMLButtonElement>("button[data-reconciliation-tab='pettyCash']")?.click();
    });

    expect(document.querySelector("[role='tabpanel']")?.textContent).toContain("person_ops");
    expect(document.querySelector("[role='tabpanel']")?.textContent).not.toContain("acct_usdt");
  });

  it("marks reconciliation tables as keyboard-scrollable regions", async () => {
    await act(async () => {
      root.render(<MonthCloseReconciliationTabs reconciliation={reconciliation} isLoading={false} />);
    });

    const tableRegion = document.querySelector(".table-wrap");
    expect(tableRegion?.getAttribute("role")).toBe("region");
    expect(tableRegion?.getAttribute("aria-label")).toContain("月结对账");
    expect(tableRegion?.getAttribute("tabindex")).toBe("0");
    expect(document.querySelector(".table-scroll-hint")?.textContent).toContain("横向滚动");
  });
});
