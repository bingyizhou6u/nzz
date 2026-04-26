import type {
  CreateSnapshotReportInput,
  MonthCloseCheckResultRow,
  MonthCloseRepository,
  MonthCloseSnapshotRow,
  MonthCloseRunRow
} from "../repositories/monthCloseRepository";
import { PeriodLockNotFoundError, type PeriodLockRow } from "../repositories/periodLockRepository";
import {
  accountBalanceChecks,
  canLockFromCheckResults,
  documentWorkflowChecks,
  loanAgingChecks,
  pendingCostChecks,
  projectIntegrityChecks,
  summarizeCheckResults,
  type AccountBalanceCheckRow,
  type DocumentWorkflowCheckRow,
  type LoanAgingCheckRow,
  type MonthCloseCheckOptions,
  type MonthCloseHandledCheckResult,
  type MonthCloseSummary,
  type PendingCostCheckRow,
  type ProjectIntegrityCheckRow
} from "./monthCloseChecks";

export type MonthCloseRunRepository = Pick<
  MonthCloseRepository,
  | "createRun"
  | "completeRun"
  | "failRun"
  | "insertCheckResults"
  | "latestRun"
  | "listCheckResults"
  | "getPeriodLock"
  | "nextSnapshotVersion"
  | "lockWithSnapshotAndAudit"
  | "unlockPeriodWithAudit"
>;

interface PeriodReportFilter {
  period: string;
}

export interface MonthCloseSourceRepository {
  documentWorkflowRows(period: string): Promise<DocumentWorkflowCheckRow[]>;
  accountBalanceRowsForMonthClose(period: string): Promise<AccountBalanceCheckRow[]>;
  pendingCostRowsForMonthClose(period: string): Promise<PendingCostCheckRow[]>;
  loanAgingRowsForMonthClose(period: string): Promise<LoanAgingCheckRow[]>;
  projectIntegrityRows(period: string): Promise<ProjectIntegrityCheckRow[]>;
  monthCloseFundingReconciliation(period: string): Promise<MonthCloseFundingReconciliationRow[]>;
  monthClosePettyCashReconciliation(period: string): Promise<MonthClosePettyCashReconciliationRow[]>;
  monthCloseLoanReconciliation(period: string): Promise<MonthCloseLoanReconciliationRow[]>;
  monthCloseProjectReconciliation(period: string): Promise<MonthCloseProjectReconciliationRow[]>;
  accountBalances(): Promise<object[]>;
  lotBalances(): Promise<object[]>;
  lotMovements(): Promise<object[]>;
  pettyCashPendingMatches(): Promise<object[]>;
  pendingCostMatches(): Promise<object[]>;
  loanBalances(): Promise<object[]>;
  loanAging(): Promise<object[]>;
  projectProfitLoss(filters: PeriodReportFilter): Promise<object[]>;
  projectIncome(filters: PeriodReportFilter): Promise<object[]>;
  merchantIncome(filters: PeriodReportFilter): Promise<object[]>;
  expenseDetails(filters: PeriodReportFilter): Promise<object[]>;
  expenseSummary(filters: PeriodReportFilter): Promise<object[]>;
  monthlyOperatingSummary(filters: PeriodReportFilter): Promise<object[]>;
  exceptionChecks(filters: PeriodReportFilter): Promise<object[]>;
}

export interface MonthCloseActor {
  personId: string;
}

export interface RunMonthCloseChecksOptions {
  startedAt?: string;
  finishedAt?: string;
}

export interface MonthCloseServiceOptions {
  checkOptions?: Partial<MonthCloseCheckOptions>;
}

export interface RunMonthCloseChecksResult {
  run: MonthCloseRunRow;
  checks: MonthCloseCheckResultRow[];
  summary: MonthCloseSummary;
  canLock: boolean;
}

export interface LockMonthClosePeriodOptions {
  note: string;
  auditStatement: D1PreparedStatement;
  lockedAt?: string;
}

export interface LockMonthClosePeriodResult {
  period: string;
  status: "locked";
  snapshot: MonthCloseSnapshotRow;
}

export interface UnlockMonthClosePeriodOptions {
  auditStatement?: D1PreparedStatement;
  auditForLock?: (lock: PeriodLockRow) => D1PreparedStatement;
}

export interface UnlockMonthClosePeriodResult {
  period: string;
  status: "unlocked";
}

export interface MonthCloseFundingReconciliationRow {
  accountId: string;
  accountType: string;
  currencyCode: string;
  openingBalanceMinor: number;
  periodInflowMinor: number;
  periodOutflowMinor: number;
  closingBalanceMinor: number;
}

export interface MonthClosePettyCashReconciliationRow {
  personId: string | null;
  accountId: string;
  currencyCode: string;
  openingBalanceMinor: number;
  periodIssuedMinor: number;
  periodReimbursedMinor: number;
  closingBalanceMinor: number;
  pendingCostMinor: number;
}

export interface MonthCloseLoanReconciliationRow {
  borrowerPersonId: string;
  currencyCode: string;
  openingBalanceMinor: number;
  periodLoanOutMinor: number;
  periodRepaymentMinor: number;
  periodWriteoffMinor: number;
  closingBalanceMinor: number;
}

export interface MonthCloseProjectReconciliationRow {
  projectId: string | null;
  currencyCode: string;
  incomeAmountMinor: number;
  expenseAmountMinor: number;
  matchedUsdtCostMinor: number;
  pendingAmountMinor: number;
}

export interface MonthCloseReconciliation {
  funding: MonthCloseFundingReconciliationRow[];
  pettyCash: MonthClosePettyCashReconciliationRow[];
  loans: MonthCloseLoanReconciliationRow[];
  projects: MonthCloseProjectReconciliationRow[];
}

export const defaultMonthCloseCheckOptions: MonthCloseCheckOptions = {
  staleDays: 7,
  stalePendingCostDays: 10,
  staleLoanDays: 30,
  pettyCashNegativeCriticalDays: 14,
  pettyCashNegativeCriticalAmountMinor: 100000
};

export class MonthCloseService {
  private readonly checkOptions: MonthCloseCheckOptions;

  constructor(
    private readonly monthCloses: MonthCloseRunRepository,
    private readonly sources: MonthCloseSourceRepository,
    options: MonthCloseServiceOptions = {}
  ) {
    this.checkOptions = mergeCheckOptions(options.checkOptions);
  }

  async runChecks(
    period: string,
    actor: MonthCloseActor,
    options: RunMonthCloseChecksOptions = {}
  ): Promise<RunMonthCloseChecksResult> {
    const run = await this.monthCloses.createRun({
      period,
      startedBy: actor.personId,
      startedAt: options.startedAt
    });

    try {
      const [documentRows, accountRows, pendingCostRows, loanRows, projectRows] = await Promise.all([
        this.sources.documentWorkflowRows(period),
        this.sources.accountBalanceRowsForMonthClose(period),
        this.sources.pendingCostRowsForMonthClose(period),
        this.sources.loanAgingRowsForMonthClose(period),
        this.sources.projectIntegrityRows(period)
      ]);
      const checkInputs = [
        ...documentWorkflowChecks(documentRows, this.checkOptions),
        ...accountBalanceChecks(accountRows, this.checkOptions),
        ...pendingCostChecks(pendingCostRows, this.checkOptions),
        ...loanAgingChecks(loanRows, this.checkOptions),
        ...projectIntegrityChecks(projectRows, this.checkOptions)
      ];
      const checks = await this.monthCloses.insertCheckResults(run.id, period, checkInputs);
      const summary = summarizeCheckResults(checks);
      const canLock = canLockFromCheckResults(checks.map(checkResultRowToHandledCheckResult));
      const finishedAt = options.finishedAt ?? new Date().toISOString();

      await this.monthCloses.completeRun({
        runId: run.id,
        canLock,
        ...summary,
        finishedAt
      });

      return {
        run: {
          ...run,
          status: "completed",
          can_lock: canLock ? 1 : 0,
          critical_count: summary.criticalCount,
          warning_count: summary.warningCount,
          info_count: summary.infoCount,
          finished_at: finishedAt,
          error_message: null
        },
        checks,
        summary,
        canLock
      };
    } catch (error) {
      try {
        await this.monthCloses.failRun({
          runId: run.id,
          errorMessage: errorMessage(error),
          finishedAt: options.finishedAt
        });
      } catch {
        // Preserve the operational error that caused the failed run.
      }
      throw error;
    }
  }

  async reconciliation(period: string): Promise<MonthCloseReconciliation> {
    const [funding, pettyCash, loans, projects] = await Promise.all([
      this.sources.monthCloseFundingReconciliation(period),
      this.sources.monthClosePettyCashReconciliation(period),
      this.sources.monthCloseLoanReconciliation(period),
      this.sources.monthCloseProjectReconciliation(period)
    ]);

    return { funding, pettyCash, loans, projects };
  }

  async lockPeriod(
    period: string,
    actor: MonthCloseActor,
    options: LockMonthClosePeriodOptions
  ): Promise<LockMonthClosePeriodResult> {
    const note = options.note.trim();
    if (!note) throw new MonthCloseLockError("note is required");

    const run = await this.monthCloses.latestRun(period);
    if (!run || run.status !== "completed") {
      throw new MonthCloseLockError("Month close checks must be completed before locking");
    }

    const checks = await this.monthCloses.listCheckResults(period, run.id);
    if (!canLockFromCheckResults(checks.map(checkResultRowToHandledCheckResult))) {
      throw new MonthCloseLockError("Month close checks are not lockable");
    }

    const existingLock = await this.monthCloses.getPeriodLock(period);
    if (existingLock) throw new MonthCloseLockError("Period is already locked");

    const [version, reports] = await Promise.all([
      this.monthCloses.nextSnapshotVersion(period),
      this.snapshotReports(period, checks)
    ]);
    const summary = summarizeCheckResults(checks);
    const snapshot = await this.monthCloses.lockWithSnapshotAndAudit(
      {
        period,
        version,
        runId: run.id,
        lockedBy: actor.personId,
        lockedAt: options.lockedAt,
        note,
        summary,
        reports
      },
      options.auditStatement
    );

    return { period, status: "locked", snapshot };
  }

  async unlockPeriod(period: string, options: UnlockMonthClosePeriodOptions): Promise<UnlockMonthClosePeriodResult> {
    const lock = await this.monthCloses.getPeriodLock(period);
    if (!lock) throw new MonthCloseLockNotFoundError();

    const auditStatement = options.auditStatement ?? options.auditForLock?.(lock);
    if (!auditStatement) throw new MonthCloseLockError("auditStatement is required");

    try {
      await this.monthCloses.unlockPeriodWithAudit(lock, auditStatement);
    } catch (error) {
      if (error instanceof PeriodLockNotFoundError) throw new MonthCloseLockNotFoundError();
      throw error;
    }

    return { period, status: "unlocked" };
  }

  private async snapshotReports(
    period: string,
    checks: MonthCloseCheckResultRow[]
  ): Promise<CreateSnapshotReportInput[]> {
    const filters = { period };
    const [
      accountBalances,
      lotBalances,
      lotMovements,
      pettyCashPending,
      pendingCosts,
      loanBalances,
      loanAging,
      projectProfitLoss,
      projectIncome,
      merchantIncome,
      expenseDetails,
      expenseSummary,
      monthlyOperatingSummary,
      exceptionChecks,
      reconciliation
    ] = await Promise.all([
      this.sources.accountBalances(),
      this.sources.lotBalances(),
      this.sources.lotMovements(),
      this.sources.pettyCashPendingMatches(),
      this.sources.pendingCostMatches(),
      this.sources.loanBalances(),
      this.sources.loanAging(),
      this.sources.projectProfitLoss(filters),
      this.sources.projectIncome(filters),
      this.sources.merchantIncome(filters),
      this.sources.expenseDetails(filters),
      this.sources.expenseSummary(filters),
      this.sources.monthlyOperatingSummary(filters),
      this.sources.exceptionChecks(filters),
      this.reconciliation(period)
    ]);

    return [
      { reportKey: "accountBalances", rows: accountBalances },
      { reportKey: "lotBalances", rows: lotBalances },
      { reportKey: "lotMovements", rows: lotMovements },
      { reportKey: "pettyCashPending", rows: pettyCashPending },
      { reportKey: "pendingCosts", rows: pendingCosts },
      { reportKey: "loanBalances", rows: loanBalances },
      { reportKey: "loanAging", rows: loanAging },
      { reportKey: "projectProfitLoss", rows: projectProfitLoss },
      { reportKey: "projectIncome", rows: projectIncome },
      { reportKey: "merchantIncome", rows: merchantIncome },
      { reportKey: "expenseDetails", rows: expenseDetails },
      { reportKey: "expenseSummary", rows: expenseSummary },
      { reportKey: "monthlyOperatingSummary", rows: monthlyOperatingSummary },
      { reportKey: "exceptionChecks", rows: exceptionChecks },
      { reportKey: "monthCloseChecks", rows: checks },
      { reportKey: "monthCloseReconciliation", rows: [reconciliation] }
    ];
  }
}

export class MonthCloseLockError extends Error {
  readonly status = 400;
}

export class MonthCloseLockNotFoundError extends Error {
  readonly status = 404;

  constructor() {
    super("Period lock not found");
  }
}

function checkResultRowToHandledCheckResult(row: MonthCloseCheckResultRow): MonthCloseHandledCheckResult {
  return {
    checkType: row.check_type,
    severity: row.severity,
    entityType: row.entity_type,
    entityId: row.entity_id,
    businessDate: row.business_date,
    currencyCode: row.currency_code,
    amountMinor: row.amount_minor,
    usdtCostMinor: row.usdt_cost_minor,
    message: row.message,
    suggestedAction: row.suggested_action,
    status: row.status
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return String(error);
}

function mergeCheckOptions(input: Partial<MonthCloseCheckOptions> | undefined): MonthCloseCheckOptions {
  return {
    staleDays: input?.staleDays ?? defaultMonthCloseCheckOptions.staleDays,
    stalePendingCostDays: input?.stalePendingCostDays ?? defaultMonthCloseCheckOptions.stalePendingCostDays,
    staleLoanDays: input?.staleLoanDays ?? defaultMonthCloseCheckOptions.staleLoanDays,
    pettyCashNegativeCriticalDays:
      input?.pettyCashNegativeCriticalDays ?? defaultMonthCloseCheckOptions.pettyCashNegativeCriticalDays,
    pettyCashNegativeCriticalAmountMinor:
      input?.pettyCashNegativeCriticalAmountMinor ?? defaultMonthCloseCheckOptions.pettyCashNegativeCriticalAmountMinor
  };
}
