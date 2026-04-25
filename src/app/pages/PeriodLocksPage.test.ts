// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PeriodLocksPage, canLockPeriod, canUnlockPeriod, periodLockLoadShouldApply } from "./PeriodLocksPage";
import { unlockPeriod } from "./period-locks/periodLockApi";
import type { PeriodLockRow } from "./period-locks/periodLockTypes";

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

describe("period lock permissions", () => {
  it("allows locking only with the period lock capability", () => {
    expect(canLockPeriod(["periodLocks.view", "periodLocks.lock"])).toBe(true);
    expect(canLockPeriod(["periodLocks.view", "periodLocks.unlock"])).toBe(false);
    expect(canLockPeriod([])).toBe(false);
  });

  it("allows unlocking only with the period unlock capability", () => {
    expect(canUnlockPeriod(["periodLocks.view", "periodLocks.unlock"])).toBe(true);
    expect(canUnlockPeriod(["periodLocks.view", "periodLocks.lock"])).toBe(false);
    expect(canUnlockPeriod([])).toBe(false);
  });
});

describe("period lock load guard", () => {
  it("does not apply async load results after the effect is stale", () => {
    const apply = vi.fn();

    periodLockLoadShouldApply(() => false, apply);

    expect(apply).not.toHaveBeenCalled();
  });
});

describe("PeriodLocksPage component", () => {
  it("does not report a state update after the initial load resolves post-unmount", async () => {
    let resolveFetch: (response: Response) => void = () => undefined;
    const fetchMock = vi.fn<FetchHandler>().mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        })
    );
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", fetchMock);

    const container = document.createElement("div");
    document.body.appendChild(container);

    await act(async () => {
      root = createRoot(container);
      root.render(createElement(PeriodLocksPage, { capabilities: ["periodLocks.lock", "periodLocks.unlock"] }));
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/period-locks", {
      headers: { Accept: "application/json" }
    });

    await act(async () => {
      root?.unmount();
      root = null;
    });

    await act(async () => {
      resolveFetch(jsonResponse({ data: [periodLock] }));
      await Promise.resolve();
    });

    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("period lock api", () => {
  it("sends unlock reason in the DELETE request body", async () => {
    const fetchMock = vi.fn<FetchHandler>().mockResolvedValue(
      jsonResponse({ data: { period: "2026-04", status: "unlocked" } })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(unlockPeriod("2026-04", "month reopened")).resolves.toEqual({
      period: "2026-04",
      status: "unlocked"
    });

    expect(fetchMock).toHaveBeenCalledWith("/api/period-locks/2026-04", {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ reason: "month reopened" })
    });
  });

  it("uses the error envelope message when unlock fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<FetchHandler>().mockResolvedValue(
        jsonResponse({ error: "reason is required" }, { status: 400, statusText: "Bad Request" })
      )
    );

    await expect(unlockPeriod("2026-04", "")).rejects.toThrow("reason is required");
  });
});

type FetchHandler = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const periodLock: PeriodLockRow = {
  period: "2026-04",
  locked_by: "user_1",
  locked_at: "2026-04-25T10:00:00Z",
  note: "closed"
};

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers
    }
  });
}
