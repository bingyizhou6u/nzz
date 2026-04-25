// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Capability, PageKey, SessionState } from "../session/sessionTypes";
import { WorkspacePage } from "./WorkspacePage";

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

describe("WorkspacePage", () => {
  it("does not request documents or render task buttons without document view access", async () => {
    const fetchMock = vi.fn<FetchHandler>().mockResolvedValue(jsonResponse({ data: documents }));
    vi.stubGlobal("fetch", fetchMock);

    const { container } = await renderWorkspacePage(["session.view"]);

    await waitFor(() => {
      expect(container.textContent).toContain("无单据查看权限");
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(container.querySelectorAll(".task-row")).toHaveLength(0);
  });

  it("renders a dedicated error state without empty task copy or misleading zero metrics", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<FetchHandler>().mockResolvedValue(
        jsonResponse({ error: "文档服务不可用" }, { status: 500, statusText: "Internal Server Error" })
      )
    );

    const { container } = await renderWorkspacePage(["session.view", "documents.view"]);

    await waitFor(() => {
      expect(container.textContent).toContain("文档服务不可用");
    });

    expect(container.textContent).toContain("无法读取单据");
    expect(container.textContent).not.toContain("暂无待处理单据");
    expect(metricValues(container)).toEqual([]);
  });

  it("navigates pending tasks to documents without approve access and to review with approve access", async () => {
    vi.stubGlobal("fetch", vi.fn<FetchHandler>().mockResolvedValue(jsonResponse({ data: documents })));

    const reviewerless = await renderWorkspacePage(["session.view", "documents.view"]);

    await waitFor(() => {
      expect(reviewerless.container.textContent).toContain("待审核单据");
    });

    await act(async () => {
      buttonByText(reviewerless.container, "待审核单据D-001 / 2026-04-25待审核").click();
    });

    expect(reviewerless.navigations).toEqual(["documents"]);

    await unmountRoot();

    vi.stubGlobal("fetch", vi.fn<FetchHandler>().mockResolvedValue(jsonResponse({ data: documents })));

    const reviewer = await renderWorkspacePage(["session.view", "documents.view", "documents.approve"]);

    await waitFor(() => {
      expect(reviewer.container.textContent).toContain("待审核单据");
    });

    await act(async () => {
      buttonByText(reviewer.container, "待审核单据D-001 / 2026-04-25待审核").click();
    });

    expect(reviewer.navigations).toEqual(["review"]);
  });

  it("hides quick actions for inaccessible pages", async () => {
    vi.stubGlobal("fetch", vi.fn<FetchHandler>().mockResolvedValue(jsonResponse({ data: [] })));

    const { container } = await renderWorkspacePage(["session.view", "documents.create", "reports.view"]);

    await waitFor(() => {
      expect(container.textContent).toContain("无单据查看权限");
    });

    expect(buttonTexts(container)).toEqual(["报表中心"]);
    expect(container.textContent).not.toContain("单据中心");
    expect(container.textContent).not.toContain("审核中心");
    expect(container.textContent).not.toContain("基础资料");
  });
});

type FetchHandler = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const documents = [
  {
    id: "doc_1",
    document_no: "D-001",
    document_type: "project_income",
    business_date: "2026-04-25",
    status: "pending",
    summary: "待审核单据"
  }
];

async function renderWorkspacePage(capabilities: Capability[]) {
  const container = document.createElement("div");
  const navigations: PageKey[] = [];
  document.body.appendChild(container);

  await act(async () => {
    root = createRoot(container);
    root.render(
      createElement(WorkspacePage, {
        session: authenticatedSession(capabilities),
        onNavigate: (page: PageKey) => navigations.push(page)
      })
    );
  });

  return { container, navigations };
}

function authenticatedSession(capabilities: Capability[]): Extract<SessionState, { status: "authenticated" }> {
  return {
    status: "authenticated",
    person: {
      id: "person_1",
      name: "Finance User",
      alias: "fu",
      loginEmail: "finance@example.com",
      roles: ["finance_manager"]
    },
    capabilities
  };
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

async function unmountRoot() {
  if (!root) return;
  await act(async () => {
    root?.unmount();
  });
  root = null;
  document.body.innerHTML = "";
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === text
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${text}`);
  }

  return button;
}

function buttonTexts(container: HTMLElement) {
  return Array.from(container.querySelectorAll("button")).map((button) => button.textContent?.trim() ?? "");
}

function metricValues(container: HTMLElement) {
  return Array.from(container.querySelectorAll(".metric-tile strong")).map((element) => element.textContent?.trim());
}
