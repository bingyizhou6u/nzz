// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppShell } from "./AppShell";
import type { NavigationItem, PageKey, SessionState } from "../session/sessionTypes";

const session: SessionState = {
  status: "authenticated",
  person: {
    id: "person_finance",
    name: "Finance Manager",
    alias: "fm",
    loginEmail: "finance@example.com",
    roles: ["finance_manager"]
  },
  capabilities: ["session.view", "documents.view", "masterData.view", "periodLocks.view"]
};

const pages: NavigationItem[] = [
  { key: "workspace", label: "工作台", capability: "session.view" },
  { key: "documents", label: "业务单据", capability: "documents.view" },
  { key: "master-data", label: "基础资料", capability: "masterData.view" },
  { key: "month-close", label: "对账月结", capability: "periodLocks.view" }
];

describe("AppShell", () => {
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
    vi.restoreAllMocks();
    document.body.replaceChildren();
  });

  function renderShell(activePage: PageKey) {
    act(() => {
      root.render(
        <AppShell session={session} pages={pages} activePage={activePage} onPageChange={vi.fn()}>
          <div>业务内容</div>
        </AppShell>
      );
    });
  }

  it.each([
    ["documents", "单据中心", "创建、提交、查看和跟踪业务单据。"],
    ["master-data", "基础资料治理", "维护人员、项目、商户、账户、币种和管理科目。"],
    ["month-close", "对账月结", "运行月结检查，处理异常项，并确认期间进入锁账前状态。"]
  ] satisfies Array<[PageKey, string, string]>)("renders formal page header metadata for %s", (activePage, title, description) => {
    renderShell(activePage);

    expect(document.querySelector(".page-header h1")?.textContent).toBe(title);
    expect(document.querySelector(".page-header p")?.textContent).toBe(description);
  });

  it("keeps sidebar labels independent from formal page header titles", () => {
    renderShell("documents");

    expect(document.querySelector(".page-header h1")?.textContent).toBe("单据中心");
    expect(document.querySelector(".sidebar-nav-button.active")?.textContent).toContain("业务单据");
  });
});
