import { describe, expect, it } from "vitest";
import { MasterDataRepository } from "../../src/repositories/masterDataRepository";

function mockDb(rows: unknown[]): D1Database {
  return {
    prepare: () =>
      ({
        bind: () => ({
          run: async () => ({ success: true })
        }),
        all: async () => ({ success: true, results: rows })
      }) as unknown as D1PreparedStatement
  } as D1Database;
}

describe("MasterDataRepository", () => {
  it("lists currencies", async () => {
    const repo = new MasterDataRepository(mockDb([{ code: "USDT", name: "USDT", minor_units: 2, is_enabled: 1 }]));

    await expect(repo.listCurrencies()).resolves.toEqual([{ code: "USDT", name: "USDT", minor_units: 2, is_enabled: 1 }]);
  });
});
