import type {
  MonthCloseCheckResultRow,
  MonthCloseRepository,
  MonthCloseRunRow
} from "../repositories/monthCloseRepository";
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
  "createRun" | "completeRun" | "failRun" | "insertCheckResults"
>;

export interface MonthCloseSourceRepository {
  documentWorkflowRows(period: string): Promise<DocumentWorkflowCheckRow[]>;
  accountBalanceRowsForMonthClose(period: string): Promise<AccountBalanceCheckRow[]>;
  pendingCostRowsForMonthClose(period: string): Promise<PendingCostCheckRow[]>;
  loanAgingRowsForMonthClose(period: string): Promise<LoanAgingCheckRow[]>;
  projectIntegrityRows(period: string): Promise<ProjectIntegrityCheckRow[]>;
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
    this.checkOptions = { ...defaultMonthCloseCheckOptions, ...options.checkOptions };
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

      await this.monthCloses.completeRun({
        runId: run.id,
        canLock,
        ...summary,
        finishedAt: options.finishedAt
      });

      return { run, checks, summary, canLock };
    } catch (error) {
      await this.monthCloses.failRun({
        runId: run.id,
        errorMessage: errorMessage(error),
        finishedAt: options.finishedAt
      });
      throw error;
    }
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
