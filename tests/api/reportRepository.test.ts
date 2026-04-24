import { describe, expect, it } from "vitest";
import { ReportRepository } from "../../src/repositories/reportRepository";

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

function mockDb(rows: unknown[], onSql: (sql: string) => void): D1Database {
  return {
    prepare: (sql: string) => {
      onSql(sql);
      return {
        bind() {
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
    expect(normalized).toContain("where pcm.status = 'open' and d.status = 'approved'");
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
});
