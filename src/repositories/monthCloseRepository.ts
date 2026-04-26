import { all, first, newId, nowIso, run } from "./db";

export type MonthCloseRunStatus = "running" | "completed" | "failed";
export type MonthCloseSeverity = "critical" | "warning" | "info";
export type MonthCloseCheckResultStatus = "open" | "assigned" | "acknowledged" | "resolved" | "waived";

export interface MonthCloseRunRow {
  id: string;
  period: string;
  status: MonthCloseRunStatus;
  can_lock: number;
  critical_count: number;
  warning_count: number;
  info_count: number;
  started_by: string;
  started_at: string;
  finished_at: string | null;
  error_message: string | null;
}

export interface MonthCloseCheckResultRow {
  id: string;
  run_id: string;
  period: string;
  check_type: string;
  severity: MonthCloseSeverity;
  entity_type: string;
  entity_id: string;
  business_date: string | null;
  currency_code: string | null;
  amount_minor: number | null;
  usdt_cost_minor: number | null;
  message: string;
  suggested_action: string;
  status: MonthCloseCheckResultStatus;
  assignee_person_id: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
}

export interface MonthCloseSnapshotRow {
  id: string;
  period: string;
  version: number;
  run_id: string;
  locked_by: string;
  locked_at: string;
  note: string;
  summary_json: string;
}

export interface MonthCloseReportSnapshotRow {
  id: string;
  snapshot_id: string;
  report_key: string;
  row_count: number;
  data_json: string;
  created_at: string;
}

export interface MonthClosePeriodRow {
  period: string;
  latest_run_id: string | null;
  latest_run_status: MonthCloseRunStatus | null;
  can_lock: number;
  critical_count: number;
  warning_count: number;
  info_count: number;
  locked_at: string | null;
  locked_by: string | null;
  snapshot_count: number;
  latest_snapshot_version: number | null;
}

export interface CreateRunInput {
  period: string;
  startedBy: string;
  startedAt?: string;
}

export interface CompleteRunInput {
  runId: string;
  canLock: boolean;
  criticalCount: number;
  warningCount: number;
  infoCount: number;
  finishedAt?: string;
}

export interface FailRunInput {
  runId: string;
  errorMessage: string;
  finishedAt?: string;
}

export interface InsertCheckResultInput {
  checkType: string;
  severity: MonthCloseSeverity;
  entityType: string;
  entityId: string;
  businessDate: string | null;
  currencyCode: string | null;
  amountMinor: number | null;
  usdtCostMinor: number | null;
  message: string;
  suggestedAction: string;
  createdAt?: string;
}

export interface UpdateCheckResultInput {
  status?: MonthCloseCheckResultStatus;
  assigneePersonId?: string | null;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  resolutionNote?: string | null;
}

export interface CreateSnapshotReportInput {
  reportKey: string;
  rows: object[];
}

export interface CreateSnapshotInput {
  period: string;
  version: number;
  runId: string;
  lockedBy: string;
  lockedAt?: string;
  note: string;
  summary: object;
  reports: CreateSnapshotReportInput[];
  createdAt?: string;
}

export class MonthCloseRepository {
  constructor(private readonly db: D1Database) {}

  async createRun(input: CreateRunInput): Promise<MonthCloseRunRow> {
    const row: MonthCloseRunRow = {
      id: newId("month_close_run"),
      period: input.period,
      status: "running",
      can_lock: 0,
      critical_count: 0,
      warning_count: 0,
      info_count: 0,
      started_by: input.startedBy,
      started_at: input.startedAt ?? nowIso(),
      finished_at: null,
      error_message: null
    };

    await run(
      this.db
        .prepare(`
          INSERT INTO month_close_runs (
            id, period, status, can_lock, critical_count, warning_count, info_count,
            started_by, started_at, finished_at, error_message
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          row.id,
          row.period,
          row.status,
          row.can_lock,
          row.critical_count,
          row.warning_count,
          row.info_count,
          row.started_by,
          row.started_at,
          row.finished_at,
          row.error_message
        )
    );

    return row;
  }

  async completeRun(input: CompleteRunInput): Promise<void> {
    await run(
      this.db
        .prepare(`
          UPDATE month_close_runs
          SET status = 'completed',
            can_lock = ?,
            critical_count = ?,
            warning_count = ?,
            info_count = ?,
            finished_at = ?,
            error_message = NULL
          WHERE id = ?
        `)
        .bind(
          input.canLock ? 1 : 0,
          input.criticalCount,
          input.warningCount,
          input.infoCount,
          input.finishedAt ?? nowIso(),
          input.runId
        )
    );
  }

  async failRun(input: FailRunInput): Promise<void> {
    await run(
      this.db
        .prepare(`
          UPDATE month_close_runs
          SET status = 'failed',
            can_lock = 0,
            finished_at = ?,
            error_message = ?
          WHERE id = ?
        `)
        .bind(input.finishedAt ?? nowIso(), input.errorMessage, input.runId)
    );
  }

  latestRun(period: string): Promise<MonthCloseRunRow | null> {
    return first<MonthCloseRunRow>(
      this.db
        .prepare(`
          SELECT
            id, period, status, can_lock, critical_count, warning_count, info_count,
            started_by, started_at, finished_at, error_message
          FROM month_close_runs
          WHERE period = ?
          ORDER BY started_at DESC, id DESC
          LIMIT 1
        `)
        .bind(period)
    );
  }

  listRuns(period: string): Promise<MonthCloseRunRow[]> {
    return all<MonthCloseRunRow>(
      this.db
        .prepare(`
          SELECT
            id, period, status, can_lock, critical_count, warning_count, info_count,
            started_by, started_at, finished_at, error_message
          FROM month_close_runs
          WHERE period = ?
          ORDER BY started_at DESC, id DESC
        `)
        .bind(period)
    );
  }

  listPeriods(): Promise<MonthClosePeriodRow[]> {
    return all<MonthClosePeriodRow>(
      this.db.prepare(`
        WITH periods AS (
          SELECT period FROM documents
          UNION
          SELECT period FROM month_close_runs
          UNION
          SELECT period FROM period_locks
          UNION
          SELECT period FROM month_close_snapshots
        ),
        ranked_runs AS (
          SELECT
            id, period, status, can_lock, critical_count, warning_count, info_count,
            ROW_NUMBER() OVER (PARTITION BY period ORDER BY started_at DESC, id DESC) AS run_rank
          FROM month_close_runs
        ),
        snapshot_counts AS (
          SELECT
            period,
            COUNT(*) AS snapshot_count,
            MAX(version) AS latest_snapshot_version
          FROM month_close_snapshots
          GROUP BY period
        )
        SELECT
          p.period AS period,
          r.id AS latest_run_id,
          r.status AS latest_run_status,
          COALESCE(r.can_lock, 0) AS can_lock,
          COALESCE(r.critical_count, 0) AS critical_count,
          COALESCE(r.warning_count, 0) AS warning_count,
          COALESCE(r.info_count, 0) AS info_count,
          pl.locked_at AS locked_at,
          pl.locked_by AS locked_by,
          COALESCE(sc.snapshot_count, 0) AS snapshot_count,
          sc.latest_snapshot_version AS latest_snapshot_version
        FROM periods p
        LEFT JOIN ranked_runs r ON r.period = p.period AND r.run_rank = 1
        LEFT JOIN period_locks pl ON pl.period = p.period
        LEFT JOIN snapshot_counts sc ON sc.period = p.period
        ORDER BY p.period DESC
      `)
    );
  }

  async insertCheckResults(
    runId: string,
    period: string,
    rows: InsertCheckResultInput[]
  ): Promise<MonthCloseCheckResultRow[]> {
    const resultRows = rows.map((row) => this.checkResultRow(runId, period, row));
    if (resultRows.length === 0) return [];

    await this.runBatch(
      resultRows.map((row) =>
        this.db
          .prepare(`
            INSERT INTO month_close_check_results (
              id, run_id, period, check_type, severity, entity_type, entity_id,
              business_date, currency_code, amount_minor, usdt_cost_minor,
              message, suggested_action, status, assignee_person_id, resolved_by,
              resolved_at, resolution_note, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `)
          .bind(
            row.id,
            row.run_id,
            row.period,
            row.check_type,
            row.severity,
            row.entity_type,
            row.entity_id,
            row.business_date,
            row.currency_code,
            row.amount_minor,
            row.usdt_cost_minor,
            row.message,
            row.suggested_action,
            row.status,
            row.assignee_person_id,
            row.resolved_by,
            row.resolved_at,
            row.resolution_note,
            row.created_at
          )
      )
    );

    return resultRows;
  }

  listCheckResults(period: string, runId?: string): Promise<MonthCloseCheckResultRow[]> {
    const runFilter = runId ? "AND run_id = ?" : "";
    const bindings = runId ? [period, runId] : [period];

    return all<MonthCloseCheckResultRow>(
      this.db
        .prepare(`
          SELECT
            id, run_id, period, check_type, severity, entity_type, entity_id,
            business_date, currency_code, amount_minor, usdt_cost_minor,
            message, suggested_action, status, assignee_person_id, resolved_by,
            resolved_at, resolution_note, created_at
          FROM month_close_check_results
          WHERE period = ?
            ${runFilter}
          ORDER BY
            CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
            check_type,
            entity_id
        `)
        .bind(...bindings)
    );
  }

  async updateCheckResult(id: string, patch: UpdateCheckResultInput): Promise<MonthCloseCheckResultRow | null> {
    const assignments: string[] = [];
    const bindings: unknown[] = [];
    addAssignment(assignments, bindings, "status", patch.status);
    addAssignment(assignments, bindings, "assignee_person_id", patch.assigneePersonId);
    addAssignment(assignments, bindings, "resolved_by", patch.resolvedBy);
    addAssignment(assignments, bindings, "resolved_at", patch.resolvedAt);
    addAssignment(assignments, bindings, "resolution_note", patch.resolutionNote);

    if (assignments.length > 0) {
      await run(
        this.db
          .prepare(`
            UPDATE month_close_check_results
            SET ${assignments.join(", ")}
            WHERE id = ?
          `)
          .bind(...bindings, id)
      );
    }

    return this.getCheckResult(id);
  }

  getCheckResult(id: string): Promise<MonthCloseCheckResultRow | null> {
    return first<MonthCloseCheckResultRow>(
      this.db
        .prepare(`
          SELECT
            id, run_id, period, check_type, severity, entity_type, entity_id,
            business_date, currency_code, amount_minor, usdt_cost_minor,
            message, suggested_action, status, assignee_person_id, resolved_by,
            resolved_at, resolution_note, created_at
          FROM month_close_check_results
          WHERE id = ?
        `)
        .bind(id)
    );
  }

  async nextSnapshotVersion(period: string): Promise<number> {
    const row = await first<{ version: number }>(
      this.db
        .prepare("SELECT COALESCE(MAX(version), 0) + 1 AS version FROM month_close_snapshots WHERE period = ?")
        .bind(period)
    );
    return row?.version ?? 1;
  }

  async createSnapshotWithReports(input: CreateSnapshotInput): Promise<MonthCloseSnapshotRow> {
    const snapshot: MonthCloseSnapshotRow = {
      id: newId("month_close_snapshot"),
      period: input.period,
      version: input.version,
      run_id: input.runId,
      locked_by: input.lockedBy,
      locked_at: input.lockedAt ?? nowIso(),
      note: input.note,
      summary_json: JSON.stringify(input.summary)
    };
    const createdAt = input.createdAt ?? nowIso();
    const reportRows = input.reports.map((report) => ({
      id: newId("month_close_report_snapshot"),
      snapshot_id: snapshot.id,
      report_key: report.reportKey,
      row_count: report.rows.length,
      data_json: JSON.stringify(report.rows),
      created_at: createdAt
    }));

    await this.runBatch([
      this.db
        .prepare(`
          INSERT INTO month_close_snapshots (
            id, period, version, run_id, locked_by, locked_at, note, summary_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .bind(
          snapshot.id,
          snapshot.period,
          snapshot.version,
          snapshot.run_id,
          snapshot.locked_by,
          snapshot.locked_at,
          snapshot.note,
          snapshot.summary_json
        ),
      ...reportRows.map((row) =>
        this.db
          .prepare(`
            INSERT INTO month_close_report_snapshots (
              id, snapshot_id, report_key, row_count, data_json, created_at
            ) VALUES (?, ?, ?, ?, ?, ?)
          `)
          .bind(row.id, row.snapshot_id, row.report_key, row.row_count, row.data_json, row.created_at)
      )
    ]);

    return snapshot;
  }

  listSnapshots(period: string): Promise<MonthCloseSnapshotRow[]> {
    return all<MonthCloseSnapshotRow>(
      this.db
        .prepare(`
          SELECT id, period, version, run_id, locked_by, locked_at, note, summary_json
          FROM month_close_snapshots
          WHERE period = ?
          ORDER BY version DESC
        `)
        .bind(period)
    );
  }

  getSnapshot(id: string): Promise<MonthCloseSnapshotRow | null> {
    return first<MonthCloseSnapshotRow>(
      this.db
        .prepare(`
          SELECT id, period, version, run_id, locked_by, locked_at, note, summary_json
          FROM month_close_snapshots
          WHERE id = ?
        `)
        .bind(id)
    );
  }

  getReportSnapshot(snapshotId: string, reportKey: string): Promise<MonthCloseReportSnapshotRow | null> {
    return first<MonthCloseReportSnapshotRow>(
      this.db
        .prepare(`
          SELECT id, snapshot_id, report_key, row_count, data_json, created_at
          FROM month_close_report_snapshots
          WHERE snapshot_id = ?
            AND report_key = ?
        `)
        .bind(snapshotId, reportKey)
    );
  }

  private checkResultRow(
    runId: string,
    period: string,
    row: InsertCheckResultInput
  ): MonthCloseCheckResultRow {
    return {
      id: newId("month_close_check_result"),
      run_id: runId,
      period,
      check_type: row.checkType,
      severity: row.severity,
      entity_type: row.entityType,
      entity_id: row.entityId,
      business_date: row.businessDate,
      currency_code: row.currencyCode,
      amount_minor: row.amountMinor,
      usdt_cost_minor: row.usdtCostMinor,
      message: row.message,
      suggested_action: row.suggestedAction,
      status: "open",
      assignee_person_id: null,
      resolved_by: null,
      resolved_at: null,
      resolution_note: null,
      created_at: row.createdAt ?? nowIso()
    };
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

function addAssignment(assignments: string[], bindings: unknown[], column: string, value: unknown) {
  if (value !== undefined) {
    assignments.push(`${column} = ?`);
    bindings.push(value);
  }
}
