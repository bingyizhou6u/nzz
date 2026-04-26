import { describe, expect, it } from "vitest";
import { ReportRepository } from "../../src/repositories/reportRepository";

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

function mockDb(rows: unknown[], onSql: (sql: string) => void, onBind: (values: unknown[]) => void = () => {}): D1Database {
  return {
    prepare: (sql: string) => {
      onSql(sql);
      return {
        bind(...values: unknown[]) {
          onBind(values);
          return this;
        },
        all: async () => ({ success: true, results: rows })
      } as unknown as D1PreparedStatement;
    }
  } as unknown as D1Database;
}

interface SqliteStatement {
  all(...values: unknown[]): Record<string, unknown>[];
  get(...values: unknown[]): Record<string, unknown> | undefined;
  run(...values: unknown[]): unknown;
}

interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

type SqliteModule = {
  DatabaseSync: new (filename: string) => SqliteDatabase;
};

const importSqlite = new Function("specifier", "return import(specifier)") as (
  specifier: string
) => Promise<SqliteModule>;

async function createSqliteReportDb(): Promise<{ db: D1Database; exec: (sql: string) => void; close: () => void }> {
  const { DatabaseSync } = await importSqlite("node:sqlite");
  const sqlite = new DatabaseSync(":memory:");

  sqlite.exec(`
    CREATE TABLE documents (
      id TEXT PRIMARY KEY,
      document_type TEXT NOT NULL,
      action_type TEXT NOT NULL DEFAULT 'normal',
      business_date TEXT NOT NULL,
      period TEXT NOT NULL,
      operator_person_id TEXT,
      project_id TEXT,
      merchant_id TEXT,
      category_id TEXT,
      status TEXT NOT NULL,
      original_document_id TEXT,
      created_at TEXT NOT NULL DEFAULT '2026-04-25T00:00:00Z',
      submitted_at TEXT
    );

    CREATE TABLE document_lines (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      account_id TEXT,
      counterparty_account_id TEXT,
      person_id TEXT,
      borrower_person_id TEXT,
      currency_code TEXT NOT NULL,
      amount_minor INTEGER NOT NULL
    );

    CREATE TABLE lot_movements (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      movement_type TEXT NOT NULL,
      usdt_cost_minor INTEGER NOT NULL
    );

    CREATE TABLE pending_cost_matches (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      person_id TEXT NOT NULL DEFAULT '',
      account_id TEXT NOT NULL DEFAULT '',
      currency_code TEXT NOT NULL DEFAULT '',
      amount_minor INTEGER NOT NULL DEFAULT 0,
      remaining_amount_minor INTEGER NOT NULL,
      expense_date TEXT NOT NULL DEFAULT '1970-01-01',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT '2026-04-25T00:00:00Z'
    );

    CREATE TABLE pending_cost_applications (
      id TEXT PRIMARY KEY,
      pending_cost_match_id TEXT NOT NULL,
      document_id TEXT NOT NULL,
      usdt_cost_minor INTEGER NOT NULL
    );

    CREATE TABLE loan_items (
      id TEXT PRIMARY KEY,
      source_document_id TEXT NOT NULL DEFAULT '',
      source_line_id TEXT NOT NULL DEFAULT '',
      borrower_person_id TEXT NOT NULL,
      currency_code TEXT NOT NULL,
      original_amount_minor INTEGER NOT NULL DEFAULT 0,
      remaining_amount_minor INTEGER NOT NULL DEFAULT 0,
      original_usdt_cost_minor INTEGER NOT NULL DEFAULT 0,
      remaining_usdt_cost_minor INTEGER NOT NULL DEFAULT 0,
      loan_date TEXT NOT NULL DEFAULT '1970-01-01',
      status TEXT NOT NULL DEFAULT 'open',
      created_at TEXT NOT NULL DEFAULT '2026-04-25T00:00:00Z'
    );

    CREATE TABLE loan_allocations (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      loan_item_id TEXT NOT NULL,
      allocation_type TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      usdt_cost_minor INTEGER NOT NULL,
      allocation_date TEXT NOT NULL DEFAULT '1970-01-01',
      created_at TEXT NOT NULL DEFAULT '2026-04-25T00:00:00Z'
    );

    CREATE TABLE account_entries (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      account_id TEXT,
      currency_code TEXT NOT NULL,
      amount_minor INTEGER NOT NULL,
      entry_date TEXT NOT NULL DEFAULT '1970-01-01',
      created_at TEXT NOT NULL DEFAULT '2026-04-25T00:00:00Z'
    );

    CREATE TABLE accounts (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      account_type TEXT NOT NULL,
      currency_code TEXT NOT NULL,
      owner_person_id TEXT,
      is_company_account INTEGER NOT NULL DEFAULT 1,
      allow_negative INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TEXT NOT NULL DEFAULT '2026-04-25T00:00:00Z'
    );

    CREATE TABLE merchants (
      id TEXT PRIMARY KEY,
      code TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      project_id TEXT NOT NULL,
      merchant_type TEXT,
      status TEXT NOT NULL DEFAULT 'active'
    );
  `);

  return {
    db: {
      prepare: (sql: string) => {
        let bindings: unknown[] = [];

        return {
          bind(...values: unknown[]) {
            bindings = values;
            return this;
          },
          all: async () => {
            try {
              return { success: true, results: sqlite.prepare(sql).all(...bindings) };
            } catch (error) {
              return { success: false, error: error instanceof Error ? error.message : String(error), results: [] };
            }
          },
          first: async () => {
            try {
              return { success: true, results: sqlite.prepare(sql).get(...bindings) ?? null };
            } catch (error) {
              return { success: false, error: error instanceof Error ? error.message : String(error), results: null };
            }
          },
          run: async () => {
            try {
              sqlite.prepare(sql).run(...bindings);
              return { success: true } as D1Result;
            } catch (error) {
              return {
                success: false,
                error: error instanceof Error ? error.message : String(error)
              } as unknown as D1Result;
            }
          }
        } as unknown as D1PreparedStatement;
      }
    } as unknown as D1Database,
    exec: (sql: string) => sqlite.exec(sql),
    close: () => sqlite.close()
  };
}

describe("ReportRepository", () => {
  it("returns account balance rows grouped and ordered by account and currency", async () => {
    const rows = [{ account_id: "acct_1", currency_code: "AED", balance_minor: 1250 }];
    let sql = "";
    const repo = new ReportRepository(mockDb(rows, (value) => (sql = value)));

    await expect(repo.accountBalances()).resolves.toEqual(rows);

    const normalized = normalizeSql(sql);
    expect(normalized).toContain("from account_entries ae");
    expect(normalized).toContain("join documents d on d.id = ae.document_id");
    expect(normalized).toContain("where d.status = 'approved'");
    expect(normalized).toContain("coalesce(sum(ae.amount_minor), 0) as balance_minor");
    expect(normalized).toContain("group by ae.account_id, ae.currency_code");
    expect(normalized).toContain("order by ae.account_id, ae.currency_code");
  });

  it("returns open pending cost matches grouped and ordered by person, account, and currency", async () => {
    const rows = [
      { person_id: "person_1", account_id: "acct_1", currency_code: "USDT", remaining_amount_minor: 5000 }
    ];
    let sql = "";
    const repo = new ReportRepository(mockDb(rows, (value) => (sql = value)));

    await expect(repo.pettyCashPendingMatches()).resolves.toEqual(rows);

    const normalized = normalizeSql(sql);
    expect(normalized).toContain("from pending_cost_matches pcm");
    expect(normalized).toContain("join documents d on d.id = pcm.document_id");
    expect(normalized).toContain("sum(pcm.remaining_amount_minor) as remaining_amount_minor");
    expect(normalized).toContain("pcm.status in ('open', 'partial')");
    expect(normalized).toContain("d.status = 'approved'");
    expect(normalized).toContain("group by pcm.person_id, pcm.account_id, pcm.currency_code");
    expect(normalized).toContain("order by pcm.person_id, pcm.account_id, pcm.currency_code");
  });

  it("returns loan balance rows grouped and ordered by borrower and currency", async () => {
    const rows = [{ borrower_person_id: "person_1", currency_code: "AED", balance_minor: 750 }];
    let sql = "";
    const repo = new ReportRepository(mockDb(rows, (value) => (sql = value)));

    await expect(repo.loanBalances()).resolves.toEqual(rows);

    const normalized = normalizeSql(sql);
    expect(normalized).toContain("from loan_entries le");
    expect(normalized).toContain("join documents d on d.id = le.document_id");
    expect(normalized).toContain("where d.status = 'approved'");
    expect(normalized).toContain("sum(le.amount_minor)");
    expect(normalized).toContain("as balance_minor");
    expect(normalized).toContain("group by le.borrower_person_id, le.currency_code");
    expect(normalized).toContain("order by le.borrower_person_id, le.currency_code");
  });

  it("builds month close funding reconciliation by period and original currency", async () => {
    const rows = [
      {
        accountId: "acct_usdt",
        accountType: "usdt_wallet",
        currencyCode: "USDT",
        openingBalanceMinor: 10000,
        periodInflowMinor: 5000,
        periodOutflowMinor: 2000,
        closingBalanceMinor: 13000
      }
    ];
    let sql = "";
    let bindings: unknown[] = [];
    const repo = new ReportRepository(mockDb(rows, (value) => (sql = value), (values) => (bindings = values)));

    await expect(repo.monthCloseFundingReconciliation("2026-04")).resolves.toEqual(rows);

    const normalized = normalizeSql(sql);
    expect(normalized).toContain("funding_reconciliation_rows");
    expect(normalized).toContain("with selected_period(period) as (select ?)");
    expect(normalized).toContain("d.period < selected_period.period");
    expect(normalized).toContain("d.period = selected_period.period");
    expect(normalized).toContain("group by a.id, a.account_type, ae.currency_code");
    expect(bindings).toEqual(["2026-04"]);
  });

  it("returns open lot balance rows ordered by account, currency, date, and id", async () => {
    const rows = [
      {
        id: "lot_1",
        currency_code: "AED",
        remaining_amount_minor: 2500,
        remaining_usdt_cost_minor: 681,
        source_document_id: "doc_1",
        current_account_id: "acct_1",
        current_person_id: null,
        lot_date: "2026-04-24",
        status: "open"
      }
    ];
    let sql = "";
    const repo = new ReportRepository(mockDb(rows, (value) => (sql = value)));

    await expect(repo.lotBalances()).resolves.toEqual(rows);

    const normalized = normalizeSql(sql);
    expect(normalized).toContain("from lots");
    expect(normalized).toContain("where remaining_amount_minor > 0");
    expect(normalized).toContain("order by current_account_id, currency_code, lot_date, id");
  });

  it("returns lot movement rows ordered by latest movement and creation time", async () => {
    const rows = [
      {
        id: "movement_1",
        lot_id: "lot_1",
        document_id: "doc_1",
        movement_type: "created",
        from_account_id: null,
        to_account_id: "acct_1",
        from_person_id: null,
        to_person_id: null,
        amount_minor: 2500,
        usdt_cost_minor: 681,
        movement_date: "2026-04-24",
        created_at: "2026-04-24T10:00:00Z"
      }
    ];
    let sql = "";
    const repo = new ReportRepository(mockDb(rows, (value) => (sql = value)));

    await expect(repo.lotMovements()).resolves.toEqual(rows);

    const normalized = normalizeSql(sql);
    expect(normalized).toContain("from lot_movements");
    expect(normalized).toContain("order by movement_date desc, created_at desc");
  });

  it("returns pending cost rows with remaining amounts ordered by expense date and creation time", async () => {
    const rows = [
      {
        id: "pending_1",
        document_id: "doc_1",
        person_id: "person_1",
        account_id: "acct_1",
        currency_code: "AED",
        amount_minor: 2500,
        remaining_amount_minor: 2500,
        expense_date: "2026-04-24",
        status: "open",
        created_at: "2026-04-24T10:00:00Z"
      }
    ];
    let sql = "";
    const repo = new ReportRepository(mockDb(rows, (value) => (sql = value)));

    await expect(repo.pendingCostMatches()).resolves.toEqual(rows);

    const normalized = normalizeSql(sql);
    expect(normalized).toContain("from pending_cost_matches pcm");
    expect(normalized).toContain("join documents d on d.id = pcm.document_id");
    expect(normalized).toContain("d.status = 'approved'");
    expect(normalized).toContain("pcm.status in ('open', 'partial')");
    expect(normalized).toContain("pcm.remaining_amount_minor > 0");
    expect(normalized).toContain("order by pcm.expense_date, pcm.created_at");
  });

  it("returns open loan items for aging ordered by oldest loan date", async () => {
    const rows = [
      {
        loan_item_id: "loan_item_1",
        source_document_id: "doc_loan",
        borrower_person_id: "person_1",
        currency_code: "AED",
        remaining_amount_minor: 100000,
        remaining_usdt_cost_minor: 27000,
        loan_date: "2026-04-01",
        age_days: 24
      }
    ];
    let sql = "";
    const repo = new ReportRepository(mockDb(rows, (value) => (sql = value)));

    await expect(repo.loanAging()).resolves.toEqual(rows);

    const normalized = normalizeSql(sql);
    expect(normalized).toContain("from loan_items li");
    expect(normalized).toContain("li.status in ('open', 'partial')");
    expect(normalized).toContain("li.remaining_amount_minor > 0");
    expect(normalized).toContain("order by li.loan_date, li.created_at, li.id");
  });

  it("returns loan allocation detail", async () => {
    const rows = [{ allocation_id: "loan_alloc_1", document_id: "doc_repay", loan_item_id: "loan_item_1" }];
    let sql = "";
    const repo = new ReportRepository(mockDb(rows, (value) => (sql = value)));

    await expect(repo.loanAllocations()).resolves.toEqual(rows);

    const normalized = normalizeSql(sql);
    expect(normalized).toContain("from loan_allocations la");
    expect(normalized).toContain("join loan_items li on li.id = la.loan_item_id");
    expect(normalized).toContain("join documents d on d.id = la.document_id");
    expect(normalized).toContain("where d.status = 'approved'");
  });

  it("returns loan writeoff report rows", async () => {
    const rows = [{ document_id: "doc_writeoff", borrower_person_id: "person_1", usdt_cost_minor: 27000 }];
    let sql = "";
    const repo = new ReportRepository(mockDb(rows, (value) => (sql = value)));

    await expect(repo.loanWriteoffs()).resolves.toEqual(rows);

    const normalized = normalizeSql(sql);
    expect(normalized).toContain("la.allocation_type = 'writeoff'");
    expect(normalized).toContain("d.document_type = 'loan_writeoff'");
    expect(normalized).toContain("not exists");
    expect(normalized).toContain("reversal.original_document_id = d.id");
    expect(normalized).toContain("reversal.action_type = 'reversal'");
    expect(normalized).toContain("reversal.status = 'approved'");
  });

  it("binds formal report filters in project income queries", async () => {
    const rows: unknown[] = [];
    let sql = "";
    let bindings: unknown[] = [];
    const repo = new ReportRepository(mockDb(rows, (value) => (sql = value), (values) => (bindings = values)));

    await repo.projectIncome({ period: "2026-04", projectId: "proj_1", merchantId: "merchant_1", currencyCode: "USDT" });

    const normalized = normalizeSql(sql);
    expect(normalized).toContain("d.period = ?");
    expect(normalized).toContain("d.project_id = ?");
    expect(normalized).toContain("d.merchant_id = ?");
    expect(normalized).toContain("ae.currency_code = ?");
    expect(bindings).toEqual(["2026-04", "proj_1", "merchant_1", "USDT"]);
  });

  it("binds expense report filters against petty cash and loan aliases", async () => {
    const rows: unknown[] = [];
    let sql = "";
    let bindings: unknown[] = [];
    const repo = new ReportRepository(mockDb(rows, (value) => (sql = value), (values) => (bindings = values)));

    await repo.expenseDetails({
      period: "2026-04",
      projectId: "proj_1",
      merchantId: "merchant_1",
      personId: "person_1",
      currencyCode: "AED"
    });

    const normalized = normalizeSql(sql);
    expect(normalized).toContain("dl.person_id = ?");
    expect(normalized).toContain("li.borrower_person_id = ?");
    expect(normalized).toContain("dl.currency_code = ?");
    expect(normalized).toContain("li.currency_code = ?");
    expect(bindings).toEqual([
      "2026-04",
      "proj_1",
      "merchant_1",
      "person_1",
      "AED",
      "2026-04",
      "proj_1",
      "merchant_1",
      "person_1",
      "AED"
    ]);
  });

  it("returns project income grouped by project merchant period and currency", async () => {
    const rows = [
      {
        period: "2026-04",
        project_id: "proj_1",
        merchant_id: "merchant_1",
        category_id: "cat_income",
        currency_code: "USDT",
        income_amount_minor: 10000,
        income_usdt_minor: 10000
      }
    ];
    let sql = "";
    const repo = new ReportRepository(mockDb(rows, (value) => (sql = value)));

    await expect(repo.projectIncome({ period: "2026-04" })).resolves.toEqual(rows);

    const normalized = normalizeSql(sql);
    expect(normalized).toContain("from account_entries ae");
    expect(normalized).toContain("join documents d on d.id = ae.document_id");
    expect(normalized).toContain("d.document_type = 'project_income'");
    expect(normalized).toContain("d.status = 'approved'");
    expect(normalized).toContain("group by d.period, d.project_id, d.merchant_id, d.category_id, ae.currency_code");
  });

  it("returns merchant income grouped by merchant and currency", async () => {
    const rows = [
      {
        period: "2026-04",
        project_id: "proj_1",
        merchant_id: "merchant_1",
        currency_code: "USDT",
        income_amount_minor: 10000,
        income_usdt_minor: 10000
      }
    ];
    let sql = "";
    const repo = new ReportRepository(mockDb(rows, (value) => (sql = value)));

    await expect(repo.merchantIncome({ merchantId: "merchant_1" })).resolves.toEqual(rows);

    const normalized = normalizeSql(sql);
    expect(normalized).toContain("d.document_type = 'project_income'");
    expect(normalized).toContain("d.merchant_id is not null");
    expect(normalized).toContain("group by d.period, d.project_id, d.merchant_id, ae.currency_code");
  });

  it("returns expense detail rows from petty cash reimbursements and loan writeoffs", async () => {
    const rows = [{ document_id: "doc_expense", document_type: "petty_cash_reimbursement", amount_minor: 12000 }];
    let sql = "";
    const repo = new ReportRepository(mockDb(rows, (value) => (sql = value)));

    await expect(repo.expenseDetails({ period: "2026-04" })).resolves.toEqual(rows);

    const normalized = normalizeSql(sql);
    expect(normalized).toContain("petty_cash_reimbursement");
    expect(normalized).toContain("pending_cost_applications");
    expect(normalized).toContain("loan_writeoff");
    expect(normalized).toContain("union all");
    expect(normalized).toContain("direct_petty_cash_cost");
    expect(normalized).toContain("pending_cost_application_cost");
    expect(normalized).toContain("not exists");
    expect(normalized).toContain("d.action_type <> 'reversal'");
  });

  it("returns expense summary aggregated from expense detail rows", async () => {
    const rows = [{ period: "2026-04", project_id: "proj_1", category_id: "cat_expense", amount_minor: 12000 }];
    let sql = "";
    const repo = new ReportRepository(mockDb(rows, (value) => (sql = value)));

    await expect(repo.expenseSummary({ period: "2026-04" })).resolves.toEqual(rows);

    const normalized = normalizeSql(sql);
    expect(normalized).toContain("with direct_petty_cash_cost as");
    expect(normalized).toContain("from expense_detail_rows");
    expect(normalized).toContain("coalesce(person_id, borrower_person_id) as report_person_id");
    expect(normalized).toContain("report_person_id as person_id");
    expect(normalized).toContain("group by period, project_id, category_id, report_person_id, currency_code");
  });

  it("returns project profit loss rows from income and expense aggregates", async () => {
    const rows = [{ period: "2026-04", project_id: "proj_1", income_usdt_minor: 20000, expense_usdt_minor: 12000 }];
    let sql = "";
    const repo = new ReportRepository(mockDb(rows, (value) => (sql = value)));

    await expect(repo.projectProfitLoss({ period: "2026-04" })).resolves.toEqual(rows);

    const normalized = normalizeSql(sql);
    expect(normalized).toContain("income_rows as");
    expect(normalized).toContain("expense_rows as");
    expect(normalized).toContain("coalesce(i.income_usdt_minor, 0) - coalesce(e.expense_usdt_minor, 0) as net_usdt_minor");
    expect(normalized).toContain("full outer join");
  });

  it("returns monthly operating summary rows from project profit loss aggregates", async () => {
    const rows = [{ period: "2026-04", income_usdt_minor: 20000, expense_usdt_minor: 12000 }];
    let sql = "";
    const repo = new ReportRepository(mockDb(rows, (value) => (sql = value)));

    await expect(repo.monthlyOperatingSummary({ period: "2026-04" })).resolves.toEqual(rows);

    const normalized = normalizeSql(sql);
    expect(normalized).toContain("project_profit_loss_rows as");
    expect(normalized).toContain("group by period");
    expect(normalized).toContain("sum(net_usdt_minor)");
    expect(normalized).toContain("as net_usdt_minor");
  });

  it("returns formal exception checks from approved balances and workflow aging", async () => {
    const rows = [{ exception_type: "pending_cost", severity: "warning", entity_id: "pending_1" }];
    let sql = "";
    let bindings: unknown[] = [];
    const repo = new ReportRepository(mockDb(rows, (value) => (sql = value), (values) => (bindings = values)));

    await expect(
      repo.exceptionChecks({
        period: "2026-04",
        projectId: "proj_1",
        merchantId: "merchant_1",
        personId: "person_1",
        currencyCode: "AED",
        staleDays: 45
      })
    ).resolves.toEqual(rows);

    const normalized = normalizeSql(sql);
    expect(normalized).toContain("pending_cost");
    expect(normalized).toContain("negative_petty_cash");
    expect(normalized).toContain("negative_company_account");
    expect(normalized).toContain("stale_pending_document");
    expect(normalized).toContain("stale_draft_document");
    expect(normalized).toContain("stale_loan");
    expect(normalized).toContain("from pending_cost_matches pcm");
    expect(normalized).toContain("from account_entries ae");
    expect(normalized).toContain("join accounts a on a.id = ae.account_id");
    expect(normalized).toContain("a.account_type = 'petty_cash'");
    expect(normalized).toContain("a.is_company_account = 1");
    expect(normalized).toContain("a.allow_negative = 0");
    expect(normalized).toContain("a.account_type = 'petty_cash' and a.owner_person_id = ? and ae.currency_code = ?");
    expect(normalized).toContain("a.is_company_account = 1 and a.allow_negative = 0 and ae.currency_code = ?");
    expect((normalized.match(/ union all /g) ?? []).length).toBeLessThanOrEqual(4);
    expect(normalized).toContain("julianday('now') - julianday(coalesce(d.submitted_at, d.created_at)) >= ?");
    expect(normalized).toContain("julianday('now') - julianday(d.created_at) >= ?");
    expect(normalized).toContain("julianday('now') - julianday(li.loan_date) >= ?");
    expect(bindings).toEqual([
      "2026-04",
      "proj_1",
      "merchant_1",
      "person_1",
      "AED",
      "person_1",
      "AED",
      "AED",
      "2026-04",
      "proj_1",
      "merchant_1",
      "person_1",
      "AED",
      45,
      45,
      "2026-04",
      "proj_1",
      "merchant_1",
      "person_1",
      "AED",
      45
    ]);
  });

  it("binds default stale days unless the filter is a positive safe integer", async () => {
    const rows: unknown[] = [];
    const defaultBindings: unknown[][] = [];
    const defaultRepo = new ReportRepository(
      mockDb(rows, () => {}, (values) => defaultBindings.push(values))
    );

    await defaultRepo.exceptionChecks({ staleDays: 0 });

    const customBindings: unknown[][] = [];
    const customRepo = new ReportRepository(
      mockDb(rows, () => {}, (values) => customBindings.push(values))
    );

    await customRepo.exceptionChecks({ staleDays: 12 });

    expect(defaultBindings[0]).toEqual([30, 30, 30]);
    expect(customBindings[0]).toEqual([12, 12, 12]);
  });

  it("executes expense summary grouping loan writeoffs by borrower person", async () => {
    const sqliteDb = await createSqliteReportDb();
    try {
      sqliteDb.exec(`
        INSERT INTO documents (
          id, document_type, action_type, business_date, period, project_id, merchant_id, category_id, status, original_document_id
        ) VALUES
          ('doc_writeoff_a', 'loan_writeoff', 'normal', '2026-04-04', '2026-04', 'proj_1', NULL, 'cat_expense', 'approved', NULL),
          ('doc_writeoff_b', 'loan_writeoff', 'normal', '2026-04-05', '2026-04', 'proj_1', NULL, 'cat_expense', 'approved', NULL);

        INSERT INTO loan_items (id, borrower_person_id, currency_code) VALUES
          ('loan_item_a', 'person_a', 'AED'),
          ('loan_item_b', 'person_b', 'AED');

        INSERT INTO loan_allocations (
          id, document_id, loan_item_id, allocation_type, amount_minor, usdt_cost_minor
        ) VALUES
          ('alloc_a', 'doc_writeoff_a', 'loan_item_a', 'writeoff', 1000, 270),
          ('alloc_b', 'doc_writeoff_b', 'loan_item_b', 'writeoff', 2000, 540);
      `);

      const repo = new ReportRepository(sqliteDb.db);

      await expect(repo.expenseSummary({ period: "2026-04" })).resolves.toEqual([
        {
          period: "2026-04",
          project_id: "proj_1",
          category_id: "cat_expense",
          person_id: "person_a",
          currency_code: "AED",
          amount_minor: 1000,
          matched_usdt_cost_minor: 270,
          pending_amount_minor: 0
        },
        {
          period: "2026-04",
          project_id: "proj_1",
          category_id: "cat_expense",
          person_id: "person_b",
          currency_code: "AED",
          amount_minor: 2000,
          matched_usdt_cost_minor: 540,
          pending_amount_minor: 0
        }
      ]);
    } finally {
      sqliteDb.close();
    }
  });

  it("executes expense details excluding reversed petty cash reimbursements", async () => {
    const sqliteDb = await createSqliteReportDb();
    try {
      sqliteDb.exec(`
        INSERT INTO documents (
          id, document_type, action_type, business_date, period, project_id, merchant_id, category_id, status, original_document_id
        ) VALUES
          ('doc_petty_active', 'petty_cash_reimbursement', 'normal', '2026-04-03', '2026-04', 'proj_1', NULL, 'cat_expense', 'approved', NULL),
          ('doc_petty_reversed', 'petty_cash_reimbursement', 'normal', '2026-04-02', '2026-04', 'proj_1', NULL, 'cat_expense', 'approved', NULL),
          ('doc_petty_reversal', 'petty_cash_reimbursement', 'reversal', '2026-04-04', '2026-04', 'proj_1', NULL, 'cat_expense', 'approved', 'doc_petty_reversed');

        INSERT INTO document_lines (id, document_id, person_id, currency_code, amount_minor) VALUES
          ('line_active', 'doc_petty_active', 'person_1', 'AED', 8000),
          ('line_reversed', 'doc_petty_reversed', 'person_2', 'AED', 12000),
          ('line_reversal', 'doc_petty_reversal', 'person_2', 'AED', 12000);

        INSERT INTO lot_movements (id, document_id, movement_type, usdt_cost_minor) VALUES
          ('lot_move_active', 'doc_petty_active', 'petty_cash_reimbursement', 2400),
          ('lot_move_reversed', 'doc_petty_reversed', 'petty_cash_reimbursement', 3600);
      `);

      const repo = new ReportRepository(sqliteDb.db);

      await expect(repo.expenseDetails({ period: "2026-04" })).resolves.toEqual([
        {
          document_id: "doc_petty_active",
          document_type: "petty_cash_reimbursement",
          period: "2026-04",
          business_date: "2026-04-03",
          project_id: "proj_1",
          merchant_id: null,
          category_id: "cat_expense",
          person_id: "person_1",
          borrower_person_id: null,
          currency_code: "AED",
          amount_minor: 8000,
          matched_usdt_cost_minor: 2400,
          pending_amount_minor: 0,
          cost_status: "complete"
        }
      ]);

      await expect(repo.expenseSummary({ period: "2026-04" })).resolves.toEqual([
        {
          period: "2026-04",
          project_id: "proj_1",
          category_id: "cat_expense",
          person_id: "person_1",
          currency_code: "AED",
          amount_minor: 8000,
          matched_usdt_cost_minor: 2400,
          pending_amount_minor: 0
        }
      ]);
    } finally {
      sqliteDb.close();
    }
  });

  it("executes monthly operating summary with aggregated income and expenses", async () => {
    const sqliteDb = await createSqliteReportDb();
    try {
      sqliteDb.exec(`
        INSERT INTO documents (
          id, document_type, action_type, business_date, period, project_id, merchant_id, category_id, status, original_document_id
        ) VALUES
          ('doc_income', 'project_income', 'normal', '2026-04-01', '2026-04', 'proj_1', 'merchant_1', 'cat_income', 'approved', NULL),
          ('doc_expense', 'petty_cash_reimbursement', 'normal', '2026-04-02', '2026-04', 'proj_1', NULL, 'cat_expense', 'approved', NULL);

        INSERT INTO account_entries (id, document_id, currency_code, amount_minor) VALUES
          ('entry_income', 'doc_income', 'USDT', 20000);

        INSERT INTO document_lines (id, document_id, person_id, currency_code, amount_minor) VALUES
          ('line_expense', 'doc_expense', 'person_1', 'AED', 18000);

        INSERT INTO lot_movements (id, document_id, movement_type, usdt_cost_minor) VALUES
          ('lot_move_expense', 'doc_expense', 'petty_cash_reimbursement', 5000);
      `);

      const repo = new ReportRepository(sqliteDb.db);

      await expect(repo.monthlyOperatingSummary({ period: "2026-04" })).resolves.toEqual([
        {
          period: "2026-04",
          income_usdt_minor: 20000,
          expense_usdt_minor: 5000,
          pending_expense_minor: 0,
          net_usdt_minor: 15000,
          cost_status: "complete"
        }
      ]);
    } finally {
      sqliteDb.close();
    }
  });

  it("executes exception checks for pending costs, negative company accounts, and default stale aging", async () => {
    const sqliteDb = await createSqliteReportDb();
    try {
      sqliteDb.exec(`
        INSERT INTO accounts (
          id, name, account_type, currency_code, owner_person_id, is_company_account, allow_negative
        ) VALUES
          ('acct_company', 'Company AED', 'currency_reserve', 'AED', NULL, 1, 0),
          ('acct_petty', 'Petty Cash', 'petty_cash', 'AED', 'person_1', 0, 0);

        INSERT INTO documents (
          id, document_type, action_type, business_date, period, operator_person_id,
          project_id, merchant_id, category_id, status, original_document_id, created_at
        ) VALUES
          ('doc_pending_cost', 'petty_cash_reimbursement', 'normal', '2026-04-02', '2026-04', 'person_1', 'proj_1', NULL, 'cat_expense', 'approved', NULL, '2026-04-02T00:00:00Z'),
          ('doc_company_negative', 'account_transfer', 'normal', '2026-04-03', '2026-04', 'person_2', 'proj_1', NULL, NULL, 'approved', NULL, '2026-04-03T00:00:00Z'),
          ('doc_pending_old', 'project_income', 'normal', '2000-01-01', '2000-01', 'person_1', 'proj_1', NULL, NULL, 'pending', NULL, '2000-01-01T00:00:00Z'),
          ('doc_draft_recent', 'project_income', 'normal', '2099-01-01', '2099-01', 'person_1', 'proj_1', NULL, NULL, 'draft', NULL, '2099-01-01T00:00:00Z');

        INSERT INTO document_lines (id, document_id, person_id, currency_code, amount_minor) VALUES
          ('line_pending_old', 'doc_pending_old', 'person_1', 'AED', 1000),
          ('line_draft_recent', 'doc_draft_recent', 'person_1', 'AED', 1000);

        INSERT INTO pending_cost_matches (
          id, document_id, person_id, account_id, currency_code, amount_minor,
          remaining_amount_minor, expense_date, status, created_at
        ) VALUES
          ('pending_1', 'doc_pending_cost', 'person_1', 'acct_petty', 'AED', 5000, 2000, '2026-04-02', 'partial', '2026-04-02T00:00:00Z');

        INSERT INTO account_entries (id, document_id, account_id, currency_code, amount_minor, entry_date) VALUES
          ('entry_company_negative', 'doc_company_negative', 'acct_company', 'AED', -3000, '2026-04-03');
      `);

      const repo = new ReportRepository(sqliteDb.db);

      await expect(repo.exceptionChecks({ period: "2026-04", currencyCode: "AED", staleDays: 0 })).resolves.toEqual([
        {
          exception_type: "negative_company_account",
          severity: "critical",
          entity_type: "account",
          entity_id: "acct_company",
          period: null,
          business_date: null,
          currency_code: "AED",
          amount_minor: -3000,
          usdt_cost_minor: null,
          message: "Company account balance is negative"
        },
        {
          exception_type: "pending_cost",
          severity: "warning",
          entity_type: "pending_cost_match",
          entity_id: "pending_1",
          period: "2026-04",
          business_date: "2026-04-02",
          currency_code: "AED",
          amount_minor: 2000,
          usdt_cost_minor: null,
          message: "Pending cost has unmatched USDT cost"
        }
      ]);

      await expect(repo.exceptionChecks({ personId: "person_1", currencyCode: "AED", staleDays: Number.NaN })).resolves.toEqual([
        {
          exception_type: "negative_company_account",
          severity: "critical",
          entity_type: "account",
          entity_id: "acct_company",
          period: null,
          business_date: null,
          currency_code: "AED",
          amount_minor: -3000,
          usdt_cost_minor: null,
          message: "Company account balance is negative"
        },
        {
          exception_type: "pending_cost",
          severity: "warning",
          entity_type: "pending_cost_match",
          entity_id: "pending_1",
          period: "2026-04",
          business_date: "2026-04-02",
          currency_code: "AED",
          amount_minor: 2000,
          usdt_cost_minor: null,
          message: "Pending cost has unmatched USDT cost"
        },
        {
          exception_type: "stale_pending_document",
          severity: "warning",
          entity_type: "document",
          entity_id: "doc_pending_old",
          period: "2000-01",
          business_date: "2000-01-01",
          currency_code: null,
          amount_minor: null,
          usdt_cost_minor: null,
          message: "Document has stayed pending beyond the stale threshold"
        }
      ]);
    } finally {
      sqliteDb.close();
    }
  });

  it("executes month close source queries with rule input shapes", async () => {
    const sqliteDb = await createSqliteReportDb();
    try {
      sqliteDb.exec(`
        INSERT INTO accounts (
          id, name, account_type, currency_code, owner_person_id, is_company_account, allow_negative
        ) VALUES
          ('acct_company', 'Company AED', 'currency_reserve', 'AED', NULL, 1, 0),
          ('acct_petty', 'Petty Cash', 'petty_cash', 'AED', 'person_ops', 0, 1);

        INSERT INTO merchants (id, code, name, project_id) VALUES
          ('merchant_1', 'M1', 'Merchant 1', 'proj_1'),
          ('merchant_2', 'M2', 'Merchant 2', 'proj_2');

        INSERT INTO documents (
          id, document_type, action_type, business_date, period, operator_person_id,
          project_id, merchant_id, category_id, status, original_document_id, created_at, submitted_at
        ) VALUES
          ('doc_pending', 'project_income', 'normal', '2026-04-02', '2026-04', 'person_ops', 'proj_1', NULL, NULL, 'pending', NULL, '2026-04-02T00:00:00Z', '2026-04-02T01:00:00Z'),
          ('doc_approved_balance', 'account_transfer', 'normal', '2026-04-03', '2026-04', 'person_ops', 'proj_1', NULL, NULL, 'approved', NULL, '2026-04-03T00:00:00Z', NULL),
          ('doc_pending_cost', 'petty_cash_reimbursement', 'normal', '2026-04-04', '2026-04', 'person_ops', 'proj_1', NULL, 'cat_expense', 'approved', NULL, '2026-04-04T00:00:00Z', NULL),
          ('doc_loan', 'loan_out', 'normal', '2026-04-05', '2026-04', 'person_ops', 'proj_1', NULL, NULL, 'approved', NULL, '2026-04-05T00:00:00Z', NULL),
          ('doc_income_missing_merchant', 'project_income', 'normal', '2026-04-06', '2026-04', 'person_ops', 'proj_1', NULL, NULL, 'approved', NULL, '2026-04-06T00:00:00Z', NULL),
          ('doc_income_mismatch', 'project_income', 'normal', '2026-04-07', '2026-04', 'person_ops', 'proj_1', 'merchant_2', NULL, 'approved', NULL, '2026-04-07T00:00:00Z', NULL);

        INSERT INTO account_entries (id, document_id, account_id, currency_code, amount_minor, entry_date) VALUES
          ('entry_company', 'doc_approved_balance', 'acct_company', 'AED', -3000, '2026-04-03'),
          ('entry_petty', 'doc_pending_cost', 'acct_petty', 'AED', -500, '2026-04-04');

        INSERT INTO pending_cost_matches (
          id, document_id, person_id, account_id, currency_code, amount_minor,
          remaining_amount_minor, expense_date, status, created_at
        ) VALUES
          ('pending_1', 'doc_pending_cost', 'person_ops', 'acct_petty', 'AED', 2000, 1500, '2026-04-04', 'open', '2026-04-04T00:00:00Z');

        INSERT INTO loan_items (
          id, source_document_id, borrower_person_id, currency_code,
          remaining_amount_minor, remaining_usdt_cost_minor, loan_date, status, created_at
        ) VALUES
          ('loan_1', 'doc_loan', 'person_borrower', 'USDT', 9000, 9000, '2026-04-05', 'open', '2026-04-05T00:00:00Z');
      `);

      const repo = new ReportRepository(sqliteDb.db);

      await expect(repo.documentWorkflowRows("2026-04")).resolves.toEqual([
        {
          id: "doc_pending",
          status: "pending",
          period: "2026-04",
          businessDate: "2026-04-02",
          createdAt: "2026-04-02T00:00:00Z",
          submittedAt: "2026-04-02T01:00:00Z"
        }
      ]);
      await expect(repo.accountBalanceRowsForMonthClose("2026-04")).resolves.toEqual([
        {
          accountId: "acct_company",
          accountType: "currency_reserve",
          ownerPersonId: null,
          isCompanyAccount: true,
          allowNegative: false,
          currencyCode: "AED",
          balanceMinor: -3000
        },
        {
          accountId: "acct_petty",
          accountType: "petty_cash",
          ownerPersonId: "person_ops",
          isCompanyAccount: false,
          allowNegative: true,
          currencyCode: "AED",
          balanceMinor: -500
        }
      ]);
      await expect(repo.pendingCostRowsForMonthClose("2026-04")).resolves.toEqual([
        expect.objectContaining({
          id: "pending_1",
          documentId: "doc_pending_cost",
          personId: "person_ops",
          accountId: "acct_petty",
          currencyCode: "AED",
          remainingAmountMinor: 1500,
          expenseDate: "2026-04-04",
          ageDays: expect.any(Number)
        })
      ]);
      await expect(repo.loanAgingRowsForMonthClose("2026-04")).resolves.toEqual([
        expect.objectContaining({
          loanItemId: "loan_1",
          borrowerPersonId: "person_borrower",
          currencyCode: "USDT",
          remainingAmountMinor: 9000,
          remainingUsdtCostMinor: 9000,
          loanDate: "2026-04-05",
          ageDays: expect.any(Number)
        })
      ]);
      await expect(repo.projectIntegrityRows("2026-04")).resolves.toEqual([
        {
          documentId: "doc_income_missing_merchant",
          documentType: "project_income",
          businessDate: "2026-04-06",
          projectId: "proj_1",
          merchantId: null,
          merchantProjectId: null
        },
        {
          documentId: "doc_income_mismatch",
          documentType: "project_income",
          businessDate: "2026-04-07",
          projectId: "proj_1",
          merchantId: "merchant_2",
          merchantProjectId: "proj_2"
        }
      ]);
    } finally {
      sqliteDb.close();
    }
  });

  it("executes negative petty cash checks without multiplying account entries by document lines", async () => {
    const sqliteDb = await createSqliteReportDb();
    try {
      sqliteDb.exec(`
        INSERT INTO accounts (
          id, name, account_type, currency_code, owner_person_id, is_company_account, allow_negative
        ) VALUES
          ('acct_petty', 'Petty Cash', 'petty_cash', 'AED', 'person_1', 0, 0);

        INSERT INTO documents (
          id, document_type, action_type, business_date, period, operator_person_id,
          project_id, merchant_id, category_id, status, original_document_id, created_at
        ) VALUES
          ('doc_petty_negative', 'petty_cash_reimbursement', 'normal', '2026-04-03', '2026-04', 'person_1', 'proj_1', NULL, 'cat_expense', 'approved', NULL, '2026-04-03T00:00:00Z');

        INSERT INTO document_lines (id, document_id, account_id, person_id, currency_code, amount_minor) VALUES
          ('line_petty_a', 'doc_petty_negative', 'acct_petty', 'person_1', 'AED', 1000),
          ('line_petty_b', 'doc_petty_negative', 'acct_petty', 'person_1', 'AED', 1000);

        INSERT INTO account_entries (id, document_id, account_id, currency_code, amount_minor, entry_date) VALUES
          ('entry_petty_negative', 'doc_petty_negative', 'acct_petty', 'AED', -500, '2026-04-03');
      `);

      const repo = new ReportRepository(sqliteDb.db);

      await expect(repo.exceptionChecks({ period: "2026-04", personId: "person_1", currencyCode: "AED" })).resolves.toEqual([
        {
          exception_type: "negative_petty_cash",
          severity: "warning",
          entity_type: "petty_cash_account",
          entity_id: "acct_petty",
          period: null,
          business_date: null,
          currency_code: "AED",
          amount_minor: -500,
          usdt_cost_minor: null,
          message: "Petty cash account balance is negative"
        }
      ]);
    } finally {
      sqliteDb.close();
    }
  });

  it("checks negative balances against cumulative account balances independent of document filters", async () => {
    const sqliteDb = await createSqliteReportDb();
    try {
      sqliteDb.exec(`
        INSERT INTO accounts (
          id, name, account_type, currency_code, owner_person_id, is_company_account, allow_negative
        ) VALUES
          ('acct_company', 'Company AED', 'currency_reserve', 'AED', NULL, 1, 0),
          ('acct_petty', 'Petty Cash', 'petty_cash', 'AED', 'person_1', 0, 0);

        INSERT INTO documents (
          id, document_type, action_type, business_date, period, operator_person_id,
          project_id, merchant_id, category_id, status, original_document_id, created_at
        ) VALUES
          ('doc_petty_prior', 'petty_cash_reimbursement', 'normal', '2026-03-25', '2026-03', 'person_1', 'proj_old', 'merchant_old', NULL, 'approved', NULL, '2026-03-25T00:00:00Z'),
          ('doc_petty_current', 'petty_cash_reimbursement', 'normal', '2026-04-05', '2026-04', 'person_1', 'proj_1', 'merchant_1', NULL, 'approved', NULL, '2026-04-05T00:00:00Z'),
          ('doc_company_prior', 'account_transfer', 'normal', '2026-03-20', '2026-03', 'person_2', 'proj_old', 'merchant_old', NULL, 'approved', NULL, '2026-03-20T00:00:00Z'),
          ('doc_company_current', 'account_transfer', 'normal', '2026-04-06', '2026-04', 'person_2', 'proj_1', 'merchant_1', NULL, 'approved', NULL, '2026-04-06T00:00:00Z');

        INSERT INTO account_entries (id, document_id, account_id, currency_code, amount_minor, entry_date) VALUES
          ('entry_petty_prior', 'doc_petty_prior', 'acct_petty', 'AED', 5000, '2026-03-25'),
          ('entry_petty_current', 'doc_petty_current', 'acct_petty', 'AED', -1000, '2026-04-05'),
          ('entry_company_prior', 'doc_company_prior', 'acct_company', 'AED', -5000, '2026-03-20'),
          ('entry_company_current', 'doc_company_current', 'acct_company', 'AED', 1000, '2026-04-06');
      `);

      const repo = new ReportRepository(sqliteDb.db);

      await expect(
        repo.exceptionChecks({
          period: "2026-04",
          projectId: "proj_1",
          merchantId: "merchant_1",
          personId: "person_1",
          currencyCode: "AED",
          staleDays: 36500
        })
      ).resolves.toEqual([
        {
          exception_type: "negative_company_account",
          severity: "critical",
          entity_type: "account",
          entity_id: "acct_company",
          period: null,
          business_date: null,
          currency_code: "AED",
          amount_minor: -4000,
          usdt_cost_minor: null,
          message: "Company account balance is negative"
        }
      ]);
    } finally {
      sqliteDb.close();
    }
  });

  it("ages pending documents from submitted_at when present", async () => {
    const sqliteDb = await createSqliteReportDb();
    try {
      sqliteDb.exec(`
        INSERT INTO documents (
          id, document_type, action_type, business_date, period, operator_person_id,
          project_id, merchant_id, category_id, status, original_document_id, created_at, submitted_at
        ) VALUES
          (
            'doc_pending_recent_submission',
            'project_income',
            'normal',
            '2000-01-01',
            '2000-01',
            'person_1',
            'proj_1',
            NULL,
            NULL,
            'pending',
            NULL,
            '2000-01-01T00:00:00Z',
            strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-1 day')
          );
      `);

      const repo = new ReportRepository(sqliteDb.db);

      await expect(repo.exceptionChecks({ staleDays: 30 })).resolves.toEqual([]);
    } finally {
      sqliteDb.close();
    }
  });
});
