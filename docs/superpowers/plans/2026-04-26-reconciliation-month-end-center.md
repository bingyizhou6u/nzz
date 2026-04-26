# Reconciliation and Month-End Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a formal reconciliation and month-end close center that turns existing reports and period locks into an auditable close workflow: run checks, resolve or acknowledge exceptions, reconcile balances, lock the period, and preserve close snapshots.

**Architecture:** Keep approved documents, account entries, lots, pending cost matches, loan rows, and report SQL as the source of truth. Add a month-close layer that persists check runs, check results, exception handling state, and close snapshots. The current `period_locks` table remains the hard period lock; month-close tables provide the workflow, evidence, and snapshot versioning around it.

**Tech Stack:** Cloudflare Workers, D1 SQLite, TypeScript, React, Vite, Vitest.

---

## Source Documents

- Design spec: `docs/superpowers/specs/2026-04-26-reconciliation-month-end-center-design.md`
- Existing reports plan: `docs/superpowers/plans/2026-04-25-report-center-formal-metrics.md`
- Existing period lock API: `src/api/periodLocks.ts`
- Existing period lock repository: `src/repositories/periodLockRepository.ts`
- Existing report repository: `src/repositories/reportRepository.ts`
- Existing audit helper: `src/repositories/auditLogRepository.ts`
- Existing report UI: `src/app/pages/ReportsPage.tsx`
- Existing period lock UI: `src/app/pages/PeriodLocksPage.tsx`

## File Structure

Create:

- `migrations/0008_month_close_center.sql` - month-close runs, check results, snapshots, and report snapshots.
- `src/repositories/monthCloseRepository.ts` - D1 persistence for runs, check results, state updates, and snapshots.
- `src/services/monthCloseChecks.ts` - pure check-rule builders and result normalization.
- `src/services/monthCloseService.ts` - orchestration for run checks, update results, lock, unlock, and snapshot creation.
- `src/api/monthClose.ts` - month-close HTTP handlers.
- `src/app/pages/MonthClosePage.tsx` - reconciliation and month-end center shell.
- `src/app/pages/month-close/monthCloseTypes.ts` - frontend row and API types.
- `src/app/pages/month-close/monthCloseModel.ts` - frontend status labels, grouping, payload builders, and view helpers.
- `src/app/pages/month-close/MonthClosePeriodList.tsx`
- `src/app/pages/month-close/MonthCloseStatusBar.tsx`
- `src/app/pages/month-close/MonthCloseChecksTab.tsx`
- `src/app/pages/month-close/MonthCloseReconciliationTabs.tsx`
- `src/app/pages/month-close/MonthCloseSnapshotsTab.tsx`
- `src/app/pages/month-close/monthCloseModel.test.ts`
- `tests/api/monthCloseRepository.test.ts`
- `tests/services/monthCloseChecks.test.ts`
- `tests/services/monthCloseService.test.ts`
- `tests/api/monthClose.test.ts`

Modify:

- `src/worker/router.ts` - add month-close routes.
- `src/app/session/sessionTypes.ts` - add the `month-close` page key.
- `src/app/session/sessionModel.ts` - add navigation entry for `对账月结`.
- `src/app/session/sessionModel.test.ts` - cover new navigation.
- `src/app/App.tsx` - route to `MonthClosePage`.
- `src/app/styles.css` - add month-close layouts, status cards, check list, and reconciliation tabs.
- `src/api/periodLocks.ts` - keep existing API working; do not remove until month-close lock endpoint is stable.
- `src/app/pages/ReportsPage.tsx` - later add realtime/snapshot selector after snapshot APIs exist.

Do not modify in the first three tasks:

- `src/domain/posting.ts`
- `src/domain/fifoEffects.ts`
- `src/domain/loanEffects.ts`
- existing report SQL semantics

---

## Shared Domain Decisions

Use these domain constants consistently in backend and frontend tests:

```ts
export const MONTH_CLOSE_STATUSES = ["open", "checking", "ready_to_lock", "locked", "reopened"] as const;
export const MONTH_CLOSE_RUN_STATUSES = ["running", "completed", "failed"] as const;
export const MONTH_CLOSE_SEVERITIES = ["critical", "warning", "info"] as const;
export const MONTH_CLOSE_RESULT_STATUSES = ["open", "assigned", "acknowledged", "resolved", "waived"] as const;
```

Lock eligibility rules:

- A period can be locked only from the month-close endpoint once this feature is enabled.
- The latest check run for the period must be `completed`.
- No `critical` check result may remain unresolved.
- All `warning` check results must be `resolved`, `acknowledged`, or `waived`.
- Lock note is required.
- The period must not already exist in `period_locks`.

Business rules:

- `critical` means lock-blocking.
- `warning` means follow-up required; lock allowed only after explicit handling.
- `info` means visibility only.
- Petty cash can be negative; negative petty cash is warning by default, upgraded by age or amount threshold in later tasks.
- Approved documents and posting side effects remain the accounting source of truth.
- Snapshots are archived evidence, not posting sources.

---

## Task 1: Add Month-Close Schema

**Files:**

- Create: `migrations/0008_month_close_center.sql`
- Create: `tests/api/monthCloseRepository.test.ts`
- Create: `src/repositories/monthCloseRepository.ts`

- [ ] **Step 1: Write failing repository tests for runs and check results**

Create `tests/api/monthCloseRepository.test.ts` covering:

- creating a check run with status `running`
- completing a run with summary counts and `can_lock`
- inserting check results for a run
- listing latest results by period
- updating a result to `acknowledged`, `resolved`, or `waived`
- rejecting invalid result transitions at repository/service boundary later
- creating a snapshot header and report snapshot rows

Expected RED: module import failure because `monthCloseRepository.ts` and migration do not exist.

- [ ] **Step 2: Add migration**

Create `migrations/0008_month_close_center.sql`:

```sql
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
```

- [ ] **Step 3: Implement `MonthCloseRepository`**

Required methods:

- `createRun(input)`
- `completeRun(input)`
- `failRun(input)`
- `insertCheckResults(runId, period, rows)`
- `latestRun(period)`
- `listRuns(period)`
- `listCheckResults(period, runId?)`
- `updateCheckResult(id, patch)`
- `nextSnapshotVersion(period)`
- `createSnapshotWithReports(input)`
- `listSnapshots(period)`
- `getSnapshot(id)`
- `getReportSnapshot(snapshotId, reportKey)`

- [ ] **Step 4: Verify repository GREEN**

Run:

```bash
npm test -- tests/api/monthCloseRepository.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add migrations/0008_month_close_center.sql src/repositories/monthCloseRepository.ts tests/api/monthCloseRepository.test.ts
git commit -m "feat: add month close persistence"
```

---

## Task 2: Build Pure Month-Close Check Rules

**Files:**

- Create: `src/services/monthCloseChecks.ts`
- Create: `tests/services/monthCloseChecks.test.ts`
- Use existing repository interfaces as inputs, but keep rule functions pure where possible.

- [ ] **Step 1: Write failing tests for check normalization**

Cover:

- pending documents in the target period become `critical`
- draft documents become `info`
- rejected documents become `warning`
- negative company accounts become `critical`
- negative petty cash becomes `warning`
- pending costs become `warning`
- stale pending costs become `critical`
- stale loans become `warning`
- project income without merchant becomes `critical`
- merchant/project mismatch becomes `critical`

Expected RED: `monthCloseChecks.ts` does not exist.

- [ ] **Step 2: Define check result shape**

Create `MonthCloseCheckResultInput` with:

- `checkType`
- `severity`
- `entityType`
- `entityId`
- `businessDate`
- `currencyCode`
- `amountMinor`
- `usdtCostMinor`
- `message`
- `suggestedAction`

- [ ] **Step 3: Implement pure builders**

Add pure helpers:

- `documentWorkflowChecks(rows, options)`
- `accountBalanceChecks(rows, options)`
- `pendingCostChecks(rows, options)`
- `loanAgingChecks(rows, options)`
- `projectIntegrityChecks(rows, options)`
- `summarizeCheckResults(rows)`
- `canLockFromCheckResults(rows)`

Keep thresholds configurable:

```ts
export interface MonthCloseCheckOptions {
  staleDays: number;
  stalePendingCostDays: number;
  staleLoanDays: number;
  pettyCashNegativeCriticalDays: number;
  pettyCashNegativeCriticalAmountMinor: number;
}
```

- [ ] **Step 4: Verify pure checks GREEN**

Run:

```bash
npm test -- tests/services/monthCloseChecks.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/services/monthCloseChecks.ts tests/services/monthCloseChecks.test.ts
git commit -m "feat: add month close check rules"
```

---

## Task 3: Add Month-Close Service Orchestration

**Files:**

- Create: `src/services/monthCloseService.ts`
- Test: `tests/services/monthCloseService.test.ts`
- Modify only as needed: `src/repositories/reportRepository.ts`

- [ ] **Step 1: Write failing service tests**

Cover:

- `runChecks(period, actor)` creates a run and persists result rows.
- completed run stores correct critical/warning/info counts.
- service marks `can_lock = 0` when any open critical exists.
- service marks `can_lock = 1` when no critical and all warnings are handled.
- failed check run stores `failed` and `error_message`.

- [ ] **Step 2: Add query methods needed by checks**

Prefer adding focused read methods to `ReportRepository` or a small internal query helper rather than duplicating large SQL:

- document workflow rows by period
- account balances by period and account type
- pending cost rows by period
- loan aging rows by period
- project integrity rows by period

Use existing report SQL where it already expresses the right business meaning.

- [ ] **Step 3: Implement `MonthCloseService.runChecks`**

Flow:

1. Validate `period`.
2. Create `month_close_runs` row with `running`.
3. Load source rows from existing tables/repositories.
4. Build check result inputs.
5. Insert check results.
6. Summarize counts.
7. Complete run with `can_lock`.
8. On error, mark run `failed`.

- [ ] **Step 4: Verify service GREEN**

Run:

```bash
npm test -- tests/services/monthCloseService.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/services/monthCloseService.ts tests/services/monthCloseService.test.ts src/repositories/reportRepository.ts
git commit -m "feat: orchestrate month close checks"
```

---

## Task 4: Add Month-Close API

**Files:**

- Create: `src/api/monthClose.ts`
- Modify: `src/worker/router.ts`
- Test: `tests/api/monthClose.test.ts`

- [ ] **Step 1: Write failing API tests**

Cover:

- `GET /api/month-close/periods`
- `GET /api/month-close/:period`
- `POST /api/month-close/:period/checks/run`
- `GET /api/month-close/:period/checks`
- `PATCH /api/month-close/check-results/:id`
- permission denial before executing writes
- invalid period returns 400
- check result update requires note for `acknowledged` and `waived`

- [ ] **Step 2: Implement handlers**

Handlers:

- `listMonthClosePeriods`
- `getMonthClosePeriod`
- `runMonthCloseChecks`
- `listMonthCloseChecks`
- `updateMonthCloseCheckResult`

Use permissions:

- view endpoints: `periodLocks.view`
- run/update endpoints: `periodLocks.lock`

Use `AuditLogRepository` for check result state changes.

- [ ] **Step 3: Register routes**

Add to `src/worker/router.ts`:

```ts
defineRoute("GET", "/api/month-close/periods", listMonthClosePeriods, "periodLocks.view"),
defineRoute("GET", "/api/month-close/:period", getMonthClosePeriod, "periodLocks.view"),
defineRoute("POST", "/api/month-close/:period/checks/run", runMonthCloseChecks, "periodLocks.lock"),
defineRoute("GET", "/api/month-close/:period/checks", listMonthCloseChecks, "periodLocks.view"),
defineRoute("PATCH", "/api/month-close/check-results/:id", updateMonthCloseCheckResult, "periodLocks.lock")
```

- [ ] **Step 4: Verify API GREEN**

Run:

```bash
npm test -- tests/api/monthClose.test.ts tests/api/periodLocks.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add src/api/monthClose.ts src/worker/router.ts tests/api/monthClose.test.ts
git commit -m "feat: expose month close checks api"
```

---

## Task 5: Add Month-Close Frontend MVP

**Files:**

- Create: `src/app/pages/MonthClosePage.tsx`
- Create: `src/app/pages/month-close/monthCloseTypes.ts`
- Create: `src/app/pages/month-close/monthCloseModel.ts`
- Create: `src/app/pages/month-close/monthCloseModel.test.ts`
- Create: `src/app/pages/month-close/MonthClosePeriodList.tsx`
- Create: `src/app/pages/month-close/MonthCloseStatusBar.tsx`
- Create: `src/app/pages/month-close/MonthCloseChecksTab.tsx`
- Modify: `src/app/session/sessionTypes.ts`
- Modify: `src/app/session/sessionModel.ts`
- Modify: `src/app/session/sessionModel.test.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/styles.css`

- [ ] **Step 1: Write failing frontend model tests**

Cover:

- status labels for open/checking/ready/locked/reopened
- severity sort critical before warning before info
- action payload builder trims note and status
- lock button disabled when period is locked or checks are blocking

- [ ] **Step 2: Add navigation**

Add `month-close` page key and navigation label `对账月结`, visible with `periodLocks.view`.

- [ ] **Step 3: Build page MVP**

MVP layout:

- period list on left
- status bar at top
- check results list in main area
- buttons:
  - `运行检查`
  - `刷新`
  - result action buttons for `确认保留`, `标记已处理`, `分配责任人`

Do not include reconciliation tabs yet; they are Task 6.

- [ ] **Step 4: Add render tests**

Add or extend page tests to verify:

- page loads latest period
- running checks calls `/api/month-close/:period/checks/run`
- critical results are visually first
- check-result update calls `PATCH /api/month-close/check-results/:id`
- users without lock permission can view but cannot update

- [ ] **Step 5: Verify frontend GREEN**

Run:

```bash
npm test -- src/app/pages/month-close/monthCloseModel.test.ts src/app/session/sessionModel.test.ts src/app/App.test.tsx
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/app/pages/MonthClosePage.tsx src/app/pages/month-close src/app/session src/app/App.tsx src/app/styles.css
git commit -m "feat: add month close center frontend"
```

---

## Task 6: Add Reconciliation Summary Tabs

**Files:**

- Modify: `src/services/monthCloseService.ts`
- Modify: `src/api/monthClose.ts`
- Create: `src/app/pages/month-close/MonthCloseReconciliationTabs.tsx`
- Test: `tests/services/monthCloseService.test.ts`
- Test: `tests/api/monthClose.test.ts`
- Test: frontend page tests

- [ ] **Step 1: Write failing service tests for summaries**

Cover summary shapes:

- funding reconciliation: account, currency, opening, inflow, outflow, closing
- petty cash reconciliation: person, account, currency, issue, reimbursement, return, pending
- loan reconciliation: borrower, currency, loan out, repayment, writeoff, closing, oldest date
- project reconciliation: project, income, expense, pending, net

- [ ] **Step 2: Implement summary queries**

Add read methods that derive summaries from approved documents and posting tables. Keep them period-scoped.

Important:

- opening balance comes from entries before period start, or previous snapshot later.
- current phase may compute opening by cumulative entries before target period.
- group by original currency; do not mix currencies.

- [ ] **Step 3: Add API response**

Add `GET /api/month-close/:period/reconciliation`.

Response:

```ts
{
  data: {
    funding: [],
    pettyCash: [],
    loans: [],
    projects: []
  }
}
```

- [ ] **Step 4: Implement tabs**

Tabs:

- `资金对账`
- `备用金`
- `借款`
- `项目经营`

Tables must not be stacked all at once. Only the active tab renders its detailed table.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- tests/services/monthCloseService.test.ts tests/api/monthClose.test.ts src/app/pages/MonthClosePage.test.tsx
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/services/monthCloseService.ts src/api/monthClose.ts src/app/pages/month-close src/app/styles.css tests
git commit -m "feat: add month close reconciliation summaries"
```

---

## Task 7: Add Lock, Unlock, and Snapshot Creation

**Files:**

- Modify: `src/services/monthCloseService.ts`
- Modify: `src/api/monthClose.ts`
- Modify: `src/repositories/monthCloseRepository.ts`
- Modify: `src/repositories/periodLockRepository.ts` if batch composition is needed
- Test: `tests/services/monthCloseService.test.ts`
- Test: `tests/api/monthClose.test.ts`

- [ ] **Step 1: Write failing lock eligibility tests**

Cover:

- cannot lock without completed run
- cannot lock with unresolved critical
- cannot lock with open warning
- can lock with resolved critical and acknowledged warning
- lock note is required
- cannot lock already locked period
- lock creates `period_locks`, snapshot header, report snapshots, and audit record in one batch

- [ ] **Step 2: Implement lock endpoint**

Route:

```ts
defineRoute("POST", "/api/month-close/:period/lock", lockMonthClosePeriod, "periodLocks.lock")
```

Body:

```ts
{
  note: string,
  runId?: string
}
```

- [ ] **Step 3: Snapshot report data**

Snapshot initial report keys:

- `accountBalances`
- `lotBalances`
- `lotMovements`
- `pettyCashPending`
- `pendingCosts`
- `loanBalances`
- `loanAging`
- `projectProfitLoss`
- `projectIncome`
- `merchantIncome`
- `expenseDetails`
- `expenseSummary`
- `monthlyOperatingSummary`
- `exceptionChecks`
- `monthCloseChecks`
- `monthCloseReconciliation`

- [ ] **Step 4: Implement unlock endpoint**

Route:

```ts
defineRoute("POST", "/api/month-close/:period/unlock", unlockMonthClosePeriod, "periodLocks.unlock")
```

Rules:

- reason required
- delete `period_locks`
- do not delete snapshots
- audit `month_close.unlock`
- period overview returns `reopened`

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- tests/services/monthCloseService.test.ts tests/api/monthClose.test.ts tests/api/periodLocks.test.ts
npx tsc --noEmit
```

- [ ] **Step 6: Commit**

```bash
git add src/services/monthCloseService.ts src/api/monthClose.ts src/repositories/monthCloseRepository.ts src/repositories/periodLockRepository.ts tests
git commit -m "feat: lock month close with snapshots"
```

---

## Task 8: Add Snapshot Viewing and Report Version Switching

**Files:**

- Modify: `src/api/monthClose.ts`
- Modify: `src/app/pages/month-close/MonthCloseSnapshotsTab.tsx`
- Modify: `src/app/pages/ReportsPage.tsx`
- Modify: `src/app/pages/reports/reportTypes.ts`
- Modify: `src/app/pages/reports/reportExport.ts`
- Test: `tests/api/monthClose.test.ts`
- Test: `src/app/pages/ReportsPage.test.tsx`
- Test: month-close page tests

- [ ] **Step 1: Write failing API tests for snapshots**

Cover:

- `GET /api/month-close/:period/snapshots`
- `GET /api/month-close/snapshots/:id/reports/:reportKey`
- report snapshot endpoint requires `reports.view`
- missing snapshot returns 404

- [ ] **Step 2: Implement snapshot APIs**

Routes:

```ts
defineRoute("GET", "/api/month-close/:period/snapshots", listMonthCloseSnapshots, "periodLocks.view"),
defineRoute("GET", "/api/month-close/snapshots/:id/reports/:reportKey", getMonthCloseReportSnapshot, "reports.view")
```

- [ ] **Step 3: Add snapshot tab**

Show:

- version
- locked at
- locked by
- note
- check counts
- buttons to view reports and export close package

- [ ] **Step 4: Add report version selector**

In `ReportsPage`:

- keep `实时数据`
- add `已结账快照`
- when a locked period and snapshot exists, prefer snapshot view for that period
- export file names include period and snapshot version

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- tests/api/monthClose.test.ts src/app/pages/ReportsPage.test.tsx
npm test
npm run build
```

- [ ] **Step 6: Commit**

```bash
git add src/api/monthClose.ts src/app/pages/month-close src/app/pages/ReportsPage.tsx src/app/pages/reports tests
git commit -m "feat: view month close snapshots in reports"
```

---

## Task 9: Final Verification and Production Readiness

**Files:**

- Modify docs only if needed:
  - `docs/deployment.md`
  - `docs/superpowers/specs/2026-04-26-reconciliation-month-end-center-design.md`

- [ ] **Step 1: Run complete verification**

```bash
npm test
npx tsc --noEmit
npm run build
npm audit --audit-level=high
git diff --check
```

- [ ] **Step 2: Run local migration smoke**

```bash
npm run db:migrate:local
npm run db:seed:local
npm run cf:dev
```

Manual smoke:

- open `/`
- enter `对账月结`
- select current demo period
- run checks
- process a warning
- verify lock is blocked when critical exists
- lock after checks are clear or handled
- verify snapshot appears
- verify reports can view snapshot data

- [ ] **Step 3: Review security**

Confirm:

- all write endpoints require authenticated actor
- permissions are enforced before DB writes
- no user-supplied SQL fragments
- audit records include actor person id and email
- lock and snapshot creation cannot partially succeed silently
- no secrets were committed

- [ ] **Step 4: Commit final docs/readiness changes**

```bash
git add docs src tests
git commit -m "docs: document month close verification"
```

---

## Implementation Order Recommendation

Use this order:

1. Task 1: schema and repository
2. Task 2: pure check rules
3. Task 3: service orchestration
4. Task 4: API
5. Task 5: frontend MVP
6. Task 6: reconciliation summaries
7. Task 7: lock/unlock/snapshots
8. Task 8: snapshot viewing and report switching
9. Task 9: final verification

Do not start snapshot report switching before lock snapshots exist. Do not wire frontend lock buttons before the backend lock eligibility rules are tested.

## Acceptance Criteria

- A finance user can run month-close checks for a selected period.
- The system persists the check run and check result rows.
- Critical issues block locking until resolved.
- Warning issues require resolution, acknowledgement, or waiver.
- Period lock writes `period_locks` and creates a snapshot version.
- Unlock keeps old snapshots and requires a reason.
- Re-lock creates a new snapshot version.
- Month-close center separates check list, reconciliation summaries, and snapshot archive.
- Reports can distinguish realtime data from close snapshots.
- Full test suite, typecheck, build, and audit pass.
