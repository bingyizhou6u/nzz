export type MonthCloseRunStatus = "running" | "completed" | "failed";
export type MonthCloseSeverity = "critical" | "warning" | "info";
export type MonthCloseCheckStatus = "open" | "assigned" | "acknowledged" | "resolved" | "waived";

export interface MonthClosePeriod {
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

export interface MonthCloseRun {
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

export interface MonthCloseCheckResult {
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
  status: MonthCloseCheckStatus;
  assignee_person_id: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
  created_at: string;
}

export interface MonthCloseSnapshot {
  id: string;
  period: string;
  version: number;
  run_id: string;
  locked_by: string;
  locked_at: string;
  note: string;
  summary_json: string;
}

export interface PeriodLock {
  period: string;
  locked_by: string;
  locked_at: string;
  note: string | null;
}

export interface MonthCloseOverview {
  period: string;
  latestRun: MonthCloseRun | null;
  periodLock: PeriodLock | null;
  checks: MonthCloseCheckResult[];
  snapshots: MonthCloseSnapshot[];
}

export interface MonthCloseRunChecksResult {
  period: string;
  run: MonthCloseRun;
  checks: MonthCloseCheckResult[];
  summary: {
    criticalCount: number;
    warningCount: number;
    infoCount: number;
  };
  canLock: boolean;
}

export interface PersonOption {
  id: string;
  name: string;
  alias: string | null;
  is_enabled: number;
}

export interface MonthCloseCheckPatch {
  status?: MonthCloseCheckStatus;
  assigneePersonId?: string | null;
  resolutionNote?: string | null;
}
