// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MonthClosePage } from "./MonthClosePage";
import type { MonthCloseCheckResult, MonthCloseOverview, MonthClosePeriod } from "./month-close/monthCloseTypes";

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

describe("MonthClosePage", () => {
  it("locks a lockable period from the workflow entry", async () => {
    const fetchMock = monthCloseFetch();
    vi.stubGlobal("fetch", fetchMock);

    const container = await renderMonthClosePage(["periodLocks.view", "periodLocks.lock", "periodLocks.unlock"]);

    await waitFor(() => {
      expect(container.querySelector('ol[aria-label="月结流程"]')).not.toBeNull();
      expect(container.textContent).toContain("锁账快照");
      expect(buttonByText(container, "确认锁账").disabled).toBe(true);
    });

    await writeTextarea(textareaByLabel(container, "锁账说明"), "对账完成，确认锁账");

    expect(buttonByText(container, "确认锁账").disabled).toBe(false);

    await act(async () => {
      buttonByText(container, "确认锁账").click();
    });

    await waitFor(() => {
      expect(container.textContent).toContain("已锁账并生成快照 v1");
      expect(container.textContent).toContain("解锁原因");
    });

    const lockCall = fetchMock.mock.calls.find(([input, init]) => {
      return pathnameForFetchInput(input) === "/api/month-close/2026-04/lock" && init?.method === "POST";
    });

    expect(lockCall?.[1]?.body).toBe(JSON.stringify({ note: "对账完成，确认锁账" }));
  });

  it("shows checks as a selectable exception queue with a detail workspace", async () => {
    vi.stubGlobal(
      "fetch",
      monthCloseFetch({
        lockable: false,
        checks: [
          checkResult(),
          checkResult({ id: "check_2", message: "备用金为负数", check_type: "negative_petty_cash" })
        ]
      })
    );

    const container = await renderMonthClosePage(["periodLocks.view", "periodLocks.lock"]);

    await waitFor(() => {
      expect(container.querySelector(".month-close-check-workspace")).not.toBeNull();
      expect(container.textContent).toContain("待审核单据");
      expect(container.textContent).toContain("备用金负数");
    });

    await act(async () => {
      buttonContainingText(container, "备用金负数").click();
    });

    expect(container.querySelector(".detail-panel")?.textContent).toContain("备用金为负数");
  });
});

async function renderMonthClosePage(capabilities: string[]): Promise<HTMLDivElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);

  await act(async () => {
    root = createRoot(container);
    root.render(createElement(MonthClosePage, { capabilities }));
  });

  return container;
}

function monthCloseFetch(options: { lockable?: boolean; checks?: MonthCloseCheckResult[] } = {}) {
  let locked = false;
  const lockable = options.lockable ?? true;
  const checks = options.checks ?? [];

  return vi.fn<FetchHandler>(async (input, init) => {
    const path = pathnameForFetchInput(input);

    if (path === "/api/month-close/periods") {
      return jsonResponse({ data: [periodRow({ can_lock: lockable && !locked ? 1 : 0, locked_at: locked ? lockedAt : null })] });
    }

    if (path === "/api/month-close/2026-04") {
      return jsonResponse({
        data: overview({
          periodLock: locked ? { period: "2026-04", locked_by: "manager_1", locked_at: lockedAt, note: "locked" } : null,
          checks,
          snapshots: locked
            ? [
                {
                  id: "snapshot_1",
                  period: "2026-04",
                  version: 1,
                  run_id: "run_1",
                  locked_by: "manager_1",
                  locked_at: lockedAt,
                  note: "locked",
                  summary_json: "{}"
                }
              ]
            : []
        })
      });
    }

    if (path === "/api/month-close/2026-04/reconciliation") {
      return jsonResponse({ data: { funding: [], pettyCash: [], loans: [], projects: [] } });
    }

    if (path === "/api/master-data/people") {
      return jsonResponse({ data: [] });
    }

    if (path === "/api/month-close/2026-04/lock" && init?.method === "POST") {
      locked = true;
      return jsonResponse({
        data: {
          period: "2026-04",
          status: "locked",
          snapshot: {
            id: "snapshot_1",
            period: "2026-04",
            version: 1,
            run_id: "run_1",
            locked_by: "manager_1",
            locked_at: lockedAt,
            note: "locked",
            summary_json: "{}"
          }
        }
      });
    }

    throw new Error(`Unexpected request: ${path}`);
  });
}

type FetchHandler = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const lockedAt = "2026-04-30T12:00:00.000Z";

function periodRow(overrides: Partial<MonthClosePeriod> = {}): MonthClosePeriod {
  return {
    period: "2026-04",
    latest_run_id: "run_1",
    latest_run_status: "completed",
    can_lock: 1,
    critical_count: 0,
    warning_count: 0,
    info_count: 0,
    locked_at: null,
    locked_by: null,
    snapshot_count: 0,
    latest_snapshot_version: null,
    ...overrides
  };
}

function overview(overrides: Partial<MonthCloseOverview> = {}): MonthCloseOverview {
  return {
    period: "2026-04",
    latestRun: {
      id: "run_1",
      period: "2026-04",
      status: "completed",
      can_lock: 1,
      critical_count: 0,
      warning_count: 0,
      info_count: 0,
      started_by: "manager_1",
      started_at: "2026-04-30T10:00:00.000Z",
      finished_at: "2026-04-30T10:05:00.000Z",
      error_message: null
    },
    periodLock: null,
    checks: [],
    snapshots: [],
    ...overrides
  };
}

function checkResult(overrides: Partial<MonthCloseCheckResult> = {}): MonthCloseCheckResult {
  return {
    id: "check_1",
    run_id: "run_1",
    period: "2026-04",
    check_type: "pending_document",
    severity: "critical",
    entity_type: "document",
    entity_id: "doc_pending",
    business_date: null,
    currency_code: null,
    amount_minor: null,
    usdt_cost_minor: null,
    message: "期间内存在待审核单据",
    suggested_action: "审核或退回该单据后再继续月结",
    status: "open",
    assignee_person_id: null,
    resolved_by: null,
    resolved_at: null,
    resolution_note: null,
    created_at: "2026-04-30T10:00:00.000Z",
    ...overrides
  };
}

function pathnameForFetchInput(input: RequestInfo | URL): string {
  const url = typeof input === "string" ? input : input instanceof URL ? input.pathname : input.url;
  return url.startsWith("http") ? new URL(url).pathname : url;
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

  for (let attempt = 0; attempt < 30; attempt += 1) {
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
    (candidate) => candidate.textContent?.replace(/\s+/g, " ").trim() === text
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

function textareaByLabel(container: HTMLElement, label: string): HTMLTextAreaElement {
  const labels = Array.from(container.querySelectorAll("label"));
  const labelElement = labels.find((candidate) => candidate.textContent?.replace(/\s+/g, " ").trim().startsWith(label));
  const textarea = labelElement?.querySelector("textarea");

  if (!(textarea instanceof HTMLTextAreaElement)) {
    throw new Error(`Textarea not found: ${label}`);
  }

  return textarea;
}

async function writeTextarea(textarea: HTMLTextAreaElement, value: string): Promise<void> {
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    valueSetter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    textarea.dispatchEvent(new Event("change", { bubbles: true }));
  });
}
