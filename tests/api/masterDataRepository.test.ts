import { describe, expect, it } from "vitest";
import { MasterDataRepository } from "../../src/repositories/masterDataRepository";

function mockDb(options: {
  rows?: unknown[];
  firstRow?: unknown | null;
  runResult?: D1Result;
  onSql?: (sql: string) => void;
}): D1Database {
  return {
    prepare: (sql: string) => {
      options.onSql?.(sql);
      return {
        bind() {
          return this;
        },
        all: async () => ({ success: true, results: options.rows ?? [] }),
        first: async () => options.firstRow ?? null,
        run: async () => options.runResult ?? ({ success: true } as D1Result)
      } as unknown as D1PreparedStatement;
    }
  } as unknown as D1Database;
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

describe("MasterDataRepository", () => {
  it("lists currencies", async () => {
    const repo = new MasterDataRepository(
      mockDb({ rows: [{ code: "USDT", name: "USDT", minor_units: 2, is_enabled: 1 }] })
    );

    await expect(repo.listCurrencies()).resolves.toEqual([{ code: "USDT", name: "USDT", minor_units: 2, is_enabled: 1 }]);
  });

  it("gets a currency by code", async () => {
    const currency = { code: "AED", name: "UAE Dirham", minor_units: 2, is_enabled: 1 };
    const repo = new MasterDataRepository(mockDb({ firstRow: currency }));

    await expect(repo.getCurrency("AED")).resolves.toEqual(currency);
  });

  it("throws when project creation fails", async () => {
    const repo = new MasterDataRepository(
      mockDb({ runResult: { success: false, error: "duplicate project" } as unknown as D1Result })
    );

    await expect(repo.createProject({ code: "P001", name: "Project One" })).rejects.toThrow("duplicate project");
  });

  it("lists enabled people options ordered by name", async () => {
    let capturedSql = "";
    const repo = new MasterDataRepository(
      mockDb({
        rows: [{ id: "person_1", name: "Alice", alias: "ali", roles_json: "[\"finance\"]", is_enabled: 1 }],
        onSql: (sql) => (capturedSql = sql)
      })
    );

    await expect(repo.listPeopleOptions()).resolves.toEqual([
      { id: "person_1", name: "Alice", alias: "ali", roles_json: "[\"finance\"]", is_enabled: 1 }
    ]);
    expect(capturedSql.replace(/\s+/g, " ").toLowerCase()).toContain("where is_enabled = 1");
    expect(capturedSql.replace(/\s+/g, " ").toLowerCase()).toContain("order by name, id");
  });

  it("lists active project options ordered by code name and id", async () => {
    let capturedSql = "";
    const row = {
      id: "project_1",
      code: "P001",
      name: "Project One",
      owner_person_id: "person_1",
      status: "active"
    };
    const repo = new MasterDataRepository(
      mockDb({
        rows: [row],
        onSql: (sql) => (capturedSql = sql)
      })
    );

    await expect(repo.listProjectOptions()).resolves.toEqual([row]);

    const normalized = normalizeSql(capturedSql);
    expect(normalized).toContain("select id, code, name, owner_person_id, status");
    expect(normalized).toContain("from projects");
    expect(normalized).toContain("where status = 'active'");
    expect(normalized).toContain("order by code, name, id");
  });

  it("lists active merchant options ordered by project code name and id", async () => {
    let capturedSql = "";
    const row = {
      id: "merchant_1",
      code: "M001",
      name: "Merchant One",
      project_id: "project_1",
      merchant_type: "store",
      status: "active"
    };
    const repo = new MasterDataRepository(
      mockDb({
        rows: [row],
        onSql: (sql) => (capturedSql = sql)
      })
    );

    await expect(repo.listMerchantOptions()).resolves.toEqual([row]);

    const normalized = normalizeSql(capturedSql);
    expect(normalized).toContain("select id, code, name, project_id, merchant_type, status");
    expect(normalized).toContain("from merchants");
    expect(normalized).toContain("where status = 'active'");
    expect(normalized).toContain("order by project_id, code, name, id");
  });

  it("lists active account options ordered by company flag type name and id", async () => {
    let capturedSql = "";
    const row = {
      id: "account_1",
      name: "Main Cash",
      account_type: "cash",
      currency_code: "AED",
      owner_person_id: null,
      is_company_account: 1,
      allow_negative: 0,
      status: "active"
    };
    const repo = new MasterDataRepository(
      mockDb({
        rows: [row],
        onSql: (sql) => (capturedSql = sql)
      })
    );

    await expect(repo.listAccountOptions()).resolves.toEqual([row]);

    const normalized = normalizeSql(capturedSql);
    expect(normalized).toContain(
      "select id, name, account_type, currency_code, owner_person_id, is_company_account, allow_negative, status"
    );
    expect(normalized).toContain("from accounts");
    expect(normalized).toContain("where status = 'active'");
    expect(normalized).toContain("order by is_company_account desc, account_type, name, id");
  });

  it("lists enabled category options ordered by category type name and id", async () => {
    let capturedSql = "";
    const row = {
      id: "category_1",
      name: "Travel",
      parent_id: null,
      category_type: "expense",
      direction: "out",
      affects_expense_report: 1,
      affects_project_report: 0,
      requires_merchant: 1,
      requires_person: 0,
      requires_borrower: 0,
      is_enabled: 1
    };
    const repo = new MasterDataRepository(
      mockDb({
        rows: [row],
        onSql: (sql) => (capturedSql = sql)
      })
    );

    await expect(repo.listCategoryOptions()).resolves.toEqual([row]);

    const normalized = normalizeSql(capturedSql);
    expect(normalized).toContain(
      "select id, name, parent_id, category_type, direction, affects_expense_report, affects_project_report, requires_merchant, requires_person, requires_borrower, is_enabled"
    );
    expect(normalized).toContain("from categories");
    expect(normalized).toContain("where is_enabled = 1");
    expect(normalized).toContain("order by category_type, name, id");
  });

  it("lists enabled currency options ordered by code", async () => {
    let capturedSql = "";
    const row = { code: "AED", name: "UAE Dirham", minor_units: 2, is_enabled: 1 };
    const repo = new MasterDataRepository(
      mockDb({
        rows: [row],
        onSql: (sql) => (capturedSql = sql)
      })
    );

    await expect(repo.listCurrencyOptions()).resolves.toEqual([row]);

    const normalized = normalizeSql(capturedSql);
    expect(normalized).toContain("select code, name, minor_units, is_enabled");
    expect(normalized).toContain("from currencies");
    expect(normalized).toContain("where is_enabled = 1");
    expect(normalized).toContain("order by code");
  });
});
