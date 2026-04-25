import { describe, expect, it } from "vitest";
import { createPeriodLock, deletePeriodLock, listPeriodLocks } from "../../src/api/periodLocks";
import { route } from "../../src/worker/router";
import type { Env } from "../../src/worker/env";

type CapturedStatement = D1PreparedStatement & {
  sql: string;
  bindings: unknown[];
};

function env(
  options: {
    rows?: unknown[];
    runResult?: D1Result;
    batchResults?: D1Result[];
    firstRow?: unknown;
    firstRows?: unknown[];
    onBind?: (values: unknown[], sql: string) => void;
    onBatch?: (statements: CapturedStatement[]) => void;
  } = {}
): Env {
  const firstRows = [...(options.firstRows ?? [])];
  return {
    AUTH_MODE: "development",
    DEV_ACTOR_EMAIL: "admin@example.test",
    DB: {
      prepare: (sql: string) => {
        const statement = {
          sql,
          bindings: [],
          bind(this: CapturedStatement, ...values: unknown[]) {
            this.bindings = values;
            options.onBind?.(values, sql);
            return this;
          },
          all: async () => ({ success: true, results: options.rows ?? [] }),
          first: async () => (firstRows.length > 0 ? firstRows.shift() : options.firstRow ?? null),
          run: async () => options.runResult ?? ({ success: true } as D1Result)
        } as unknown as CapturedStatement;
        return statement;
      },
      batch: async (statements: D1PreparedStatement[]) => {
        options.onBatch?.(statements as CapturedStatement[]);
        return options.batchResults ?? statements.map(() => ({ success: true, meta: { changes: 1 } }) as unknown as D1Result);
      }
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

function actorRow(role: "admin" | "finance_manager" | "readonly") {
  return {
    id: `${role}_1`,
    name: role,
    alias: null,
    login_email: "admin@example.test",
    roles_json: JSON.stringify([role]),
    is_enabled: 1
  };
}

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

  it("locks periods and writes audit in one batch", async () => {
    const batches: CapturedStatement[][] = [];
    const response = await createPeriodLock({
      request: new Request("https://ledger.test/api/period-locks", {
        method: "POST",
        body: JSON.stringify({ period: "2026-04", note: "month close" })
      }),
      env: env({ onBatch: (statements) => batches.push(statements) }),
      params: {},
      actor: manager
    });

    expect(response.status).toBe(201);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    expect(batches[0][0].sql.replace(/\s+/g, " ").toLowerCase()).toContain("insert into period_locks");
    expect(batches[0][1].sql.replace(/\s+/g, " ").toLowerCase()).toContain("insert into audit_logs");
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

  it("unlocks periods for admins", async () => {
    const response = await deletePeriodLock({
      request: new Request("https://ledger.test/api/period-locks/2026-04", {
        method: "DELETE",
        body: JSON.stringify({ reason: "reopen for correction" })
      }),
      env: env({
        firstRow: {
          period: "2026-04",
          locked_by: "manager_1",
          locked_at: "2026-04-25T00:00:00.000Z",
          note: "closed"
        }
      }),
      params: { period: "2026-04" },
      actor: admin
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { period: "2026-04", status: "unlocked" } });
  });

  it("returns 404 without writing when unlocking a period that is not locked", async () => {
    const batches: CapturedStatement[][] = [];
    const response = await deletePeriodLock({
      request: new Request("https://ledger.test/api/period-locks/2026-04", {
        method: "DELETE",
        body: JSON.stringify({ reason: "reopen for correction" })
      }),
      env: env({ firstRow: null, onBatch: (statements) => batches.push(statements) }),
      params: { period: "2026-04" },
      actor: admin
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Period lock not found" });
    expect(batches).toHaveLength(0);
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

  it("rejects malformed period formats", async () => {
    const response = await createPeriodLock({
      request: new Request("https://ledger.test/api/period-locks", {
        method: "POST",
        body: JSON.stringify({ period: "202604" })
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
    expect(bindings).toContainEqual(["2026-04", "manager_1", expect.any(String), "close"]);
    expect(bindings).toContainEqual([
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

  it("rejects lock batch failures without a separate audit write", async () => {
    const batches: CapturedStatement[][] = [];
    const response = await createPeriodLock({
      request: new Request("https://ledger.test/api/period-locks", {
        method: "POST",
        body: JSON.stringify({ period: "2026-04", note: "month close" })
      }),
      env: env({
        batchResults: [
          { success: true, meta: { changes: 1 } } as unknown as D1Result,
          { success: false, error: "audit insert failed" } as unknown as D1Result
        ],
        onBatch: (statements) => batches.push(statements)
      }),
      params: {},
      actor: manager
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "audit insert failed" });
    expect(batches).toHaveLength(1);
    expect(batches[0][0].sql.replace(/\s+/g, " ").toLowerCase()).toContain("insert into period_locks");
    expect(batches[0][1].sql.replace(/\s+/g, " ").toLowerCase()).toContain("insert into audit_logs");
  });

  it("rejects duplicate lock insert changes without a separate audit write", async () => {
    const batches: CapturedStatement[][] = [];
    const response = await createPeriodLock({
      request: new Request("https://ledger.test/api/period-locks", {
        method: "POST",
        body: JSON.stringify({ period: "2026-04", note: "month close" })
      }),
      env: env({
        batchResults: [
          { success: true, meta: { changes: 0 } } as unknown as D1Result,
          { success: true, meta: { changes: 0 } } as unknown as D1Result
        ],
        onBatch: (statements) => batches.push(statements)
      }),
      params: {},
      actor: manager
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Period lock was not created" });
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    expect(batches[0][0].sql.replace(/\s+/g, " ").toLowerCase()).toContain("insert into period_locks");
    expect(batches[0][1].sql.replace(/\s+/g, " ").toLowerCase()).toContain("insert into audit_logs");
  });

  it("rejects duplicate lock batch failures without a separate audit write", async () => {
    const batches: CapturedStatement[][] = [];
    const response = await createPeriodLock({
      request: new Request("https://ledger.test/api/period-locks", {
        method: "POST",
        body: JSON.stringify({ period: "2026-04", note: "month close" })
      }),
      env: env({
        batchResults: [
          { success: false, error: "UNIQUE constraint failed: period_locks.period" } as unknown as D1Result,
          { success: true, meta: { changes: 0 } } as unknown as D1Result
        ],
        onBatch: (statements) => batches.push(statements)
      }),
      params: {},
      actor: manager
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "UNIQUE constraint failed: period_locks.period" });
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    expect(batches[0][0].sql.replace(/\s+/g, " ").toLowerCase()).toContain("insert into period_locks");
    expect(batches[0][1].sql.replace(/\s+/g, " ").toLowerCase()).toContain("insert into audit_logs");
  });

  it("records delete audit metadata after unlocking", async () => {
    const calls: { sql: string; values: unknown[] }[] = [];
    const response = await deletePeriodLock({
      request: new Request("https://ledger.test/api/period-locks/2026-04", {
        method: "DELETE",
        body: JSON.stringify({ reason: "reopen for correction" })
      }),
      env: env({
        firstRow: {
          period: "2026-04",
          locked_by: "manager_1",
          locked_at: "2026-04-25T00:00:00.000Z",
          note: "closed"
        },
        onBind: (values, sql) => calls.push({ sql, values })
      }),
      params: { period: "2026-04" },
      actor: admin
    });

    expect(response.status).toBe(200);
    const deleteCall = calls.find((call) =>
      call.sql
        .replace(/\s+/g, " ")
        .toLowerCase()
        .includes("delete from period_locks where period = ? and locked_by = ? and locked_at = ?")
    );
    const auditCall = calls.find((call) => call.sql.replace(/\s+/g, " ").toLowerCase().includes("insert into audit_logs"));
    expect(deleteCall?.values).toEqual(["2026-04", "manager_1", "2026-04-25T00:00:00.000Z"]);
    expect(auditCall?.sql.replace(/\s+/g, " ").toLowerCase()).toContain(
      "where exists (select 1 from period_locks where period = ? and locked_by = ? and locked_at = ?)"
    );
    expect(auditCall?.values).toEqual([
      expect.stringMatching(/^audit_/),
      "admin_1",
      "period_lock.delete",
      "period_lock",
      "2026-04",
      JSON.stringify({
        period: "2026-04",
        locked_by: "manager_1",
        locked_at: "2026-04-25T00:00:00.000Z",
        note: "closed"
      }),
      null,
      "reopen for correction",
      "admin_1",
      "admin@example.test",
      null,
      null,
      null,
      expect.any(String),
      "2026-04",
      "manager_1",
      "2026-04-25T00:00:00.000Z"
    ]);
  });

  it("rejects unlock when a stale-read lock identity no longer matches", async () => {
    const batches: CapturedStatement[][] = [];
    const response = await deletePeriodLock({
      request: new Request("https://ledger.test/api/period-locks/2026-04", {
        method: "DELETE",
        body: JSON.stringify({ reason: "reopen for correction" })
      }),
      env: env({
        firstRow: {
          period: "2026-04",
          locked_by: "manager_1",
          locked_at: "2026-04-25T00:00:00.000Z",
          note: "closed"
        },
        batchResults: [
          { success: true, meta: { changes: 0 } } as unknown as D1Result,
          { success: true, meta: { changes: 0 } } as unknown as D1Result
        ],
        onBatch: (statements) => batches.push(statements)
      }),
      params: { period: "2026-04" },
      actor: admin
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Period lock not found" });
    expect(batches).toHaveLength(1);
    expect(batches[0]).toHaveLength(2);
    expect(batches[0][0].sql.replace(/\s+/g, " ").toLowerCase()).toContain(
      "where exists (select 1 from period_locks where period = ? and locked_by = ? and locked_at = ?)"
    );
    expect(batches[0][0].bindings.slice(-3)).toEqual(["2026-04", "manager_1", "2026-04-25T00:00:00.000Z"]);
    expect(batches[0][1].sql.replace(/\s+/g, " ").toLowerCase()).toContain(
      "delete from period_locks where period = ? and locked_by = ? and locked_at = ?"
    );
    expect(batches[0][1].bindings).toEqual(["2026-04", "manager_1", "2026-04-25T00:00:00.000Z"]);
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

  it("routes period unlock for admins", async () => {
    const response = await route(
      new Request("https://ledger.test/api/period-locks/2026-04", {
        method: "DELETE",
        body: JSON.stringify({ reason: "reopen for correction" })
      }),
      env({
        firstRows: [
          actorRow("admin"),
          {
            period: "2026-04",
            locked_by: "manager_1",
            locked_at: "2026-04-25T00:00:00.000Z",
            note: "closed"
          }
        ]
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { period: "2026-04", status: "unlocked" } });
  });

  it("denies period unlock at the router capability gate for managers", async () => {
    const response = await route(
      new Request("https://ledger.test/api/period-locks/2026-04", {
        method: "DELETE",
        body: JSON.stringify({ reason: "reopen for correction" })
      }),
      env({ firstRow: actorRow("finance_manager") })
    );

    expect(response.status).toBe(403);
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
