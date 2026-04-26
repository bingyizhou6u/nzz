// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ReviewCenterPage,
  canRenderReviewCenter,
  clearedReviewActionState,
  reviewActionRefreshFailureState
} from "./ReviewCenterPage";
import type { ApprovalPreviewState, ReviewDocumentRow } from "./review/reviewTypes";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

const pendingDocument: ReviewDocumentRow = {
  id: "doc_1",
  document_no: "DOC-001",
  document_type: "manual_adjustment",
  business_date: "2026-04-25",
  period: "2026-04",
  submitted_at: "2026-04-25T10:00:00Z",
  summary: "旧详情摘要",
  created_by: "user_1",
  operator_person_id: "person_1",
  project_id: "project_1",
  merchant_id: "merchant_1"
};

const secondPendingDocument: ReviewDocumentRow = {
  ...pendingDocument,
  id: "doc_2",
  document_no: "DOC-002",
  submitted_at: "2026-04-25T11:00:00Z",
  summary: "第二条待审摘要",
  operator_person_id: "person_2",
  project_id: "project_2",
  merchant_id: "merchant_2"
};

const approvalPreview: ApprovalPreviewState = {
  accountEntries: [{ accountId: "acct_stale", currencyCode: "AED", amountMinor: 1200 }],
  loanEntries: [],
  lotCreations: [],
  lotUpdates: [],
  lotMovements: [],
  pendingCostCreations: [],
  pendingCostUpdates: [],
  pendingCostApplications: [],
  loanItemCreations: [],
  loanItemUpdates: [],
  loanAllocations: []
};

const secondApprovalPreview: ApprovalPreviewState = {
  ...approvalPreview,
  accountEntries: [{ accountId: "acct_second", currencyCode: "USDT", amountMinor: 9000 }]
};

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

describe("review center page guard", () => {
  it("requires document approval capability", () => {
    expect(canRenderReviewCenter(["session.view", "documents.approve"])).toBe(true);
    expect(canRenderReviewCenter(["session.view", "documents.previewApproval"])).toBe(false);
    expect(canRenderReviewCenter([])).toBe(false);
  });
});

describe("review action state", () => {
  it("clears approvable document state before refreshing the queue", () => {
    expect(clearedReviewActionState("已通过审核")).toEqual({
      documents: [],
      selectedId: null,
      detail: null,
      preview: null,
      detailState: "idle",
      previewState: "idle",
      rejectReason: "",
      actionMessage: "已通过审核"
    });
  });

  it("keeps approval disabled when action succeeds but queue refresh fails", () => {
    expect(reviewActionRefreshFailureState("已通过审核", new Error("刷新失败"))).toEqual({
      documents: [],
      selectedId: null,
      detail: null,
      preview: null,
      detailState: "idle",
      previewState: "idle",
      rejectReason: "",
      actionMessage: "已通过审核",
      queueState: "error",
      error: "刷新失败"
    });
  });
});

describe("ReviewCenterPage component", () => {
  it("renders the formal review workspace layout", async () => {
    const fetchMock = vi.fn<FetchHandler>();
    const expectedRequests: ExpectedRequest[] = [
      {
        url: "/api/review/documents",
        method: "GET",
        response: jsonResponse({ data: [pendingDocument] })
      },
      {
        url: "/api/review/documents/doc_1",
        method: "GET",
        response: jsonResponse({ data: pendingDocument })
      },
      {
        url: "/api/review/documents/doc_1/preview",
        method: "GET",
        response: jsonResponse({ data: approvalPreview })
      }
    ];

    fetchMock.mockImplementation((input, init) => {
      const next = expectedRequests.shift();
      if (!next) throw new Error(`Unexpected request: ${String(input)}`);

      expect(String(input)).toBe(next.url);
      expect(init?.method ?? "GET").toBe(next.method);
      return Promise.resolve(next.response);
    });
    vi.stubGlobal("fetch", fetchMock);

    const container = document.createElement("div");
    document.body.appendChild(container);

    await act(async () => {
      root = createRoot(container);
      root.render(createElement(ReviewCenterPage, { capabilities: ["documents.approve"] }));
    });

    await waitFor(() => {
      expect(container.textContent).toContain("DOC-001");
      expect(container.textContent).toContain("acct_stale");
    });

    expect(container.querySelector(".review-workspace")).not.toBeNull();
    expect(container.querySelector(".record-list")).not.toBeNull();
    expect(container.querySelector(".detail-panel")).not.toBeNull();

    const queuePanel = container.querySelector(".review-queue-panel");
    expect(queuePanel?.textContent).toContain("审核队列");

    const detailPanel = container.querySelector(".review-detail-panel");
    expect(detailPanel?.textContent).toContain("审核详情");
    expect(detailPanel?.textContent).toContain("入账影响预览");
    expect(detailPanel?.textContent).toContain("审批动作");
    expect(expectedRequests).toHaveLength(0);
  });

  it("selects a queue item, reloads its preview, and clears the stale reject reason", async () => {
    const fetchMock = vi.fn<FetchHandler>();
    const expectedRequests: ExpectedRequest[] = [
      {
        url: "/api/review/documents",
        method: "GET",
        response: jsonResponse({ data: [pendingDocument, secondPendingDocument] })
      },
      {
        url: "/api/review/documents/doc_1",
        method: "GET",
        response: jsonResponse({ data: pendingDocument })
      },
      {
        url: "/api/review/documents/doc_1/preview",
        method: "GET",
        response: jsonResponse({ data: approvalPreview })
      },
      {
        url: "/api/review/documents/doc_2",
        method: "GET",
        response: jsonResponse({ data: secondPendingDocument })
      },
      {
        url: "/api/review/documents/doc_2/preview",
        method: "GET",
        response: jsonResponse({ data: secondApprovalPreview })
      }
    ];

    fetchMock.mockImplementation((input, init) => nextExpectedResponse(expectedRequests, input, init));
    vi.stubGlobal("fetch", fetchMock);

    const container = document.createElement("div");
    document.body.appendChild(container);

    await act(async () => {
      root = createRoot(container);
      root.render(createElement(ReviewCenterPage, { capabilities: ["documents.approve"] }));
    });

    await waitFor(() => {
      expect(container.textContent).toContain("DOC-001");
      expect(container.textContent).toContain("acct_stale");
    });

    const textarea = firstTextarea(container);
    await writeTextarea(textarea, "资料不完整");
    expect(textarea.value).toBe("资料不完整");

    await act(async () => {
      buttonContainingText(container, "DOC-002").click();
    });

    await waitFor(() => {
      expect(container.textContent).toContain("第二条待审摘要");
      expect(container.textContent).toContain("acct_second");
      expect(firstTextarea(container).value).toBe("");
    });

    expect(expectedRequests).toHaveLength(0);
  });

  it("keeps approval disabled while the impact preview is still loading", async () => {
    const fetchMock = vi.fn<FetchHandler>();
    const previewDeferred = deferred<Response>();
    const expectedRequests: ExpectedRequest[] = [
      {
        url: "/api/review/documents",
        method: "GET",
        response: jsonResponse({ data: [pendingDocument] })
      },
      {
        url: "/api/review/documents/doc_1",
        method: "GET",
        response: jsonResponse({ data: pendingDocument })
      },
      {
        url: "/api/review/documents/doc_1/preview",
        method: "GET",
        response: previewDeferred.promise
      }
    ];

    fetchMock.mockImplementation((input, init) => nextExpectedResponse(expectedRequests, input, init));
    vi.stubGlobal("fetch", fetchMock);

    const container = document.createElement("div");
    document.body.appendChild(container);

    await act(async () => {
      root = createRoot(container);
      root.render(createElement(ReviewCenterPage, { capabilities: ["documents.approve"] }));
    });

    await waitFor(() => {
      expect(container.textContent).toContain("计算中");
      expect(buttonByText(container, "通过").disabled).toBe(true);
    });

    await act(async () => {
      previewDeferred.resolve(jsonResponse({ data: approvalPreview }));
      await previewDeferred.promise;
    });

    await waitFor(() => {
      expect(container.textContent).toContain("acct_stale");
      expect(buttonByText(container, "通过").disabled).toBe(false);
    });
  });

  it("requires a reject reason before returning a document", async () => {
    const fetchMock = vi.fn<FetchHandler>();
    const expectedRequests: ExpectedRequest[] = [
      {
        url: "/api/review/documents",
        method: "GET",
        response: jsonResponse({ data: [pendingDocument] })
      },
      {
        url: "/api/review/documents/doc_1",
        method: "GET",
        response: jsonResponse({ data: pendingDocument })
      },
      {
        url: "/api/review/documents/doc_1/preview",
        method: "GET",
        response: jsonResponse({ data: approvalPreview })
      },
      {
        url: "/api/review/documents/doc_1/reject",
        method: "POST",
        body: { reason: "资料不完整" },
        response: jsonResponse({ data: { id: "doc_1", status: "rejected" } })
      },
      {
        url: "/api/review/documents",
        method: "GET",
        response: jsonResponse({ data: [] })
      }
    ];

    fetchMock.mockImplementation((input, init) => nextExpectedResponse(expectedRequests, input, init));
    vi.stubGlobal("fetch", fetchMock);

    const container = document.createElement("div");
    document.body.appendChild(container);

    await act(async () => {
      root = createRoot(container);
      root.render(createElement(ReviewCenterPage, { capabilities: ["documents.approve"] }));
    });

    await waitFor(() => {
      expect(container.textContent).toContain("DOC-001");
      expect(container.textContent).toContain("acct_stale");
      expect(buttonByText(container, "退回").disabled).toBe(true);
    });

    await writeTextarea(firstTextarea(container), "资料不完整");
    expect(buttonByText(container, "退回").disabled).toBe(false);

    await act(async () => {
      buttonByText(container, "退回").click();
    });

    await waitFor(() => {
      expect(container.textContent).toContain("已退回单据");
    });

    expect(expectedRequests).toHaveLength(0);
  });

  it("clears stale detail and preview when approving succeeds but queue refresh fails", async () => {
    const fetchMock = vi.fn<FetchHandler>();
    const expectedRequests: ExpectedRequest[] = [
      {
        url: "/api/review/documents",
        method: "GET",
        response: jsonResponse({ data: [pendingDocument] })
      },
      {
        url: "/api/review/documents/doc_1",
        method: "GET",
        response: jsonResponse({ data: pendingDocument })
      },
      {
        url: "/api/review/documents/doc_1/preview",
        method: "GET",
        response: jsonResponse({ data: approvalPreview })
      },
      {
        url: "/api/review/documents/doc_1/approve",
        method: "POST",
        response: jsonResponse({ data: { id: "doc_1", status: "approved" } })
      },
      {
        url: "/api/review/documents",
        method: "GET",
        response: jsonResponse({ error: "刷新待审队列失败" }, { status: 500, statusText: "Internal Server Error" })
      }
    ];

    fetchMock.mockImplementation((input, init) => nextExpectedResponse(expectedRequests, input, init));
    vi.stubGlobal("fetch", fetchMock);

    const container = document.createElement("div");
    document.body.appendChild(container);

    await act(async () => {
      root = createRoot(container);
      root.render(createElement(ReviewCenterPage, { capabilities: ["documents.approve"] }));
    });

    await waitFor(() => {
      expect(container.textContent).toContain("DOC-001");
      expect(container.textContent).toContain("acct_stale");
      expect(buttonByText(container, "通过").disabled).toBe(false);
    });

    await act(async () => {
      buttonByText(container, "通过").click();
    });

    await waitFor(() => {
      expect(container.textContent).toContain("刷新待审队列失败");
      expect(container.textContent).not.toContain("DOC-001");
      expect(container.textContent).not.toContain("acct_stale");
      expect(buttonByText(container, "通过").disabled).toBe(true);
    });

    expect(expectedRequests).toHaveLength(0);
  });
});

type FetchHandler = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface ExpectedRequest {
  url: string;
  method: "GET" | "POST";
  body?: unknown;
  response: Response | Promise<Response>;
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

function nextExpectedResponse(
  expectedRequests: ExpectedRequest[],
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const next = expectedRequests.shift();
  if (!next) throw new Error(`Unexpected request: ${String(input)}`);

  expect(String(input)).toBe(next.url);
  expect(init?.method ?? "GET").toBe(next.method);
  if ("body" in next) {
    expect(init?.body ? JSON.parse(String(init.body)) : undefined).toEqual(next.body);
  }
  return Promise.resolve(next.response);
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

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === text
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${text}`);
  }

  return button;
}

function buttonContainingText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find((candidate) =>
    candidate.textContent?.includes(text)
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found containing: ${text}`);
  }

  return button;
}

function firstTextarea(container: HTMLElement): HTMLTextAreaElement {
  const textarea = container.querySelector("textarea");
  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error("Textarea not found");
  }

  return textarea;
}

async function writeTextarea(textarea: HTMLTextAreaElement, value: string): Promise<void> {
  await act(async () => {
    textarea.value = value;
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, resolve, reject };
}
