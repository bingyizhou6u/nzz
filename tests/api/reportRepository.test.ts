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
  });

  it("returns expense summary aggregated from expense detail rows", async () => {
    const rows = [{ period: "2026-04", project_id: "proj_1", category_id: "cat_expense", amount_minor: 12000 }];
    let sql = "";
    const repo = new ReportRepository(mockDb(rows, (value) => (sql = value)));

    await expect(repo.expenseSummary({ period: "2026-04" })).resolves.toEqual(rows);

    const normalized = normalizeSql(sql);
    expect(normalized).toContain("with direct_petty_cash_cost as");
    expect(normalized).toContain("from expense_detail_rows");
    expect(normalized).toContain("group by period, project_id, category_id, person_id, currency_code");
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
});
