import { all, run } from "./db";

export interface PeriodLockRow {
  period: string;
  locked_by: string;
  locked_at: string;
  note: string | null;
}

export class PeriodLockRepository {
  constructor(private readonly db: D1Database) {}

  list(): Promise<PeriodLockRow[]> {
    return all<PeriodLockRow>(
      this.db.prepare("SELECT period, locked_by, locked_at, note FROM period_locks ORDER BY period DESC")
    );
  }

  async lock(input: { period: string; lockedBy: string; note: string | null }) {
    await run(
      this.db
        .prepare("INSERT INTO period_locks (period, locked_by, locked_at, note) VALUES (?, ?, ?, ?)")
        .bind(input.period, input.lockedBy, new Date().toISOString(), input.note)
    );
  }

  async unlock(period: string) {
    await run(this.db.prepare("DELETE FROM period_locks WHERE period = ?").bind(period));
  }
}
