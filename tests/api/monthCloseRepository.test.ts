import { describe, expect, it } from "vitest";
import { MonthCloseRepository } from "../../src/repositories/monthCloseRepository";

interface SqliteStatement {
  all(...values: unknown[]): Record<string, unknown>[];
  get(...values: unknown[]): Record<string, unknown> | undefined;
  run(...values: unknown[]): { changes: number };
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

type SqliteModule = {
  DatabaseSync: new (filename: string) => SqliteDatabase;
};

type FsModule = {
  readFileSync(path: URL, encoding: "utf8"): string;
};

const importSqlite = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<SqliteModule>;
const importFs = new Function("specifier", "return import(specifier)") as (specifier: string) => Promise<FsModule>;

async function createSqliteMonthCloseDb(): Promise<{ db: D1Database; close: () => void }> {
  const [{ DatabaseSync }, { readFileSync }] = await Promise.all([importSqlite("node:sqlite"), importFs("node:fs")]);
  const sqlite = new DatabaseSync(":memory:");
  const migration = readFileSync(new URL("../../migrations/0008_month_close_center.sql", import.meta.url), "utf8");

  sqlite.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE people (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL
    );

    INSERT INTO people (id, name) VALUES
      ('person_finance', 'Finance'),
      ('person_manager', 'Manager');
  `);
  sqlite.exec(migration);

  return {
    db: {
      prepare: (sql: string) => {
        let bindings: unknown[] = [];
        return {
          bind(...values: unknown[]) {
            bindings = values;
            return this;
          },
          all: async () => ({ success: true, results: sqlite.prepare(sql).all(...bindings) }),
          first: async () => sqlite.prepare(sql).get(...bindings) ?? null,
          run: async () => {
            const result = sqlite.prepare(sql).run(...bindings);
            return { success: true, meta: { changes: result.changes } } as unknown as D1Result;
          }
        } as unknown as D1PreparedStatement;
      },
      batch: async (statements: D1PreparedStatement[]) => {
        const results: D1Result[] = [];
        for (const statement of statements) {
          results.push(await statement.run());
        }
        return results;
      }
    } as unknown as D1Database,
    close: () => sqlite.close()
  };
}

describe("MonthCloseRepository", () => {
  it("creates and completes check runs", async () => {
    const sqliteDb = await createSqliteMonthCloseDb();
    try {
      const repo = new MonthCloseRepository(sqliteDb.db);

      const run = await repo.createRun({
        period: "2026-04",
        startedBy: "person_finance",
        startedAt: "2026-04-30T10:00:00.000Z"
      });

      expect(run).toMatchObject({
        period: "2026-04",
        status: "running",
        can_lock: 0,
        critical_count: 0,
        warning_count: 0,
        info_count: 0,
        started_by: "person_finance",
        started_at: "2026-04-30T10:00:00.000Z",
        finished_at: null,
        error_message: null
      });

      await repo.completeRun({
        runId: run.id,
        canLock: true,
        criticalCount: 0,
        warningCount: 1,
        infoCount: 2,
        finishedAt: "2026-04-30T10:05:00.000Z"
      });

      await expect(repo.latestRun("2026-04")).resolves.toMatchObject({
        id: run.id,
        status: "completed",
        can_lock: 1,
        critical_count: 0,
        warning_count: 1,
        info_count: 2,
        finished_at: "2026-04-30T10:05:00.000Z"
      });
    } finally {
      sqliteDb.close();
    }
  });

  it("persists check results and updates handling state", async () => {
    const sqliteDb = await createSqliteMonthCloseDb();
    try {
      const repo = new MonthCloseRepository(sqliteDb.db);
      const run = await repo.createRun({
        period: "2026-04",
        startedBy: "person_finance",
        startedAt: "2026-04-30T10:00:00.000Z"
      });

      await repo.insertCheckResults(run.id, "2026-04", [
        {
          checkType: "pending_document",
          severity: "critical",
          entityType: "document",
          entityId: "doc_pending",
          businessDate: "2026-04-28",
          currencyCode: null,
          amountMinor: null,
          usdtCostMinor: null,
          message: "Pending document blocks month close",
          suggestedAction: "Approve or reject the document",
          createdAt: "2026-04-30T10:01:00.000Z"
        },
        {
          checkType: "pending_cost",
          severity: "warning",
          entityType: "pending_cost_match",
          entityId: "pending_1",
          businessDate: "2026-04-20",
          currencyCode: "AED",
          amountMinor: 12000,
          usdtCostMinor: null,
          message: "Pending cost has unmatched USDT cost",
          suggestedAction: "Match funding lots or acknowledge for close",
          createdAt: "2026-04-30T10:01:00.000Z"
        }
      ]);

      const results = await repo.listCheckResults("2026-04");
      expect(results).toHaveLength(2);
      expect(results.map((result) => result.severity)).toEqual(["critical", "warning"]);
      expect(results[0]).toMatchObject({
        run_id: run.id,
        check_type: "pending_document",
        status: "open"
      });

      const updated = await repo.updateCheckResult(results[1].id, {
        status: "acknowledged",
        assigneePersonId: "person_manager",
        resolvedBy: "person_finance",
        resolvedAt: "2026-04-30T10:10:00.000Z",
        resolutionNote: "Will match after funding arrives"
      });

      expect(updated).toMatchObject({
        id: results[1].id,
        status: "acknowledged",
        assignee_person_id: "person_manager",
        resolved_by: "person_finance",
        resolved_at: "2026-04-30T10:10:00.000Z",
        resolution_note: "Will match after funding arrives"
      });
    } finally {
      sqliteDb.close();
    }
  });

  it("creates snapshot headers and report snapshot rows", async () => {
    const sqliteDb = await createSqliteMonthCloseDb();
    try {
      const repo = new MonthCloseRepository(sqliteDb.db);
      const run = await repo.createRun({
        period: "2026-04",
        startedBy: "person_finance",
        startedAt: "2026-04-30T10:00:00.000Z"
      });

      await expect(repo.nextSnapshotVersion("2026-04")).resolves.toBe(1);

      const snapshot = await repo.createSnapshotWithReports({
        period: "2026-04",
        version: 1,
        runId: run.id,
        lockedBy: "person_manager",
        lockedAt: "2026-04-30T11:00:00.000Z",
        note: "April close",
        summary: { criticalCount: 0, warningCount: 0, infoCount: 1 },
        reports: [
          {
            reportKey: "monthCloseChecks",
            rows: [{ check_type: "draft_document", severity: "info" }]
          },
          {
            reportKey: "projectProfitLoss",
            rows: [{ project_id: "proj_1", net_usdt_minor: 5000 }]
          }
        ],
        createdAt: "2026-04-30T11:00:01.000Z"
      });

      expect(snapshot).toMatchObject({
        period: "2026-04",
        version: 1,
        run_id: run.id,
        locked_by: "person_manager",
        locked_at: "2026-04-30T11:00:00.000Z",
        note: "April close",
        summary_json: JSON.stringify({ criticalCount: 0, warningCount: 0, infoCount: 1 })
      });
      await expect(repo.nextSnapshotVersion("2026-04")).resolves.toBe(2);

      const snapshots = await repo.listSnapshots("2026-04");
      expect(snapshots).toHaveLength(1);
      expect(snapshots[0].id).toBe(snapshot.id);

      const report = await repo.getReportSnapshot(snapshot.id, "projectProfitLoss");
      expect(report).toMatchObject({
        snapshot_id: snapshot.id,
        report_key: "projectProfitLoss",
        row_count: 1,
        data_json: JSON.stringify([{ project_id: "proj_1", net_usdt_minor: 5000 }])
      });
    } finally {
      sqliteDb.close();
    }
  });
});
