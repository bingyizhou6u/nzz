import { describe, expect, it } from "vitest";
import { MasterDataRepository } from "../../src/repositories/masterDataRepository";

function mockDb(options: { rows?: unknown[]; firstRow?: unknown | null; runResult?: D1Result }): D1Database {
  return {
    prepare: () =>
      ({
        bind() {
          return this;
        },
        all: async () => ({ success: true, results: options.rows ?? [] }),
        first: async () => options.firstRow ?? null,
        run: async () => options.runResult ?? ({ success: true } as D1Result)
      }) as unknown as D1PreparedStatement
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
});
