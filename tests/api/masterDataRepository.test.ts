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

  it("lists active project merchant account and enabled category options", async () => {
    const sqlStatements: string[] = [];
    const repo = new MasterDataRepository(
      mockDb({
        rows: [],
        onSql: (sql) => sqlStatements.push(sql)
      })
    );

    await repo.listProjectOptions();
    await repo.listMerchantOptions();
    await repo.listAccountOptions();
    await repo.listCategoryOptions();
    await repo.listCurrencyOptions();

    const normalized = sqlStatements.join(" ").replace(/\s+/g, " ").toLowerCase();
    expect(normalized).toContain("from projects");
    expect(normalized).toContain("where status = 'active'");
    expect(normalized).toContain("from merchants");
    expect(normalized).toContain("from accounts");
    expect(normalized).toContain("from categories");
    expect(normalized).toContain("where is_enabled = 1");
    expect(normalized).toContain("from currencies");
  });
});
