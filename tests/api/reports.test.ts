import { describe, expect, it } from "vitest";
import {
  accountBalances,
  exceptionChecks,
  expenseDetails,
  expenseSummary,
  loanAging,
  loanAllocations,
  loanWriteoffs,
  lotBalances,
  merchantIncome,
  monthlyOperatingSummary,
  projectIncome,
  projectProfitLoss,
  reportFilterOptions
} from "../../src/api/reports";
import { route } from "../../src/worker/router";
import type { Env } from "../../src/worker/env";

function mockEnv(rows: unknown[] = []): Env {
  return mockEnvWithSql(rows).env;
}

function mockEnvWithSql(
  rows: unknown[] = [],
  options: { rolesJson?: string } = {}
): { env: Env; sql: string[]; bindings: unknown[][] } {
  const sql: string[] = [];
  const bindings: unknown[][] = [];
  return {
    env: {
      AUTH_MODE: "development",
      ALLOW_INSECURE_DEV_AUTH: "true",
      DEV_ACTOR_EMAIL: "finance@example.test",
      CF_ACCESS_TEAM_DOMAIN: "",
      CF_ACCESS_AUD: "",
      DB: {
        prepare: (query: string) => {
          const normalizedQuery = query.replace(/\s+/g, " ").toLowerCase();
          const isAuthQuery =
            normalizedQuery.includes("where lower(login_email) = ?") ||
            normalizedQuery.includes("update people set last_login_at = ?");
          if (!isAuthQuery) sql.push(query);
          return {
            bind(...values: unknown[]) {
              if (!isAuthQuery) bindings.push(values);
              return this;
            },
            all: async () => ({ success: true, results: rows }),
            first: async () => {
              if (normalizedQuery.includes("where lower(login_email) = ?") && normalizedQuery.includes("is_enabled = 1")) {
                return {
                  id: "person_finance",
                  name: "Finance",
                  alias: "fin",
                  login_email: "finance@example.test",
                  roles_json: options.rolesJson ?? "[\"finance_manager\"]",
                  is_enabled: 1
                };
              }
              return null;
            },
            run: async () => ({ success: true } as D1Result)
          } as unknown as D1PreparedStatement;
        }
      } as unknown as D1Database,
      ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher
    },
    sql,
    bindings
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
      params: {},
      actor: null
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
      params: {},
      actor: null
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
      params: {},
      actor: null
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: rows });
  });

  it.each([
    ["project income", projectIncome, "/api/reports/project-income?period=2026-04&projectId=proj_1"],
    ["merchant income", merchantIncome, "/api/reports/merchant-income?period=2026-04"],
    ["expense details", expenseDetails, "/api/reports/expense-details?period=2026-04"],
    ["expense summary", expenseSummary, "/api/reports/expense-summary?period=2026-04"],
    ["project profit loss", projectProfitLoss, "/api/reports/project-profit-loss?period=2026-04"],
    ["monthly operating", monthlyOperatingSummary, "/api/reports/monthly-operating?period=2026-04"],
    ["exception checks", exceptionChecks, "/api/reports/exception-checks?staleDays=45"]
  ])("returns %s from formal report handler", async (_label, handler, pathname) => {
    const rows = [{ id: "row_1" }];

    const response = await handler({
      request: new Request(`https://ledger.test${pathname}`),
      env: mockEnv(rows),
      params: {},
      actor: null
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: rows });
  });

  it("returns formal report filter options from the handler", async () => {
    const { env, sql } = mockEnvWithSql();

    const response = await reportFilterOptions({
      request: new Request("https://ledger.test/api/reports/filter-options"),
      env,
      params: {},
      actor: null
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        projects: [],
        merchants: [],
        people: [],
        currencies: []
      }
    });
    expect(sql.map(normalizeSql)).toEqual([
      expect.stringContaining("from projects"),
      expect.stringContaining("from merchants"),
      expect.stringContaining("from people"),
      expect.stringContaining("from currencies")
    ]);
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
    "/api/reports/pending-costs",
    "/api/reports/project-income",
    "/api/reports/merchant-income",
    "/api/reports/expense-details",
    "/api/reports/expense-summary",
    "/api/reports/project-profit-loss",
    "/api/reports/monthly-operating",
    "/api/reports/exception-checks"
  ])("routes GET %s", async (pathname) => {
    const response = await route(new Request(`https://ledger.test${pathname}`), mockEnv());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: [] });
  });

  it("routes GET /api/reports/filter-options", async () => {
    const response = await route(new Request("https://ledger.test/api/reports/filter-options"), mockEnv());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        projects: [],
        merchants: [],
        people: [],
        currencies: []
      }
    });
  });

  it("rejects report reads without view permission before running the report query", async () => {
    const { env, sql } = mockEnvWithSql([], { rolesJson: "[\"borrower\"]" });

    const response = await route(new Request("https://ledger.test/api/reports/account-balances"), env);

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "权限不足" });
    expect(sql).toHaveLength(0);
  });

  it.each([
    ["/api/reports/lots", "from lots"],
    ["/api/reports/lot-movements", "from lot_movements"],
    ["/api/reports/pending-costs", "from pending_cost_matches"],
    ["/api/reports/loan-aging", "from loan_items li"],
    ["/api/reports/loan-allocations", "from loan_allocations la"],
    ["/api/reports/loan-writeoffs", "from loan_allocations la"],
    ["/api/reports/project-income", "from account_entries ae"],
    ["/api/reports/merchant-income", "d.merchant_id is not null"],
    ["/api/reports/expense-details", "from expense_detail_rows"],
    ["/api/reports/expense-summary", "from expense_detail_rows"],
    ["/api/reports/project-profit-loss", "from project_profit_loss_rows"],
    ["/api/reports/monthly-operating", "from project_profit_loss_rows"],
    ["/api/reports/exception-checks", "from pending_cost_matches pcm"]
  ])("routes GET %s to the expected report query", async (pathname, expectedFrom) => {
    const { env, sql } = mockEnvWithSql();

    const response = await route(new Request(`https://ledger.test${pathname}`), env);

    expect(response.status).toBe(200);
    expect(sql).toHaveLength(1);
    expect(normalizeSql(sql[0])).toContain(expectedFrom);
  });

  it("binds query params to formal report SQL", async () => {
    const { env, sql, bindings } = mockEnvWithSql();

    const response = await route(
      new Request("https://ledger.test/api/reports/project-income?period=2026-04&projectId=proj_1&currencyCode=aed"),
      env
    );

    expect(response.status).toBe(200);
    expect(sql).toHaveLength(1);
    expect(normalizeSql(sql[0])).toContain("d.period = ?");
    expect(normalizeSql(sql[0])).toContain("d.project_id = ?");
    expect(normalizeSql(sql[0])).toContain("ae.currency_code = ?");
    expect(bindings).toEqual([["2026-04", "proj_1", "AED"]]);
  });
});
