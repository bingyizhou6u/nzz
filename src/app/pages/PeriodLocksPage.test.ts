import { afterEach, describe, expect, it, vi } from "vitest";
import { canLockPeriod, canUnlockPeriod } from "./PeriodLocksPage";
import { unlockPeriod } from "./period-locks/periodLockApi";

afterEach(() => {
  vi.unstubAllGlobals();
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

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers
    }
  });
}
