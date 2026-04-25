import { all, first } from "./db";

export interface PeriodLockRow {
  period: string;
  locked_by: string;
  locked_at: string;
  note: string | null;
}

export class PeriodLockNotFoundError extends Error {
  constructor() {
    super("Period lock not found");
  }
}

export class PeriodLockRepository {
  constructor(private readonly db: D1Database) {}

  list(): Promise<PeriodLockRow[]> {
    return all<PeriodLockRow>(
      this.db.prepare("SELECT period, locked_by, locked_at, note FROM period_locks ORDER BY period DESC")
    );
  }

  get(period: string): Promise<PeriodLockRow | null> {
    return first<PeriodLockRow>(
      this.db.prepare("SELECT period, locked_by, locked_at, note FROM period_locks WHERE period = ?").bind(period)
    );
  }

  async lockWithAudit(input: { period: string; lockedBy: string; note: string | null }, auditStatement: D1PreparedStatement) {
    const lockStatement = this.db
      .prepare("INSERT INTO period_locks (period, locked_by, locked_at, note) VALUES (?, ?, ?, ?)")
      .bind(input.period, input.lockedBy, new Date().toISOString(), input.note);

    await this.runBatch([lockStatement, auditStatement]);
  }

  async unlockWithAudit(period: string, auditStatement: D1PreparedStatement) {
    const deleteStatement = this.db.prepare("DELETE FROM period_locks WHERE period = ?").bind(period);
    const results = await this.runBatch([auditStatement, deleteStatement]);

    if (results[0]?.meta?.changes === 0 || results[1]?.meta?.changes === 0) {
      throw new PeriodLockNotFoundError();
    }
  }

  private async runBatch(statements: D1PreparedStatement[]): Promise<D1Result[]> {
    const results = await this.db.batch(statements);
    for (const result of results) {
      if (!result.success) {
        throw new Error(result.error || "D1 batch failed");
      }
    }
    return results;
  }
}
