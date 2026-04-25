// @vitest-environment jsdom

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

const authenticatedMeResponse = {
  data: {
    person: {
      id: "person_finance",
      name: "Finance Manager",
      alias: "fm",
      loginEmail: "finance@example.com",
      roles: ["finance_manager"]
    },
    capabilities: ["session.view", "documents.view"]
  }
};

const noNavigationMeResponse = {
  data: {
    person: {
      id: "person_limited",
      name: "Limited User",
      alias: null,
      loginEmail: "limited@example.com",
      roles: ["readonly"]
    },
    capabilities: ["documents.create"]
  }
};

function pathnameForFetchInput(input: RequestInfo | URL): string {
  const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  return url.startsWith("http") ? new URL(url).pathname : url;
}

function jsonResponse(body: unknown, options: { ok?: boolean; status?: number; statusText?: string } = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    statusText: options.statusText ?? "OK",
    headers: new Headers({ "content-type": "application/json" }),
    json: async () => body,
    text: async () => JSON.stringify(body)
  };
}

function stubApiMe(response: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const data = pathnameForFetchInput(input) === "/api/me" ? response : { data: [] };
      return jsonResponse(data);
    })
  );
}

function stubApiMeFailure() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      if (pathnameForFetchInput(input) === "/api/me") {
        return jsonResponse({ error: "not bound" }, { ok: false, status: 403, statusText: "Forbidden" });
      }

      return jsonResponse({ data: [] });
    })
  );
}

async function waitFor(assertion: () => void) {
  const deadline = Date.now() + 1000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
      });
    }
  }

  throw lastError;
}

describe("App", () => {
  let root: Root;
  let host: HTMLDivElement;

  async function renderApp() {
    await act(async () => {
      root.render(<App />);
    });
  }

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    host = document.createElement("div");
    document.body.replaceChildren(host);
    stubApiMe(authenticatedMeResponse);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    vi.unstubAllGlobals();
    document.body.replaceChildren();
  });

  it("renders workspace content for the default authenticated navigation target", async () => {
    await renderApp();

    await waitFor(() => {
      expect(document.querySelector("main")?.textContent).toContain("工作台");
    });
  });

  it("renders the formal shell sidebar and top status for authenticated users", async () => {
    await renderApp();

    await waitFor(() => {
      expect(document.querySelector(".app-sidebar")?.textContent).toContain("工作台");
      expect(document.querySelector(".top-status-bar")?.textContent).toContain("Finance Manager");
    });
  });

  it("shows the unavailable identity state and no sidebar navigation when /api/me fails", async () => {
    stubApiMeFailure();

    await renderApp();

    await waitFor(() => {
      expect(document.querySelector("main")?.textContent).toContain("无法进入系统");
      expect(document.querySelector("main")?.textContent).toContain("当前登录邮箱未绑定启用人员");
      expect(document.querySelector(".top-status-bar")?.textContent).toContain("身份不可用");
      expect(document.querySelectorAll(".app-sidebar .sidebar-nav-button")).toHaveLength(0);
    });
  });

  it("shows the empty access state and no sidebar navigation when capabilities do not grant pages", async () => {
    stubApiMe(noNavigationMeResponse);

    await renderApp();

    await waitFor(() => {
      expect(document.querySelector("main")?.textContent).toContain("暂无可访问功能");
      expect(document.querySelectorAll(".app-sidebar .sidebar-nav-button")).toHaveLength(0);
    });
  });

  it("switches pages from the sidebar navigation", async () => {
    await renderApp();

    await waitFor(() => {
      expect(document.querySelector(".app-sidebar")?.textContent).toContain("业务单据");
    });

    await act(async () => {
      document.querySelector<HTMLButtonElement>(".app-sidebar button[data-page-key='documents']")?.click();
    });

    await waitFor(() => {
      expect(document.querySelector(".sidebar-nav-button.active")?.textContent).toContain("业务单据");
      expect(document.querySelector(".sidebar-nav-button.active")?.getAttribute("aria-current")).toBe("page");
      expect(document.querySelector(".page-header h1")?.textContent).toBe("业务单据");
      expect(document.querySelector("main")?.textContent).toContain("单据列表");
    });
  });
});
