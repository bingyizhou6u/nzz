CREATE TABLE IF NOT EXISTS month_close_runs (
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL,
  status TEXT NOT NULL,
  can_lock INTEGER NOT NULL DEFAULT 0,
  critical_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  info_count INTEGER NOT NULL DEFAULT 0,
  started_by TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  error_message TEXT,
  FOREIGN KEY (started_by) REFERENCES people(id)
);

CREATE INDEX IF NOT EXISTS idx_month_close_runs_period_started
  ON month_close_runs(period, started_at DESC);

CREATE TABLE IF NOT EXISTS month_close_check_results (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  period TEXT NOT NULL,
  check_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  business_date TEXT,
  currency_code TEXT,
  amount_minor INTEGER,
  usdt_cost_minor INTEGER,
  message TEXT NOT NULL,
  suggested_action TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  assignee_person_id TEXT,
  resolved_by TEXT,
  resolved_at TEXT,
  resolution_note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (run_id) REFERENCES month_close_runs(id),
  FOREIGN KEY (assignee_person_id) REFERENCES people(id),
  FOREIGN KEY (resolved_by) REFERENCES people(id)
);

CREATE INDEX IF NOT EXISTS idx_month_close_check_results_run
  ON month_close_check_results(run_id, severity, status);

CREATE INDEX IF NOT EXISTS idx_month_close_check_results_period
  ON month_close_check_results(period, severity, status);

CREATE TABLE IF NOT EXISTS month_close_snapshots (
  id TEXT PRIMARY KEY,
  period TEXT NOT NULL,
  version INTEGER NOT NULL,
  run_id TEXT NOT NULL,
  locked_by TEXT NOT NULL,
  locked_at TEXT NOT NULL,
  note TEXT NOT NULL,
  summary_json TEXT NOT NULL,
  UNIQUE(period, version),
  FOREIGN KEY (run_id) REFERENCES month_close_runs(id),
  FOREIGN KEY (locked_by) REFERENCES people(id)
);

CREATE INDEX IF NOT EXISTS idx_month_close_snapshots_period
  ON month_close_snapshots(period, version DESC);

CREATE TABLE IF NOT EXISTS month_close_report_snapshots (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  report_key TEXT NOT NULL,
  row_count INTEGER NOT NULL,
  data_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES month_close_snapshots(id)
);

CREATE INDEX IF NOT EXISTS idx_month_close_report_snapshots_snapshot
  ON month_close_report_snapshots(snapshot_id, report_key);
