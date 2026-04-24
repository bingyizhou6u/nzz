import { describe, expect, it } from "vitest";
import { accountBalances, loanAging, loanAllocations, loanWriteoffs, lotBalances } from "../../src/api/reports";
import { route } from "../../src/worker/router";
import type { Env } from "../../src/worker/env";

function mockEnv(rows: unknown[] = []): Env {
  return mockEnvWithSql(rows).env;
}

function mockEnvWithSql(rows: unknown[] = []): { env: Env; sql: string[] } {
  const sql: string[] = [];
  return {
    env: {
      DB: {
        prepare: (query: string) => {
          sql.push(query);
          return {
            bind() {
              return this;
            },
            all: async () => ({ success: true, results: rows }),
            first: async () => null,
            run: async () => ({ success: true } as D1Result)
          } as unknown as D1PreparedStatement;
        }
      } as unknown as D1Database,
      ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher
    },
    sql
  };
}

function normalizeSql(sql: string): string {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
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

  it("returns lot balances from the handler", async () => {
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

    const response = await lotBalances({
      request: new Request("https://ledger.test/api/reports/lots"),
      env: mockEnv(rows),
      params: {}
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: rows });
  });

  it.each([
    ["loan aging", loanAging, "/api/reports/loan-aging"],
    ["loan allocations", loanAllocations, "/api/reports/loan-allocations"],
    ["loan writeoffs", loanWriteoffs, "/api/reports/loan-writeoffs"]
  ])("returns %s from the handler", async (_label, handler, pathname) => {
    const rows = [{ id: "row_1" }];

    const response = await handler({
      request: new Request(`https://ledger.test${pathname}`),
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
    "/api/reports/loan-balances",
    "/api/reports/loan-aging",
    "/api/reports/loan-allocations",
    "/api/reports/loan-writeoffs",
    "/api/reports/lots",
    "/api/reports/lot-movements",
    "/api/reports/pending-costs"
  ])("routes GET %s", async (pathname) => {
    const response = await route(new Request(`https://ledger.test${pathname}`), mockEnv());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: [] });
  });

  it.each([
    ["/api/reports/lots", "from lots"],
    ["/api/reports/lot-movements", "from lot_movements"],
    ["/api/reports/pending-costs", "from pending_cost_matches"],
    ["/api/reports/loan-aging", "from loan_items li"],
    ["/api/reports/loan-allocations", "from loan_allocations la"],
    ["/api/reports/loan-writeoffs", "from loan_allocations la"]
  ])("routes GET %s to the expected report query", async (pathname, expectedFrom) => {
    const { env, sql } = mockEnvWithSql();

    const response = await route(new Request(`https://ledger.test${pathname}`), env);

    expect(response.status).toBe(200);
    expect(sql).toHaveLength(1);
    expect(normalizeSql(sql[0])).toContain(expectedFrom);
  });
});
