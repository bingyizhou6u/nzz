import { describe, expect, it, vi } from "vitest";
import type {
  InsertCheckResultInput,
  MonthCloseCheckResultRow,
  MonthCloseRunRow
} from "../../src/repositories/monthCloseRepository";
import { MonthCloseService } from "../../src/services/monthCloseService";
import type { MonthCloseCheckOptions } from "../../src/services/monthCloseChecks";

type MonthCloseRepoMock = ConstructorParameters<typeof MonthCloseService>[0] & {
  createRun: ReturnType<typeof vi.fn>;
  completeRun: ReturnType<typeof vi.fn>;
  failRun: ReturnType<typeof vi.fn>;
  insertCheckResults: ReturnType<typeof vi.fn>;
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
    ...input.sources
  } satisfies MonthCloseSourceMock;

  return {
    monthCloses,
    sources,
    service: new MonthCloseService(monthCloses, sources, { checkOptions })
  };
}

function runRow(): MonthCloseRunRow {
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
    error_message: null
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
