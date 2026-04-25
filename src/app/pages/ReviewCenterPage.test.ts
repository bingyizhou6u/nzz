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

    const queuePanel = container.querySelector(".review-queue-panel");
    expect(queuePanel?.textContent).toContain("审核队列");

    const detailPanel = container.querySelector(".review-detail-panel");
    expect(detailPanel?.textContent).toContain("审核详情");
    expect(detailPanel?.textContent).toContain("影响预览");
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
  response: Response;
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

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === text
  );

  if (!(button instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${text}`);
  }

  return button;
}
