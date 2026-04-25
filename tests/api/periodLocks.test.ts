import { describe, expect, it } from "vitest";
import { createPeriodLock, deletePeriodLock, listPeriodLocks } from "../../src/api/periodLocks";
import { route } from "../../src/worker/router";
import type { Env } from "../../src/worker/env";

function env(
  options: { rows?: unknown[]; runResult?: D1Result; firstRow?: unknown; onBind?: (values: unknown[]) => void } = {}
): Env {
  return {
    AUTH_MODE: "development",
    DEV_ACTOR_EMAIL: "admin@example.test",
    DB: {
      prepare: () =>
        ({
          bind(...values: unknown[]) {
            options.onBind?.(values);
            return this;
          },
          all: async () => ({ success: true, results: options.rows ?? [] }),
          first: async () => options.firstRow ?? null,
          run: async () => options.runResult ?? ({ success: true } as D1Result)
        }) as unknown as D1PreparedStatement
    } as unknown as D1Database,
    ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher
  };
}

const admin = {
  personId: "admin_1",
  name: "Admin",
  alias: null,
  email: "admin@example.test",
  roles: ["admin" as const]
};
const manager = {
  personId: "manager_1",
  name: "Manager",
  alias: null,
  email: "manager@example.test",
  roles: ["finance_manager" as const]
};
const readonly = {
  personId: "reader_1",
  name: "Reader",
  alias: null,
  email: "reader@example.test",
  roles: ["readonly" as const]
};

describe("period lock API", () => {
  it("lists period locks for authorized users", async () => {
    const response = await listPeriodLocks({
      request: new Request("https://ledger.test/api/period-locks"),
      env: env({
        rows: [{ period: "2026-04", locked_by: "admin_1", locked_at: "2026-04-25T00:00:00.000Z", note: "closed" }]
      }),
      params: {},
      actor: manager
    });
    expect(response.status).toBe(200);
  });

  it("locks periods for finance managers", async () => {
    const response = await createPeriodLock({
      request: new Request("https://ledger.test/api/period-locks", {
        method: "POST",
        body: JSON.stringify({ period: "2026-04", note: "month close" })
      }),
      env: env(),
      params: {},
      actor: manager
    });
    expect(response.status).toBe(201);
  });

  it("requires admin for unlock", async () => {
    const response = await deletePeriodLock({
      request: new Request("https://ledger.test/api/period-locks/2026-04", {
        method: "DELETE",
        body: JSON.stringify({ reason: "reopen for correction" })
      }),
      env: env(),
      params: { period: "2026-04" },
      actor: manager
    });
    expect(response.status).toBe(403);
  });

  it("requires reason when unlocking", async () => {
    const response = await deletePeriodLock({
      request: new Request("https://ledger.test/api/period-locks/2026-04", { method: "DELETE", body: JSON.stringify({}) }),
      env: env(),
      params: { period: "2026-04" },
      actor: admin
    });
    expect(response.status).toBe(400);
  });

  it("rejects readonly lock attempts", async () => {
    const response = await createPeriodLock({
      request: new Request("https://ledger.test/api/period-locks", {
        method: "POST",
        body: JSON.stringify({ period: "2026-04" })
      }),
      env: env(),
      params: {},
      actor: readonly
    });
    expect(response.status).toBe(403);
  });

  it("rejects invalid periods", async () => {
    const response = await createPeriodLock({
      request: new Request("https://ledger.test/api/period-locks", {
        method: "POST",
        body: JSON.stringify({ period: "2026-13" })
      }),
      env: env(),
      params: {},
      actor: manager
    });

    expect(response.status).toBe(400);
  });

  it("records audit metadata when locking", async () => {
    const bindings: unknown[][] = [];
    const response = await createPeriodLock({
      request: new Request("https://ledger.test/api/period-locks", {
        method: "POST",
        body: JSON.stringify({ period: "2026-04", note: "  close  " })
      }),
      env: env({ onBind: (values) => bindings.push(values) }),
      params: {},
      actor: manager
    });

    expect(response.status).toBe(201);
    expect(bindings[0]).toEqual(["2026-04", "manager_1", expect.any(String), "close"]);
    expect(bindings[1]).toEqual([
      expect.stringMatching(/^audit_/),
      "manager_1",
      "period_lock.create",
      "period_lock",
      "2026-04",
      null,
      JSON.stringify({ period: "2026-04", lockedBy: "manager_1", note: "close" }),
      null,
      "manager_1",
      "manager@example.test",
      null,
      null,
      null,
      expect.any(String)
    ]);
  });

  it("routes period lock listing", async () => {
    const response = await route(
      new Request("https://ledger.test/api/period-locks"),
      env({
        firstRow: {
          id: "manager_1",
          name: "Manager",
          alias: null,
          login_email: "admin@example.test",
          roles_json: "[\"finance_manager\"]",
          is_enabled: 1
        }
      })
    );

    expect(response.status).toBe(200);
  });

  it("denies readonly lock attempts at the router capability gate", async () => {
    const response = await route(
      new Request("https://ledger.test/api/period-locks", {
        method: "POST",
        body: JSON.stringify({ period: "2026-04" })
      }),
      env({
        firstRow: {
          id: "reader_1",
          name: "Reader",
          alias: null,
          login_email: "admin@example.test",
          roles_json: "[\"readonly\"]",
          is_enabled: 1
        }
      })
    );

    expect(response.status).toBe(403);
  });
});
