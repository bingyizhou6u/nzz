import { describe, expect, it } from "vitest";
import { accountBalances } from "../../src/api/reports";
import { route } from "../../src/worker/router";
import type { Env } from "../../src/worker/env";

function mockEnv(rows: unknown[] = []): Env {
  return {
    DB: {
      prepare: () =>
        ({
          bind() {
            return this;
          },
          all: async () => ({ success: true, results: rows }),
          first: async () => null,
          run: async () => ({ success: true } as D1Result)
        }) as unknown as D1PreparedStatement
    } as unknown as D1Database,
    ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher
  };
}

describe("reports API", () => {
  it("returns account balances from the handler", async () => {
    const rows = [{ account_id: "acct_1", currency_code: "AED", balance_minor: 1250 }];

    const response = await accountBalances({
      request: new Request("https://ledger.test/api/reports/account-balances"),
      env: mockEnv(rows),
      params: {}
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: rows });
  });
});

describe("report routes", () => {
  it.each([
    "/api/reports/account-balances",
    "/api/reports/petty-cash-pending",
    "/api/reports/loan-balances"
  ])("routes GET %s", async (pathname) => {
    const response = await route(new Request(`https://ledger.test${pathname}`), mockEnv());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: [] });
  });
});
