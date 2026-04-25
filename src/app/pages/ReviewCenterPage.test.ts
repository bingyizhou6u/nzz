import { act, createElement } from "react";
import type { Root } from "react-dom/client";
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

    const dom = installMinimalDom();
    const { createRoot } = await import("react-dom/client");
    const container = dom.document.createElement("div");
    dom.document.body.appendChild(container);

    await act(async () => {
      root = createRoot(container as unknown as Element);
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

function buttonByText(container: TestElement, text: string): TestElement {
  const button = Array.from(container.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === text
  );

  if (!button) {
    throw new Error(`Button not found: ${text}`);
  }

  return button;
}

type TestEventListener = (event: TestDomEvent) => void;

class TestDomEvent {
  bubbles = true;
  cancelable = true;
  currentTarget: TestNode | null = null;
  defaultPrevented = false;
  eventPhase = 3;
  isTrusted = false;
  target: TestNode | null = null;
  timeStamp = Date.now();

  constructor(public type: string) {}

  preventDefault() {
    this.defaultPrevented = true;
  }

  stopPropagation() {}
}

class TestNode {
  childNodes: TestNode[] = [];
  nodeValue: string | null = null;
  ownerDocument: TestDocument;
  parentNode: TestNode | null = null;
  private listeners = new Map<string, Set<TestEventListener>>();

  constructor(public nodeType: number, ownerDocument?: TestDocument) {
    this.ownerDocument = ownerDocument ?? (this as unknown as TestDocument);
  }

  get firstChild(): TestNode | null {
    return this.childNodes[0] ?? null;
  }

  get lastChild(): TestNode | null {
    return this.childNodes[this.childNodes.length - 1] ?? null;
  }

  get nextSibling(): TestNode | null {
    const siblings = this.parentNode?.childNodes;
    if (!siblings) return null;
    return siblings[siblings.indexOf(this) + 1] ?? null;
  }

  get textContent(): string {
    if (this.nodeType === 3) return this.nodeValue ?? "";
    return this.childNodes.map((child) => child.textContent).join("");
  }

  set textContent(value: string) {
    this.childNodes = [];
    if (this.nodeType === 3) {
      this.nodeValue = value;
    } else if (value) {
      this.appendChild(this.ownerDocument.createTextNode(value));
    }
  }

  appendChild<T extends TestNode>(child: T): T {
    child.parentNode?.removeChild(child);
    child.parentNode = this;
    child.ownerDocument = this.ownerDocument;
    this.childNodes.push(child);
    return child;
  }

  insertBefore<T extends TestNode>(child: T, before: TestNode | null): T {
    if (!before) return this.appendChild(child);
    child.parentNode?.removeChild(child);
    const index = this.childNodes.indexOf(before);
    if (index < 0) return this.appendChild(child);
    child.parentNode = this;
    child.ownerDocument = this.ownerDocument;
    this.childNodes.splice(index, 0, child);
    return child;
  }

  removeChild<T extends TestNode>(child: T): T {
    const index = this.childNodes.indexOf(child);
    if (index >= 0) {
      this.childNodes.splice(index, 1);
      child.parentNode = null;
    }
    return child;
  }

  contains(node: TestNode | null): boolean {
    return Boolean(node && (node === this || this.childNodes.some((child) => child.contains(node))));
  }

  addEventListener(type: string, listener: TestEventListener) {
    const listeners = this.listeners.get(type) ?? new Set<TestEventListener>();
    listeners.add(listener);
    this.listeners.set(type, listeners);
  }

  removeEventListener(type: string, listener: TestEventListener) {
    this.listeners.get(type)?.delete(listener);
  }

  dispatchEvent(event: TestDomEvent): boolean {
    event.target ??= this;
    let current: TestNode | null = this;
    while (current) {
      event.currentTarget = current;
      current.listeners.get(event.type)?.forEach((listener) => listener(event));
      current = event.bubbles ? current.parentNode : null;
    }
    event.currentTarget = null;
    return !event.defaultPrevented;
  }
}

class TestText extends TestNode {
  constructor(text: string, ownerDocument: TestDocument) {
    super(3, ownerDocument);
    this.nodeValue = text;
  }
}

class TestElement extends TestNode {
  attributes = new Map<string, string>();
  namespaceURI = "http://www.w3.org/1999/xhtml";
  style: Record<string, string> = {};
  tagName: string;

  constructor(tagName: string, ownerDocument: TestDocument) {
    super(1, ownerDocument);
    this.tagName = tagName.toUpperCase();
  }

  get className(): string {
    return this.attributes.get("class") ?? "";
  }

  set className(value: string) {
    this.setAttribute("class", value);
  }

  get disabled(): boolean {
    return this.attributes.has("disabled");
  }

  set disabled(value: boolean) {
    if (value) {
      this.attributes.set("disabled", "");
    } else {
      this.attributes.delete("disabled");
    }
  }

  get localName(): string {
    return this.tagName.toLowerCase();
  }

  get nodeName(): string {
    return this.tagName;
  }

  click() {
    this.dispatchEvent(new TestDomEvent("click"));
  }

  setAttribute(name: string, value: string) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  removeAttribute(name: string) {
    this.attributes.delete(name);
  }

  querySelectorAll(tagName: string): TestElement[] {
    const matches: TestElement[] = [];
    const expectedTagName = tagName.toUpperCase();
    visitNodes(this, (node) => {
      if (node instanceof TestElement && node.tagName === expectedTagName) {
        matches.push(node);
      }
    });
    return matches;
  }
}

class TestDocument extends TestNode {
  activeElement: TestElement;
  body: TestElement;
  defaultView!: TestWindow;
  documentElement: TestElement;
  head: TestElement;
  readyState = "complete";

  constructor() {
    super(9);
    this.ownerDocument = this;
    this.documentElement = new TestElement("html", this);
    this.head = new TestElement("head", this);
    this.body = new TestElement("body", this);
    this.documentElement.appendChild(this.head);
    this.documentElement.appendChild(this.body);
    this.appendChild(this.documentElement);
    this.activeElement = this.body;
  }

  createElement(tagName: string): TestElement {
    return new TestElement(tagName, this);
  }

  createElementNS(_namespace: string, tagName: string): TestElement {
    return new TestElement(tagName, this);
  }

  createTextNode(text: string): TestText {
    return new TestText(text, this);
  }

  querySelector(): TestElement | null {
    return null;
  }
}

class TestWindow {
  document: TestDocument;
  Element = TestElement;
  HTMLElement = TestElement;
  HTMLButtonElement = TestElement;
  HTMLIFrameElement = class HTMLIFrameElement {};
  Node = TestNode;

  constructor(document: TestDocument) {
    this.document = document;
  }

  addEventListener() {}

  removeEventListener() {}
}

function installMinimalDom(): { document: TestDocument; window: TestWindow } {
  const document = new TestDocument();
  const window = new TestWindow(document);
  document.defaultView = window;

  vi.stubGlobal("document", document);
  vi.stubGlobal("window", window);
  vi.stubGlobal("Element", TestElement);
  vi.stubGlobal("HTMLElement", TestElement);
  vi.stubGlobal("HTMLButtonElement", TestElement);
  vi.stubGlobal("HTMLIFrameElement", window.HTMLIFrameElement);
  vi.stubGlobal("Node", TestNode);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);

  return { document, window };
}

function visitNodes(node: TestNode, visit: (node: TestNode) => void) {
  visit(node);
  for (const child of node.childNodes) {
    visitNodes(child, visit);
  }
}
