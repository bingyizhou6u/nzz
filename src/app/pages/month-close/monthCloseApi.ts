import { getJson, postJson, type ApiEnvelope } from "../../api";
import type {
  MonthCloseCheckPatch,
  MonthCloseCheckResult,
  MonthCloseOverview,
  MonthClosePeriod,
  MonthCloseReconciliation,
  MonthCloseRunChecksResult,
  MonthCloseSnapshot,
  PersonOption
} from "./monthCloseTypes";

interface ChecksResponse {
  run: MonthCloseOverview["latestRun"];
  checks: MonthCloseCheckResult[];
}

export interface MonthCloseLockResult {
  period: string;
  status: "locked";
  snapshot: MonthCloseSnapshot;
}

export interface MonthCloseUnlockResult {
  period: string;
  status: "unlocked";
}

export function listMonthClosePeriods() {
  return getJson<ApiEnvelope<MonthClosePeriod[]>>("/api/month-close/periods").then((response) => response.data);
}

export function getMonthCloseOverview(period: string) {
  return getJson<ApiEnvelope<MonthCloseOverview>>(`/api/month-close/${encodeURIComponent(period)}`).then(
    (response) => response.data
  );
}

export function runMonthCloseChecks(period: string) {
  return postJson<ApiEnvelope<MonthCloseRunChecksResult>>(
    `/api/month-close/${encodeURIComponent(period)}/checks/run`,
    {}
  ).then((response) => response.data);
}

export function listMonthCloseChecks(period: string) {
  return getJson<ApiEnvelope<ChecksResponse>>(`/api/month-close/${encodeURIComponent(period)}/checks`).then(
    (response) => response.data
  );
}

export function getMonthCloseReconciliation(period: string) {
  return getJson<ApiEnvelope<MonthCloseReconciliation>>(
    `/api/month-close/${encodeURIComponent(period)}/reconciliation`
  ).then((response) => response.data);
}

export function listMonthCloseSnapshots(period: string) {
  return getJson<ApiEnvelope<MonthCloseSnapshot[]>>(`/api/month-close/${encodeURIComponent(period)}/snapshots`).then(
    (response) => response.data
  );
}

export function lockMonthClosePeriod(period: string, note: string) {
  return postJson<ApiEnvelope<MonthCloseLockResult>>(`/api/month-close/${encodeURIComponent(period)}/lock`, { note }).then(
    (response) => response.data
  );
}

export function unlockMonthClosePeriod(period: string, reason: string) {
  return postJson<ApiEnvelope<MonthCloseUnlockResult>>(`/api/month-close/${encodeURIComponent(period)}/unlock`, {
    reason
  }).then((response) => response.data);
}

export function updateMonthCloseCheckResult(id: string, patch: MonthCloseCheckPatch) {
  return fetch(`/api/month-close/check-results/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json"
    },
    body: JSON.stringify(patch)
  }).then(async (response) => {
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: unknown };
      throw new Error(typeof body.error === "string" ? body.error : `${response.status} ${response.statusText}`.trim());
    }
    return ((await response.json()) as ApiEnvelope<MonthCloseCheckResult>).data;
  });
}

export function listPeopleOptions() {
  return getJson<ApiEnvelope<PersonOption[]>>("/api/master-data/people").then((response) =>
    response.data.filter((person) => person.is_enabled === 1)
  );
}
