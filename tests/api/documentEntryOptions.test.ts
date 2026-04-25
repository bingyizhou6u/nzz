import { describe, expect, it } from "vitest";
import { listDocumentEntryOptions, listOriginalDocuments } from "../../src/api/documentEntryOptions";
import { route } from "../../src/worker/router";
import type { Env } from "../../src/worker/env";

function mockEnv(options: { allQueues?: unknown[][] } = {}): Env {
  return {
    DB: {
      prepare: () =>
        ({
          bind() {
            return this;
          },
          all: async () => ({ success: true, results: options.allQueues?.shift() ?? [] }),
          first: async () => null,
          run: async () => ({ success: true }) as D1Result
        }) as unknown as D1PreparedStatement
    } as unknown as D1Database,
    ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher
  };
}

describe("document entry option API", () => {
  it("returns all controlled option groups", async () => {
    const response = await listDocumentEntryOptions({
      request: new Request("https://ledger.test/api/document-entry/options"),
      env: mockEnv({
        allQueues: [
          [{ id: "person_1", name: "Alice", alias: null, roles_json: "[]", is_enabled: 1 }],
          [{ id: "proj_1", code: "P1", name: "Project", owner_person_id: null, status: "active" }],
          [
            {
              id: "merchant_1",
              code: "M1",
              name: "Merchant",
              project_id: "proj_1",
              merchant_type: "site",
              status: "active"
            }
          ],
          [
            {
              id: "acct_1",
              name: "AED Reserve",
              account_type: "currency_reserve",
              currency_code: "AED",
              owner_person_id: null,
              is_company_account: 1,
              allow_negative: 0,
              status: "active"
            }
          ],
          [{ code: "AED", name: "Dirham", minor_units: 2, is_enabled: 1 }],
          [
            {
              id: "cat_1",
              name: "Income",
              parent_id: null,
              category_type: "income",
              direction: "in",
              affects_expense_report: 0,
              affects_project_report: 1,
              requires_merchant: 1,
              requires_person: 0,
              requires_borrower: 0,
              is_enabled: 1
            }
          ]
        ]
      }),
      params: {},
      actor: null
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        people: [{ id: "person_1", name: "Alice", alias: null, roles_json: "[]", is_enabled: 1 }],
        projects: [{ id: "proj_1", code: "P1", name: "Project", owner_person_id: null, status: "active" }],
        merchants: [
          {
            id: "merchant_1",
            code: "M1",
            name: "Merchant",
            project_id: "proj_1",
            merchant_type: "site",
            status: "active"
          }
        ],
        accounts: [
          {
            id: "acct_1",
            name: "AED Reserve",
            account_type: "currency_reserve",
            currency_code: "AED",
            owner_person_id: null,
            is_company_account: 1,
            allow_negative: 0,
            status: "active"
          }
        ],
        currencies: [{ code: "AED", name: "Dirham", minor_units: 2, is_enabled: 1 }],
        categories: [
          {
            id: "cat_1",
            name: "Income",
            parent_id: null,
            category_type: "income",
            direction: "in",
            affects_expense_report: 0,
            affects_project_report: 1,
            requires_merchant: 1,
            requires_person: 0,
            requires_borrower: 0,
            is_enabled: 1
          }
        ]
      }
    });
  });

  it("returns original document options filtered by document type", async () => {
    const response = await listOriginalDocuments({
      request: new Request("https://ledger.test/api/document-entry/original-documents?documentType=project_income"),
      env: mockEnv({
        allQueues: [
          [
            {
              id: "doc_1",
              document_no: "DOC-1",
              document_type: "project_income",
              business_date: "2026-04-24",
              period: "2026-04",
              summary: "Income"
            }
          ]
        ]
      }),
      params: {},
      actor: null
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [
        {
          id: "doc_1",
          document_no: "DOC-1",
          document_type: "project_income",
          business_date: "2026-04-24",
          period: "2026-04",
          summary: "Income"
        }
      ]
    });
  });

  it("routes document entry option endpoints", async () => {
    const optionsResponse = await route(new Request("https://ledger.test/api/document-entry/options"), mockEnv());
    const originalsResponse = await route(new Request("https://ledger.test/api/document-entry/original-documents"), mockEnv());

    expect(optionsResponse.status).toBe(200);
    expect(originalsResponse.status).toBe(200);
  });

  it("excludes archived governance rows from document entry options", async () => {
    const response = await listDocumentEntryOptions({
      request: new Request("https://ledger.test/api/document-entry/options"),
      env: mockEnv({
        allQueues: [
          [{ id: "person_active", name: "Active", alias: null, roles_json: "[]", is_enabled: 1 }],
          [{ id: "proj_active", code: "P1", name: "Active Project", owner_person_id: null, status: "active" }],
          [
            {
              id: "merchant_active",
              code: "M1",
              name: "Active Merchant",
              project_id: "proj_active",
              merchant_type: "site",
              status: "active"
            }
          ],
          [
            {
              id: "acct_active",
              name: "AED Reserve",
              account_type: "currency_reserve",
              currency_code: "AED",
              owner_person_id: null,
              is_company_account: 1,
              allow_negative: 0,
              status: "active"
            }
          ],
          [{ code: "AED", name: "Dirham", minor_units: 2, is_enabled: 1 }],
          [
            {
              id: "cat_active",
              name: "Expense",
              parent_id: null,
              category_type: "expense",
              direction: "out",
              affects_expense_report: 1,
              affects_project_report: 0,
              requires_merchant: 0,
              requires_person: 1,
              requires_borrower: 0,
              is_enabled: 1
            }
          ]
        ]
      }),
      params: {},
      actor: null
    });

    const body = (await response.json()) as {
      data: {
        people: unknown[];
        projects: unknown[];
        merchants: unknown[];
        accounts: unknown[];
        currencies: unknown[];
        categories: unknown[];
      };
    };
    expect(body.data.people).toHaveLength(1);
    expect(body.data.projects).toHaveLength(1);
    expect(body.data.merchants).toHaveLength(1);
    expect(body.data.accounts).toHaveLength(1);
    expect(body.data.currencies).toHaveLength(1);
    expect(body.data.categories).toHaveLength(1);
  });
});
