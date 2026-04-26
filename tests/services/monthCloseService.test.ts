import { describe, expect, it, vi } from "vitest";
import type {
  InsertCheckResultInput,
  MonthCloseCheckResultRow,
  MonthCloseSnapshotRow,
  MonthCloseRunRow
} from "../../src/repositories/monthCloseRepository";
import type { PeriodLockRow } from "../../src/repositories/periodLockRepository";
import { MonthCloseService } from "../../src/services/monthCloseService";
import type { MonthCloseCheckOptions } from "../../src/services/monthCloseChecks";

type MonthCloseRepoMock = ConstructorParameters<typeof MonthCloseService>[0] & {
  createRun: ReturnType<typeof vi.fn>;
  completeRun: ReturnType<typeof vi.fn>;
  failRun: ReturnType<typeof vi.fn>;
  insertCheckResults: ReturnType<typeof vi.fn>;
  latestRun: ReturnType<typeof vi.fn>;
  listCheckResults: ReturnType<typeof vi.fn>;
  getPeriodLock: ReturnType<typeof vi.fn>;
  nextSnapshotVersion: ReturnType<typeof vi.fn>;
  lockWithSnapshotAndAudit: ReturnType<typeof vi.fn>;
  unlockPeriodWithAudit: ReturnType<typeof vi.fn>;
};

type MonthCloseSourceMock = ConstructorParameters<typeof MonthCloseService>[1] & {
  documentWorkflowRows: ReturnType<typeof vi.fn>;
  accountBalanceRowsForMonthClose: ReturnType<typeof vi.fn>;
  pendingCostRowsForMonthClose: ReturnType<typeof vi.fn>;
  loanAgingRowsForMonthClose: ReturnType<typeof vi.fn>;
  projectIntegrityRows: ReturnType<typeof vi.fn>;
  monthCloseFundingReconciliation: ReturnType<typeof vi.fn>;
  monthClosePettyCashReconciliation: ReturnType<typeof vi.fn>;
  monthCloseLoanReconciliation: ReturnType<typeof vi.fn>;
  monthCloseProjectReconciliation: ReturnType<typeof vi.fn>;
  accountBalances: ReturnType<typeof vi.fn>;
  lotBalances: ReturnType<typeof vi.fn>;
  lotMovements: ReturnType<typeof vi.fn>;
  pettyCashPendingMatches: ReturnType<typeof vi.fn>;
  pendingCostMatches: ReturnType<typeof vi.fn>;
  loanBalances: ReturnType<typeof vi.fn>;
  loanAging: ReturnType<typeof vi.fn>;
  projectProfitLoss: ReturnType<typeof vi.fn>;
  projectIncome: ReturnType<typeof vi.fn>;
  merchantIncome: ReturnType<typeof vi.fn>;
  expenseDetails: ReturnType<typeof vi.fn>;
  expenseSummary: ReturnType<typeof vi.fn>;
  monthlyOperatingSummary: ReturnType<typeof vi.fn>;
  exceptionChecks: ReturnType<typeof vi.fn>;
};

const checkOptions: MonthCloseCheckOptions = {
  staleDays: 7,
  stalePendingCostDays: 10,
  staleLoanDays: 30,
  pettyCashNegativeCriticalDays: 14,
  pettyCashNegativeCriticalAmountMinor: 100000
};

const period = "2026-04";
const actor = { personId: "person_finance" };
const startedAt = "2026-04-30T08:00:00.000Z";
const finishedAt = "2026-04-30T08:01:00.000Z";

describe("MonthCloseService", () => {
  it("creates a running run, persists generated checks, and completes with critical blockers", async () => {
    const { monthCloses, sources, service } = createMocks({
      sources: {
        documentWorkflowRows: vi.fn(async () => [
          {
            id: "doc_pending",
            status: "pending",
            period,
            businessDate: "2026-04-26",
            createdAt: "2026-04-26T00:00:00.000Z",
            submittedAt: "2026-04-26T01:00:00.000Z"
          }
        ])
      },
      insertedRows: [insertedCheckRow({ check_type: "pending_document", severity: "critical", entity_id: "doc_pending" })]
    });

    const result = await service.runChecks(period, actor, { startedAt, finishedAt });

    expect(monthCloses.createRun).toHaveBeenCalledWith({ period, startedBy: actor.personId, startedAt });
    expect(sources.documentWorkflowRows).toHaveBeenCalledWith(period);
    expect(sources.accountBalanceRowsForMonthClose).toHaveBeenCalledWith(period);
    expect(sources.pendingCostRowsForMonthClose).toHaveBeenCalledWith(period);
    expect(sources.loanAgingRowsForMonthClose).toHaveBeenCalledWith(period);
    expect(sources.projectIntegrityRows).toHaveBeenCalledWith(period);
    expect(monthCloses.insertCheckResults).toHaveBeenCalledWith(
      "run_1",
      period,
      expect.arrayContaining([
        expect.objectContaining({
          checkType: "pending_document",
          severity: "critical",
          entityType: "document",
          entityId: "doc_pending"
        })
      ])
    );
    expect(monthCloses.completeRun).toHaveBeenCalledWith({
      runId: "run_1",
      canLock: false,
      criticalCount: 1,
      warningCount: 0,
      infoCount: 0,
      finishedAt
    });
    expect(monthCloses.failRun).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      run: {
        status: "completed",
        can_lock: 0,
        critical_count: 1,
        warning_count: 0,
        info_count: 0,
        finished_at: finishedAt
      },
      canLock: false,
      summary: { criticalCount: 1, warningCount: 0, infoCount: 0 }
    });
  });

  it("keeps canLock false when open warnings remain", async () => {
    const { monthCloses, service } = createMocks({
      sources: {
        accountBalanceRowsForMonthClose: vi.fn(async () => [
          {
            accountId: "acct_petty",
            accountType: "petty_cash",
            ownerPersonId: "person_ops",
            isCompanyAccount: false,
            allowNegative: true,
            currencyCode: "AED",
            balanceMinor: -500
          }
        ])
      },
      insertedRows: [insertedCheckRow({ check_type: "negative_petty_cash", severity: "warning", entity_id: "acct_petty" })]
    });

    const result = await service.runChecks(period, actor, { startedAt, finishedAt });

    expect(monthCloses.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        canLock: false,
        criticalCount: 0,
        warningCount: 1,
        infoCount: 0
      })
    );
    expect(monthCloses.insertCheckResults).toHaveBeenCalledWith(
      "run_1",
      period,
      expect.arrayContaining([
        expect.objectContaining({
          checkType: "negative_petty_cash",
          severity: "warning",
          entityId: "acct_petty"
        })
      ])
    );
    expect(result.canLock).toBe(false);
  });

  it("allows locking when only informational checks are open", async () => {
    const { monthCloses, service } = createMocks({
      sources: {
        documentWorkflowRows: vi.fn(async () => [
          {
            id: "doc_draft",
            status: "draft",
            period,
            businessDate: "2026-04-20",
            createdAt: "2026-04-20T00:00:00.000Z",
            submittedAt: null
          }
        ])
      },
      insertedRows: [insertedCheckRow({ check_type: "draft_document", severity: "info", entity_id: "doc_draft" })]
    });

    const result = await service.runChecks(period, actor, { startedAt, finishedAt });

    expect(monthCloses.completeRun).toHaveBeenCalledWith(
      expect.objectContaining({
        canLock: true,
        criticalCount: 0,
        warningCount: 0,
        infoCount: 1
      })
    );
    expect(monthCloses.insertCheckResults).toHaveBeenCalledWith(
      "run_1",
      period,
      expect.arrayContaining([
        expect.objectContaining({
          checkType: "draft_document",
          severity: "info",
          entityId: "doc_draft"
        })
      ])
    );
    expect(result.canLock).toBe(true);
  });

  it("marks the run as failed and rethrows when source queries fail", async () => {
    const { monthCloses, service } = createMocks({
      sources: {
        documentWorkflowRows: vi.fn(async () => {
          throw new Error("source unavailable");
        })
      }
    });

    await expect(service.runChecks(period, actor, { startedAt, finishedAt })).rejects.toThrow("source unavailable");

    expect(monthCloses.insertCheckResults).not.toHaveBeenCalled();
    expect(monthCloses.completeRun).not.toHaveBeenCalled();
    expect(monthCloses.failRun).toHaveBeenCalledWith({
      runId: "run_1",
      errorMessage: "source unavailable",
      finishedAt
    });
  });

  it("marks the run as failed and rethrows when persisting check results fails", async () => {
    const { monthCloses, service } = createMocks({
      sources: {
        documentWorkflowRows: vi.fn(async () => [
          {
            id: "doc_pending",
            status: "pending",
            period,
            businessDate: "2026-04-26",
            createdAt: "2026-04-26T00:00:00.000Z",
            submittedAt: null
          }
        ])
      },
      monthCloses: {
        insertCheckResults: vi.fn(async () => {
          throw new Error("insert failed");
        })
      }
    });

    await expect(service.runChecks(period, actor, { startedAt, finishedAt })).rejects.toThrow("insert failed");

    expect(monthCloses.completeRun).not.toHaveBeenCalled();
    expect(monthCloses.failRun).toHaveBeenCalledWith({
      runId: "run_1",
      errorMessage: "insert failed",
      finishedAt
    });
  });

  it("preserves the original error if marking the run as failed also fails", async () => {
    const { service } = createMocks({
      sources: {
        documentWorkflowRows: vi.fn(async () => {
          throw new Error("source unavailable");
        })
      },
      monthCloses: {
        failRun: vi.fn(async () => {
          throw new Error("failRun unavailable");
        })
      }
    });

    await expect(service.runChecks(period, actor, { startedAt, finishedAt })).rejects.toThrow("source unavailable");
  });

  it("returns reconciliation tabs without mixing source currencies", async () => {
    const { sources, service } = createMocks({
      sources: {
        monthCloseFundingReconciliation: vi.fn(async () => [
          reconciliationFundingRow({ accountId: "acct_usdt", currencyCode: "USDT", closingBalanceMinor: 20000 }),
          reconciliationFundingRow({ accountId: "acct_aed", currencyCode: "AED", closingBalanceMinor: 73400 })
        ]),
        monthClosePettyCashReconciliation: vi.fn(async () => [
          reconciliationPettyCashRow({ personId: "person_ops", currencyCode: "AED", pendingCostMinor: 15000 })
        ]),
        monthCloseLoanReconciliation: vi.fn(async () => [
          reconciliationLoanRow({ borrowerPersonId: "person_borrower", currencyCode: "USDT", closingBalanceMinor: 100000 })
        ]),
        monthCloseProjectReconciliation: vi.fn(async () => [
          reconciliationProjectRow({ projectId: "project_alpha", currencyCode: "USDT", incomeAmountMinor: 500000 }),
          reconciliationProjectRow({ projectId: "project_alpha", currencyCode: "AED", expenseAmountMinor: 215000 })
        ])
      }
    });

    await expect(service.reconciliation(period)).resolves.toEqual({
      funding: [
        expect.objectContaining({ accountId: "acct_usdt", currencyCode: "USDT" }),
        expect.objectContaining({ accountId: "acct_aed", currencyCode: "AED" })
      ],
      pettyCash: [expect.objectContaining({ personId: "person_ops", currencyCode: "AED" })],
      loans: [expect.objectContaining({ borrowerPersonId: "person_borrower", currencyCode: "USDT" })],
      projects: [
        expect.objectContaining({ projectId: "project_alpha", currencyCode: "USDT", incomeAmountMinor: 500000 }),
        expect.objectContaining({ projectId: "project_alpha", currencyCode: "AED", expenseAmountMinor: 215000 })
      ]
    });
    expect(sources.monthCloseFundingReconciliation).toHaveBeenCalledWith(period);
    expect(sources.monthClosePettyCashReconciliation).toHaveBeenCalledWith(period);
    expect(sources.monthCloseLoanReconciliation).toHaveBeenCalledWith(period);
    expect(sources.monthCloseProjectReconciliation).toHaveBeenCalledWith(period);
  });

  it("locks a period after latest checks are handled and snapshots formal reports", async () => {
    const auditStatement = fakeAuditStatement();
    const handledChecks = [
      insertedCheckRow({ id: "check_critical", severity: "critical", status: "resolved" }),
      insertedCheckRow({ id: "check_warning", severity: "warning", status: "acknowledged" }),
      insertedCheckRow({ id: "check_info", severity: "info", status: "open" })
    ];
    const snapshot = snapshotRow();
    const { monthCloses, sources, service } = createMocks({
      monthCloses: {
        latestRun: vi.fn(async () =>
          runRow({
            status: "completed",
            can_lock: 1,
            critical_count: 1,
            warning_count: 1,
            info_count: 1,
            finished_at: finishedAt
          })
        ),
        listCheckResults: vi.fn(async () => handledChecks),
        nextSnapshotVersion: vi.fn(async () => 1),
        lockWithSnapshotAndAudit: vi.fn(async () => snapshot)
      },
      sources: {
        accountBalances: vi.fn(async () => [{ account_id: "acct_usdt", currency_code: "USDT", balance_minor: 10000 }]),
        projectIncome: vi.fn(async () => [{ period, project_id: "project_alpha", income_usdt_minor: 50000 }]),
        exceptionChecks: vi.fn(async () => [{ exception_type: "info_only", severity: "info" }]),
        monthCloseFundingReconciliation: vi.fn(async () => [
          reconciliationFundingRow({ accountId: "acct_usdt", closingBalanceMinor: 10000 })
        ])
      }
    });

    const result = await service.lockPeriod(period, actor, {
      note: "  close April  ",
      lockedAt: finishedAt,
      auditStatement
    });

    expect(monthCloses.latestRun).toHaveBeenCalledWith(period);
    expect(monthCloses.listCheckResults).toHaveBeenCalledWith(period, "run_1");
    expect(monthCloses.getPeriodLock).toHaveBeenCalledWith(period);
    expect(monthCloses.nextSnapshotVersion).toHaveBeenCalledWith(period);
    expect(sources.projectIncome).toHaveBeenCalledWith({ period });
    expect(sources.monthCloseFundingReconciliation).toHaveBeenCalledWith(period);

    const firstLockCall = monthCloses.lockWithSnapshotAndAudit.mock.calls[0] as unknown as
      | [
          {
            reports: Array<{ reportKey: string; rows: unknown[] }>;
            period: string;
            version: number;
            runId: string;
            lockedBy: string;
            lockedAt: string;
            note: string;
            summary: { criticalCount: number; warningCount: number; infoCount: number };
          },
          D1PreparedStatement
        ]
      | undefined;
    expect(firstLockCall).toBeDefined();
    if (!firstLockCall) throw new Error("lockWithSnapshotAndAudit was not called");
    const [snapshotInput, auditInput] = firstLockCall;
    expect(auditInput).toBe(auditStatement);
    expect(snapshotInput).toMatchObject({
      period,
      version: 1,
      runId: "run_1",
      lockedBy: actor.personId,
      lockedAt: finishedAt,
      note: "close April",
      summary: { criticalCount: 1, warningCount: 1, infoCount: 1 }
    });
    expect(snapshotInput.reports.map((report: { reportKey: string }) => report.reportKey)).toEqual([
      "accountBalances",
      "lotBalances",
      "lotMovements",
      "pettyCashPending",
      "pendingCosts",
      "loanBalances",
      "loanAging",
      "projectProfitLoss",
      "projectIncome",
      "merchantIncome",
      "expenseDetails",
      "expenseSummary",
      "monthlyOperatingSummary",
      "exceptionChecks",
      "monthCloseChecks",
      "monthCloseReconciliation"
    ]);
    expect(snapshotInput.reports.find((report: { reportKey: string }) => report.reportKey === "monthCloseChecks")?.rows).toEqual(
      handledChecks
    );
    expect(
      snapshotInput.reports.find((report: { reportKey: string }) => report.reportKey === "monthCloseReconciliation")?.rows
    ).toEqual([
      {
        funding: [expect.objectContaining({ accountId: "acct_usdt" })],
        pettyCash: [],
        loans: [],
        projects: []
      }
    ]);
    expect(result).toEqual({ period, status: "locked", snapshot });
  });

  it("rejects locking when latest checks still contain unhandled blockers", async () => {
    const auditStatement = fakeAuditStatement();
    const { monthCloses, service } = createMocks({
      monthCloses: {
        latestRun: vi.fn(async () => runRow({ status: "completed", finished_at: finishedAt })),
        listCheckResults: vi.fn(async () => [insertedCheckRow({ severity: "critical", status: "open" })])
      }
    });

    await expect(service.lockPeriod(period, actor, { note: "close April", auditStatement })).rejects.toThrow(
      "Month close checks are not lockable"
    );

    expect(monthCloses.lockWithSnapshotAndAudit).not.toHaveBeenCalled();
  });

  it("unlocks a period through the month-close lock repository without deleting snapshots", async () => {
    const auditStatement = fakeAuditStatement();
    const lock = periodLockRow();
    const { monthCloses, service } = createMocks({
      monthCloses: {
        getPeriodLock: vi.fn(async () => lock)
      }
    });

    await expect(service.unlockPeriod(period, { auditStatement })).resolves.toEqual({
      period,
      status: "unlocked"
    });

    expect(monthCloses.getPeriodLock).toHaveBeenCalledWith(period);
    expect(monthCloses.unlockPeriodWithAudit).toHaveBeenCalledWith(lock, auditStatement);
  });
});

function createMocks(input: {
  monthCloses?: Partial<MonthCloseRepoMock>;
  sources?: Partial<MonthCloseSourceMock>;
  insertedRows?: MonthCloseCheckResultRow[];
} = {}) {
  const insertedRows = input.insertedRows ?? [];
  const monthCloses = {
    createRun: vi.fn(async () => runRow()),
    insertCheckResults: vi.fn(async (runId: string, closePeriod: string, rows: InsertCheckResultInput[]) =>
      input.insertedRows ? insertedRows : rows.map((row, index) => insertedCheckRowFromInput(runId, closePeriod, row, index))
    ),
    completeRun: vi.fn(async () => undefined),
    failRun: vi.fn(async () => undefined),
    latestRun: vi.fn(async () => runRow({ status: "completed", finished_at: finishedAt })),
    listCheckResults: vi.fn(async () => []),
    getPeriodLock: vi.fn(async () => null),
    nextSnapshotVersion: vi.fn(async () => 1),
    lockWithSnapshotAndAudit: vi.fn(async () => snapshotRow()),
    unlockPeriodWithAudit: vi.fn(async () => undefined),
    ...input.monthCloses
  } satisfies MonthCloseRepoMock;
  const sources = {
    documentWorkflowRows: vi.fn(async () => []),
    accountBalanceRowsForMonthClose: vi.fn(async () => []),
    pendingCostRowsForMonthClose: vi.fn(async () => []),
    loanAgingRowsForMonthClose: vi.fn(async () => []),
    projectIntegrityRows: vi.fn(async () => []),
    monthCloseFundingReconciliation: vi.fn(async () => []),
    monthClosePettyCashReconciliation: vi.fn(async () => []),
    monthCloseLoanReconciliation: vi.fn(async () => []),
    monthCloseProjectReconciliation: vi.fn(async () => []),
    accountBalances: vi.fn(async () => []),
    lotBalances: vi.fn(async () => []),
    lotMovements: vi.fn(async () => []),
    pettyCashPendingMatches: vi.fn(async () => []),
    pendingCostMatches: vi.fn(async () => []),
    loanBalances: vi.fn(async () => []),
    loanAging: vi.fn(async () => []),
    projectProfitLoss: vi.fn(async () => []),
    projectIncome: vi.fn(async () => []),
    merchantIncome: vi.fn(async () => []),
    expenseDetails: vi.fn(async () => []),
    expenseSummary: vi.fn(async () => []),
    monthlyOperatingSummary: vi.fn(async () => []),
    exceptionChecks: vi.fn(async () => []),
    ...input.sources
  } satisfies MonthCloseSourceMock;

  return {
    monthCloses,
    sources,
    service: new MonthCloseService(monthCloses, sources, { checkOptions })
  };
}

function runRow(overrides: Partial<MonthCloseRunRow> = {}): MonthCloseRunRow {
  return {
    id: "run_1",
    period,
    status: "running",
    can_lock: 0,
    critical_count: 0,
    warning_count: 0,
    info_count: 0,
    started_by: actor.personId,
    started_at: startedAt,
    finished_at: null,
    error_message: null,
    ...overrides
  };
}

function insertedCheckRow(overrides: Partial<MonthCloseCheckResultRow> = {}): MonthCloseCheckResultRow {
  return {
    id: "check_1",
    run_id: "run_1",
    period,
    check_type: "pending_document",
    severity: "critical",
    entity_type: "document",
    entity_id: "doc_pending",
    business_date: "2026-04-26",
    currency_code: null,
    amount_minor: null,
    usdt_cost_minor: null,
    message: "message",
    suggested_action: "action",
    status: "open",
    assignee_person_id: null,
    resolved_by: null,
    resolved_at: null,
    resolution_note: null,
    created_at: startedAt,
    ...overrides
  };
}

function insertedCheckRowFromInput(
  runId: string,
  closePeriod: string,
  row: InsertCheckResultInput,
  index: number
): MonthCloseCheckResultRow {
  return {
    id: `check_${index + 1}`,
    run_id: runId,
    period: closePeriod,
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
    created_at: row.createdAt ?? startedAt
  };
}

function reconciliationFundingRow(overrides: Record<string, unknown> = {}) {
  return {
    accountId: "acct_main",
    accountType: "currency_reserve",
    currencyCode: "USDT",
    openingBalanceMinor: 0,
    periodInflowMinor: 0,
    periodOutflowMinor: 0,
    closingBalanceMinor: 0,
    ...overrides
  };
}

function reconciliationPettyCashRow(overrides: Record<string, unknown> = {}) {
  return {
    personId: "person_ops",
    accountId: "acct_petty",
    currencyCode: "AED",
    openingBalanceMinor: 0,
    periodIssuedMinor: 0,
    periodReimbursedMinor: 0,
    closingBalanceMinor: 0,
    pendingCostMinor: 0,
    ...overrides
  };
}

function reconciliationLoanRow(overrides: Record<string, unknown> = {}) {
  return {
    borrowerPersonId: "person_borrower",
    currencyCode: "USDT",
    openingBalanceMinor: 0,
    periodLoanOutMinor: 0,
    periodRepaymentMinor: 0,
    periodWriteoffMinor: 0,
    closingBalanceMinor: 0,
    ...overrides
  };
}

function reconciliationProjectRow(overrides: Record<string, unknown> = {}) {
  return {
    projectId: "project_alpha",
    currencyCode: "USDT",
    incomeAmountMinor: 0,
    expenseAmountMinor: 0,
    matchedUsdtCostMinor: 0,
    pendingAmountMinor: 0,
    ...overrides
  };
}

function snapshotRow(overrides: Partial<MonthCloseSnapshotRow> = {}): MonthCloseSnapshotRow {
  return {
    id: "snapshot_1",
    period,
    version: 1,
    run_id: "run_1",
    locked_by: actor.personId,
    locked_at: finishedAt,
    note: "close April",
    summary_json: JSON.stringify({ criticalCount: 1, warningCount: 1, infoCount: 1 }),
    ...overrides
  };
}

function periodLockRow(overrides: Partial<PeriodLockRow> = {}): PeriodLockRow {
  return {
    period,
    locked_by: actor.personId,
    locked_at: finishedAt,
    note: "close April",
    ...overrides
  };
}

function fakeAuditStatement(): D1PreparedStatement {
  return {} as D1PreparedStatement;
}
