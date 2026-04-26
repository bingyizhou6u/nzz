import { describe, expect, it } from "vitest";
import {
  getMonthCloseReportSnapshot,
  getMonthCloseOverview,
  getMonthCloseReconciliation,
  listMonthCloseChecks,
  listMonthClosePeriods,
  listMonthCloseSnapshots,
  lockMonthClosePeriod,
  runMonthCloseChecks,
  unlockMonthClosePeriod,
  updateMonthCloseCheckResult
} from "../../src/api/monthClose";
import type { AuthenticatedActor } from "../../src/auth/types";
import type { MonthCloseCheckResultRow, MonthCloseRunRow } from "../../src/repositories/monthCloseRepository";
import type { Env } from "../../src/worker/env";
import { route } from "../../src/worker/router";

type CapturedStatement = D1PreparedStatement & {
  sql: string;
  bindings: unknown[];
};

interface EnvOptions {
  rows?: unknown[];
  rowsBySql?: (sql: string, bindings: unknown[]) => unknown[];
  firstRow?: unknown;
  firstRows?: unknown[];
  runResult?: D1Result;
  batchResults?: D1Result[];
  onPrepare?: (sql: string) => void;
  onBind?: (values: unknown[], sql: string) => void;
  onBatch?: (statements: CapturedStatement[]) => void;
}

const admin: AuthenticatedActor = {
  personId: "admin_1",
  name: "Admin",
  alias: null,
  email: "admin@example.test",
  roles: ["admin"]
};

const manager: AuthenticatedActor = {
  personId: "manager_1",
  name: "Manager",
  alias: null,
  email: "manager@example.test",
  roles: ["finance_manager"]
};

const readonly: AuthenticatedActor = {
  personId: "reader_1",
  name: "Reader",
  alias: null,
  email: "reader@example.test",
  roles: ["readonly"]
};

describe("month close API", () => {
  it("lists month close periods for authorized users", async () => {
    const response = await listMonthClosePeriods({
      request: new Request("https://ledger.test/api/month-close/periods"),
      env: env({
        rows: [
          {
            period: "2026-04",
            latest_run_id: "run_1",
            latest_run_status: "completed",
            can_lock: 0,
            critical_count: 1,
            warning_count: 0,
            info_count: 0,
            locked_at: null,
            locked_by: null,
            snapshot_count: 0,
            latest_snapshot_version: null
          }
        ]
      }),
      params: {},
      actor: manager
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [expect.objectContaining({ period: "2026-04", latest_run_status: "completed" })]
    });
  });

  it("returns a period overview with latest run, checks, snapshots, and lock state", async () => {
    const response = await getMonthCloseOverview({
      request: new Request("https://ledger.test/api/month-close/2026-04"),
      env: env({
        firstRows: [runRow(), periodLockRow()],
        rowsBySql: (sql) => {
          if (sql.includes("from month_close_check_results")) return [checkResultRow()];
          if (sql.includes("from month_close_snapshots")) return [{ id: "snapshot_1", period: "2026-04", version: 1 }];
          return [];
        }
      }),
      params: { period: "2026-04" },
      actor: manager
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        period: "2026-04",
        latestRun: { id: "run_1" },
        periodLock: { period: "2026-04" },
        checks: [expect.objectContaining({ id: "check_1" })],
        snapshots: [expect.objectContaining({ id: "snapshot_1" })]
      }
    });
  });

  it("lists month close snapshots for an authorized period viewer", async () => {
    const response = await listMonthCloseSnapshots({
      request: new Request("https://ledger.test/api/month-close/2026-04/snapshots"),
      env: env({
        rows: [
          snapshotRow({ id: "snapshot_2", version: 2, locked_at: "2026-05-01T12:00:00.000Z" }),
          snapshotRow({ id: "snapshot_1", version: 1 })
        ]
      }),
      params: { period: "2026-04" },
      actor: manager
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: [
        expect.objectContaining({ id: "snapshot_2", period: "2026-04", version: 2 }),
        expect.objectContaining({ id: "snapshot_1", period: "2026-04", version: 1 })
      ]
    });
  });

  it("routes month close snapshot lists through the period viewer gate", async () => {
    const preparedSql: string[] = [];
    const response = await route(
      new Request("https://ledger.test/api/month-close/2026-04/snapshots"),
      env({
        firstRow: actorRow("readonly"),
        onPrepare: (sql) => preparedSql.push(sql)
      })
    );

    expect(response.status).toBe(403);
    expect(preparedSql.some((sql) => sql.toLowerCase().includes("month_close_snapshots"))).toBe(false);
  });

  it("returns parsed rows for a month close report snapshot", async () => {
    const response = await getMonthCloseReportSnapshot({
      request: new Request("https://ledger.test/api/month-close/snapshots/snapshot_1/reports/projectIncome"),
      env: env({
        firstRows: [
          snapshotRow(),
          reportSnapshotRow({
            report_key: "projectIncome",
            row_count: 1,
            data_json: JSON.stringify([{ period: "2026-04", project_id: "project_alpha", income_usdt_minor: 50000 }])
          })
        ]
      }),
      params: { id: "snapshot_1", reportKey: "projectIncome" },
      actor: readonly
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        snapshot: expect.objectContaining({ id: "snapshot_1", version: 1 }),
        report: expect.objectContaining({
          report_key: "projectIncome",
          row_count: 1,
          rows: [expect.objectContaining({ project_id: "project_alpha", income_usdt_minor: 50000 })]
        })
      }
    });
  });

  it("returns 404 when a report snapshot is missing", async () => {
    const response = await getMonthCloseReportSnapshot({
      request: new Request("https://ledger.test/api/month-close/snapshots/snapshot_1/reports/projectIncome"),
      env: env({ firstRows: [snapshotRow(), null] }),
      params: { id: "snapshot_1", reportKey: "projectIncome" },
      actor: readonly
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Month close report snapshot not found" });
  });

  it("runs checks for finance managers and persists generated results", async () => {
    const batches: CapturedStatement[][] = [];
    const response = await runMonthCloseChecks({
      request: new Request("https://ledger.test/api/month-close/2026-04/checks/run", { method: "POST" }),
      env: env({
        rowsBySql: monthCloseSourceRows,
        onBatch: (statements) => batches.push(statements)
      }),
      params: { period: "2026-04" },
      actor: manager
    });

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json).toMatchObject({
      data: {
        period: "2026-04",
        summary: { criticalCount: 1, warningCount: 0, infoCount: 0 },
        canLock: false
      }
    });
    expect(batches).toHaveLength(1);
    expect(batches[0][0].sql.replace(/\s+/g, " ").toLowerCase()).toContain(
      "insert into month_close_check_results"
    );
  });

  it("rejects invalid periods before running month close queries", async () => {
    const preparedSql: string[] = [];
    const response = await runMonthCloseChecks({
      request: new Request("https://ledger.test/api/month-close/2026-13/checks/run", { method: "POST" }),
      env: env({ onPrepare: (sql) => preparedSql.push(sql) }),
      params: { period: "2026-13" },
      actor: manager
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "period month must be 01-12" });
    expect(preparedSql).toHaveLength(0);
  });

  it("does not let readonly users run checks", async () => {
    const batches: CapturedStatement[][] = [];
    const response = await runMonthCloseChecks({
      request: new Request("https://ledger.test/api/month-close/2026-04/checks/run", { method: "POST" }),
      env: env({ onBatch: (statements) => batches.push(statements) }),
      params: { period: "2026-04" },
      actor: readonly
    });

    expect(response.status).toBe(403);
    expect(batches).toHaveLength(0);
  });

  it("routes run-check requests through the capability gate", async () => {
    const batches: CapturedStatement[][] = [];
    const response = await route(
      new Request("https://ledger.test/api/month-close/2026-04/checks/run", { method: "POST" }),
      env({
        firstRow: actorRow("readonly"),
        onBatch: (statements) => batches.push(statements)
      })
    );

    expect(response.status).toBe(403);
    expect(batches).toHaveLength(0);
  });

  it("returns latest check results for a period", async () => {
    const response = await listMonthCloseChecks({
      request: new Request("https://ledger.test/api/month-close/2026-04/checks"),
      env: env({
        firstRow: runRow(),
        rows: [checkResultRow()]
      }),
      params: { period: "2026-04" },
      actor: manager
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: { run: { id: "run_1" }, checks: [expect.objectContaining({ id: "check_1" })] }
    });
  });

  it("returns month close reconciliation tabs for authorized users", async () => {
    const response = await getMonthCloseReconciliation({
      request: new Request("https://ledger.test/api/month-close/2026-04/reconciliation"),
      env: env({
        rowsBySql: (sql) => {
          if (sql.includes("funding_reconciliation_rows")) {
            return [{ accountId: "acct_usdt", currencyCode: "USDT", closingBalanceMinor: 20000 }];
          }
          if (sql.includes("petty_cash_reconciliation_rows")) {
            return [{ personId: "person_ops", currencyCode: "AED", pendingCostMinor: 15000 }];
          }
          if (sql.includes("loan_reconciliation_rows")) {
            return [{ borrowerPersonId: "person_borrower", currencyCode: "USDT", closingBalanceMinor: 100000 }];
          }
          if (sql.includes("project_reconciliation_rows")) {
            return [{ projectId: "project_alpha", currencyCode: "USDT", incomeAmountMinor: 500000 }];
          }
          return [];
        }
      }),
      params: { period: "2026-04" },
      actor: manager
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        funding: [expect.objectContaining({ accountId: "acct_usdt", currencyCode: "USDT" })],
        pettyCash: [expect.objectContaining({ personId: "person_ops", currencyCode: "AED" })],
        loans: [expect.objectContaining({ borrowerPersonId: "person_borrower", currencyCode: "USDT" })],
        projects: [expect.objectContaining({ projectId: "project_alpha", currencyCode: "USDT" })]
      }
    });
  });

  it("routes reconciliation requests through the period lock viewer gate", async () => {
    const preparedSql: string[] = [];
    const response = await route(
      new Request("https://ledger.test/api/month-close/2026-04/reconciliation"),
      env({
        firstRow: actorRow("readonly"),
        onPrepare: (sql) => preparedSql.push(sql)
      })
    );

    expect(response.status).toBe(403);
    expect(preparedSql.some((sql) => sql.toLowerCase().includes("reconciliation_rows"))).toBe(false);
  });

  it("locks month close periods and writes period lock, snapshots, report snapshots, and audit in one batch", async () => {
    const batches: CapturedStatement[][] = [];
    const response = await lockMonthClosePeriod({
      request: new Request("https://ledger.test/api/month-close/2026-04/lock", {
        method: "POST",
        body: JSON.stringify({ note: "  close April after review  " })
      }),
      env: env({
        firstRows: [
          runRow({ can_lock: 1, critical_count: 1, warning_count: 1, info_count: 0 }),
          null,
          { version: 1 }
        ],
        rowsBySql: (sql) => {
          if (sql.includes("from month_close_check_results")) {
            return [
              checkResultRow({ severity: "critical", status: "resolved" }),
              checkResultRow({ id: "check_warning", severity: "warning", status: "waived" })
            ];
          }
          if (
            sql.includes("from account_entries ae") &&
            sql.includes("d.document_type = 'project_income'") &&
            sql.includes("d.category_id as category_id")
          ) {
            return [{ period: "2026-04", project_id: "project_alpha", income_usdt_minor: 50000 }];
          }
          return [];
        },
        onBatch: (statements) => batches.push(statements)
      }),
      params: { period: "2026-04" },
      actor: manager
    });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      data: {
        period: "2026-04",
        status: "locked",
        snapshot: { period: "2026-04", version: 1, run_id: "run_1", note: "close April after review" }
      }
    });
    expect(batches).toHaveLength(1);

    const sqls = batches[0].map((statement) => statement.sql.replace(/\s+/g, " ").toLowerCase());
    expect(sqls.some((sql) => sql.includes("insert into period_locks"))).toBe(true);
    expect(sqls.some((sql) => sql.includes("insert into month_close_snapshots"))).toBe(true);
    expect(sqls.filter((sql) => sql.includes("insert into month_close_report_snapshots"))).toHaveLength(16);
    expect(sqls.some((sql) => sql.includes("insert into audit_logs"))).toBe(true);

    const projectIncomeSnapshot = batches[0].find(
      (statement) =>
        statement.sql.toLowerCase().includes("insert into month_close_report_snapshots") &&
        statement.bindings.includes("projectIncome")
    );
    expect(projectIncomeSnapshot?.bindings.at(-2)).toContain("project_alpha");
  });

  it("requires a lock note before month close period lock queries run", async () => {
    const preparedSql: string[] = [];
    const response = await lockMonthClosePeriod({
      request: new Request("https://ledger.test/api/month-close/2026-04/lock", {
        method: "POST",
        body: JSON.stringify({})
      }),
      env: env({ onPrepare: (sql) => preparedSql.push(sql) }),
      params: { period: "2026-04" },
      actor: manager
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "note is required" });
    expect(preparedSql).toHaveLength(0);
  });

  it("routes month close lock requests through the lock capability gate", async () => {
    const batches: CapturedStatement[][] = [];
    const response = await route(
      new Request("https://ledger.test/api/month-close/2026-04/lock", {
        method: "POST",
        body: JSON.stringify({ note: "close" })
      }),
      env({
        firstRow: actorRow("readonly"),
        onBatch: (statements) => batches.push(statements)
      })
    );

    expect(response.status).toBe(403);
    expect(batches).toHaveLength(0);
  });

  it("unlocks month close periods through the unlock capability and preserves snapshot history", async () => {
    const batches: CapturedStatement[][] = [];
    const response = await unlockMonthClosePeriod({
      request: new Request("https://ledger.test/api/month-close/2026-04/unlock", {
        method: "POST",
        body: JSON.stringify({ reason: "reopen for correction document" })
      }),
      env: env({
        firstRow: periodLockRow(),
        onBatch: (statements) => batches.push(statements)
      }),
      params: { period: "2026-04" },
      actor: admin
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { period: "2026-04", status: "unlocked" } });
    expect(batches).toHaveLength(1);

    const sqls = batches[0].map((statement) => statement.sql.replace(/\s+/g, " ").toLowerCase());
    expect(sqls.some((sql) => sql.includes("insert into audit_logs"))).toBe(true);
    expect(sqls.some((sql) => sql.includes("delete from period_locks where period = ?"))).toBe(true);
    expect(sqls.some((sql) => sql.includes("delete from month_close_snapshots"))).toBe(false);
  });

  it("requires a handling note when acknowledging or waiving a check result", async () => {
    const response = await updateMonthCloseCheckResult({
      request: new Request("https://ledger.test/api/month-close/check-results/check_1", {
        method: "PATCH",
        body: JSON.stringify({ status: "acknowledged" })
      }),
      env: env(),
      params: { id: "check_1" },
      actor: manager
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "resolutionNote is required for acknowledged or waived checks" });
  });

  it("updates check results and records audit metadata", async () => {
    const calls: { sql: string; values: unknown[] }[] = [];
    const response = await updateMonthCloseCheckResult({
      request: new Request("https://ledger.test/api/month-close/check-results/check_1", {
        method: "PATCH",
        body: JSON.stringify({
          status: "waived",
          assigneePersonId: "manager_1",
          resolutionNote: "Known timing issue; keep visible for next month."
        })
      }),
      env: env({
        firstRows: [
          checkResultRow({ severity: "warning", check_type: "negative_petty_cash", entity_type: "petty_cash_account" }),
          checkResultRow({
            severity: "warning",
            check_type: "negative_petty_cash",
            entity_type: "petty_cash_account",
            status: "waived",
            resolution_note: "Known timing issue; keep visible for next month."
          })
        ],
        onBind: (values, sql) => calls.push({ sql, values })
      }),
      params: { id: "check_1" },
      actor: manager
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      data: expect.objectContaining({ id: "check_1", status: "waived" })
    });
    expect(calls.some((call) => call.sql.toLowerCase().includes("update month_close_check_results"))).toBe(true);
    const auditCall = calls.find((call) => call.sql.toLowerCase().includes("insert into audit_logs"));
    expect(auditCall?.values).toContain("month_close.check_result.update");
    expect(auditCall?.values).toContain("month_close_check_result");
    expect(auditCall?.values).toContain("check_1");
    expect(auditCall?.values).toContain("manager@example.test");
  });

  it("does not expose raw SQL details from unexpected month close errors", async () => {
    const response = await getMonthCloseOverview({
      request: new Request("https://ledger.test/api/month-close/2026-04"),
      env: env({
        firstRow: null,
        rowsBySql: () => {
          throw new Error("D1_ERROR: near SELECT * FROM month_close_runs");
        }
      }),
      params: { period: "2026-04" },
      actor: manager
    });

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Month close request failed" });
  });
});

function env(options: EnvOptions = {}): Env {
  const firstRows = [...(options.firstRows ?? [])];
  return {
    AUTH_MODE: "development",
    ALLOW_INSECURE_DEV_AUTH: "true",
    DEV_ACTOR_EMAIL: "admin@example.test",
    DB: {
      prepare: (sql: string) => {
        options.onPrepare?.(sql);
        const statement = {
          sql,
          bindings: [],
          bind(this: CapturedStatement, ...values: unknown[]) {
            this.bindings = values;
            options.onBind?.(values, sql);
            return this;
          },
          all: async function (this: CapturedStatement) {
            return {
              success: true,
              results: options.rowsBySql?.(normalizedSql(sql), this.bindings) ?? options.rows ?? []
            };
          },
          first: async function () {
            if (firstRows.length > 0) return firstRows.shift();
            return options.firstRow ?? null;
          },
          run: async () => options.runResult ?? ({ success: true, meta: { changes: 1 } } as unknown as D1Result)
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

function monthCloseSourceRows(sql: string): unknown[] {
  if (sql.includes("from documents d") && sql.includes("d.status in ('draft', 'pending', 'rejected')")) {
    return [
      {
        id: "doc_pending",
        status: "pending",
        period: "2026-04",
        businessDate: "2026-04-26",
        createdAt: "2026-04-26T00:00:00.000Z",
        submittedAt: "2026-04-26T01:00:00.000Z"
      }
    ];
  }
  return [];
}

function normalizedSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

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

function runRow(overrides: Partial<MonthCloseRunRow> = {}): MonthCloseRunRow {
  return {
    id: "run_1",
    period: "2026-04",
    status: "completed",
    can_lock: 0,
    critical_count: 1,
    warning_count: 0,
    info_count: 0,
    started_by: "manager_1",
    started_at: "2026-04-30T10:00:00.000Z",
    finished_at: "2026-04-30T10:05:00.000Z",
    error_message: null,
    ...overrides
  };
}

function checkResultRow(overrides: Partial<MonthCloseCheckResultRow> = {}): MonthCloseCheckResultRow {
  return {
    id: "check_1",
    run_id: "run_1",
    period: "2026-04",
    check_type: "pending_document",
    severity: "critical",
    entity_type: "document",
    entity_id: "doc_pending",
    business_date: "2026-04-26",
    currency_code: null,
    amount_minor: null,
    usdt_cost_minor: null,
    message: "期间内存在待审核单据，不能月结锁账",
    suggested_action: "审核或退回该单据后再继续月结",
    status: "open",
    assignee_person_id: null,
    resolved_by: null,
    resolved_at: null,
    resolution_note: null,
    created_at: "2026-04-30T10:01:00.000Z",
    ...overrides
  };
}

function periodLockRow() {
  return {
    period: "2026-04",
    locked_by: "manager_1",
    locked_at: "2026-04-30T11:00:00.000Z",
    note: "closed"
  };
}

function snapshotRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "snapshot_1",
    period: "2026-04",
    version: 1,
    run_id: "run_1",
    locked_by: "manager_1",
    locked_at: "2026-04-30T11:00:00.000Z",
    note: "closed",
    summary_json: JSON.stringify({ criticalCount: 0, warningCount: 0, infoCount: 0 }),
    ...overrides
  };
}

function reportSnapshotRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "report_snapshot_1",
    snapshot_id: "snapshot_1",
    report_key: "projectIncome",
    row_count: 0,
    data_json: "[]",
    created_at: "2026-04-30T11:00:00.000Z",
    ...overrides
  };
}
