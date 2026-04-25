import { describe, expect, it } from "vitest";
import {
  approveReviewDocument,
  getReviewDocument,
  listReviewDocuments,
  previewReviewDocument,
  rejectReviewDocument
} from "../../src/api/review";
import type { AuthenticatedActor, PersonRole } from "../../src/auth/types";
import { route } from "../../src/worker/router";
import type { Env } from "../../src/worker/env";

type PreparedMock = D1PreparedStatement & {
  sql: string;
  bindings: unknown[];
};

const pendingDocument = {
  id: "doc_1",
  document_no: "docno_1",
  document_type: "project_income",
  action_type: "normal",
  business_date: "2026-04-24",
  period: "2026-04",
  submitted_at: "2026-04-24T11:00:00.000Z",
  summary: "Merchant income",
  status: "pending",
  created_by: "creator_1",
  created_at: "2026-04-24T10:00:00.000Z",
  operator_person_id: "person_bob",
  project_id: "proj_1",
  merchant_id: "merchant_1",
  category_id: "cat_income",
  original_document_id: null,
  reviewed_by: null,
  reviewed_at: null,
  reject_reason: null
};

const pendingReviewRow = {
  id: "doc_1",
  document_no: "docno_1",
  document_type: "project_income",
  business_date: "2026-04-24",
  period: "2026-04",
  submitted_at: "2026-04-24T11:00:00.000Z",
  summary: "Merchant income",
  created_by: "creator_1",
  operator_person_id: "person_bob",
  project_id: "proj_1",
  merchant_id: "merchant_1"
};

const lineRow = {
  id: "line_1",
  document_id: "doc_1",
  line_no: 1,
  line_type: "main",
  account_id: "acct_usdt",
  counterparty_account_id: null,
  person_id: null,
  borrower_person_id: null,
  currency_code: "USDT",
  amount_minor: 10000,
  usdt_amount_minor: 10000,
  exchange_rate_text: null,
  note: null
};

const masterDataRows = [
  [{ id: "person_bob", name: "Bob", alias: null, roles_json: "[]", is_enabled: 1 }],
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
      id: "acct_usdt",
      name: "USDT Wallet",
      account_type: "usdt_wallet",
      currency_code: "USDT",
      owner_person_id: null,
      is_company_account: 1,
      allow_negative: 0,
      status: "active"
    }
  ],
  [
    {
      id: "cat_income",
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
  ],
  [{ code: "USDT", name: "Tether", minor_units: 2, is_enabled: 1 }]
];

const manager: AuthenticatedActor = {
  personId: "manager_1",
  name: "Manager",
  alias: null,
  email: "manager@example.test",
  roles: ["finance_manager"]
};

const financeEntry: AuthenticatedActor = {
  personId: "entry_1",
  name: "Entry",
  alias: null,
  email: "entry@example.test",
  roles: ["finance_entry"]
};

function mockEnv(
  options: {
    rows?: unknown[];
    allRowsQueue?: unknown[][];
    firstRows?: unknown[];
    role?: PersonRole;
    businessQueries?: string[];
    bindCalls?: Array<{ sql: string; bindings: unknown[] }>;
    batchStatements?: PreparedMock[][];
  } = {}
): Env {
  const firstRows = [...(options.firstRows ?? [])];
  const allRowsQueue = [...(options.allRowsQueue ?? [])];

  return {
    AUTH_MODE: "development",
    ALLOW_INSECURE_DEV_AUTH: "true",
    DEV_ACTOR_EMAIL: "finance@example.test",
    CF_ACCESS_TEAM_DOMAIN: "",
    CF_ACCESS_AUD: "",
    DB: {
      prepare: (sql: string) => {
        const normalizedSql = sql.replace(/\s+/g, " ").toLowerCase();
        const isAuthSelect = normalizedSql.includes("where lower(login_email) = ?") && normalizedSql.includes("is_enabled = 1");
        const isAuthUpdate = normalizedSql.includes("update people set last_login_at = ?");
        if (!isAuthSelect && !isAuthUpdate) options.businessQueries?.push(sql);
        const statement = {
          sql,
          bindings: [],
          bind(this: PreparedMock, ...values: unknown[]) {
            this.bindings = values;
            if (!isAuthSelect && !isAuthUpdate) options.bindCalls?.push({ sql, bindings: values });
            return this;
          },
          all: async () => ({ success: true, results: allRowsQueue.length > 0 ? allRowsQueue.shift() : options.rows ?? [] }),
          first: async () => {
            if (isAuthSelect) {
              const role = options.role ?? "finance_manager";
              return {
                id: "person_finance",
                name: "Finance",
                alias: "fin",
                login_email: "finance@example.test",
                roles_json: JSON.stringify([role]),
                is_enabled: 1
              };
            }
            return firstRows.length > 0 ? firstRows.shift() : null;
          },
          run: async () => ({ success: true, meta: { changes: 1 } }) as unknown as D1Result
        } as unknown as PreparedMock;
        return statement;
      },
      batch: async (statements: D1PreparedStatement[]) => {
        options.batchStatements?.push(statements as PreparedMock[]);
        return statements.map(() => ({ success: true, meta: { changes: 1 } }) as unknown as D1Result);
      }
    } as unknown as D1Database,
    ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher
  };
}

describe("review API", () => {
  it("lets managers view the pending review queue", async () => {
    const response = await listReviewDocuments({
      request: new Request("https://ledger.test/api/review/documents"),
      env: mockEnv({ rows: [pendingReviewRow] }),
      params: {},
      actor: manager
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: [pendingReviewRow] });
  });

  it("rejects finance entry users from the pending review queue", async () => {
    const response = await listReviewDocuments({
      request: new Request("https://ledger.test/api/review/documents"),
      env: mockEnv({ rows: [pendingReviewRow] }),
      params: {},
      actor: financeEntry
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "权限不足" });
  });

  it("returns 404 when a pending review document detail is missing", async () => {
    const response = await getReviewDocument({
      request: new Request("https://ledger.test/api/review/documents/doc_missing"),
      env: mockEnv(),
      params: { id: "doc_missing" },
      actor: manager
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Document not found" });
  });

  it("requires preview capability for approval previews", async () => {
    const response = await previewReviewDocument({
      request: new Request("https://ledger.test/api/review/documents/doc_1/preview"),
      env: mockEnv(),
      params: { id: "doc_1" },
      actor: financeEntry
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "权限不足" });
  });

  it("routes approval previews for finance managers", async () => {
    const response = await route(
      new Request("https://ledger.test/api/review/documents/doc_1/preview"),
      mockEnv({
        firstRows: [pendingDocument, null],
        allRowsQueue: [[lineRow], ...masterDataRows]
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        accountEntries: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 10000, entryDate: "2026-04-24" }],
        loanEntries: [],
        lotCreations: [],
        lotUpdates: [],
        lotMovements: [],
        pendingCostCreations: [],
        pendingCostUpdates: [],
        pendingCostApplications: [],
        loanItemCreations: [],
        loanItemUpdates: [],
        loanAllocations: []
      }
    });
  });

  it("approves with the current actor from the review route", async () => {
    const batchStatements: PreparedMock[][] = [];
    const response = await approveReviewDocument({
      request: new Request("https://ledger.test/api/review/documents/doc_1/approve", {
        method: "POST",
        body: JSON.stringify({})
      }),
      env: mockEnv({
        firstRows: [pendingDocument, null],
        allRowsQueue: [[lineRow], ...masterDataRows],
        batchStatements
      }),
      params: { id: "doc_1" },
      actor: manager
    });

    expect(response.status).toBe(200);
    const bindings = batchStatements.flatMap((statements) => statements.flatMap((statement) => statement.bindings));
    expect(bindings).toContain("manager_1");
    expect(bindings).not.toContain("spoofed_reviewer");
  });

  it.each([
    ["reviewer", { reviewer: "spoofed_reviewer" }],
    ["actor", { actor: "spoofed_actor" }]
  ])("rejects spoofed %s values on review approval", async (_field, body) => {
    const response = await approveReviewDocument({
      request: new Request("https://ledger.test/api/review/documents/doc_1/approve", {
        method: "POST",
        body: JSON.stringify(body)
      }),
      env: mockEnv(),
      params: { id: "doc_1" },
      actor: manager
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "请求中的操作人和当前登录人不一致" });
  });

  it("rejects with a trimmed reason and the current actor", async () => {
    const bindCalls: Array<{ sql: string; bindings: unknown[] }> = [];
    const response = await rejectReviewDocument({
      request: new Request("https://ledger.test/api/review/documents/doc_1/reject", {
        method: "POST",
        body: JSON.stringify({ actor: "manager_1", reason: "  Missing receipt  " })
      }),
      env: mockEnv({ firstRows: [pendingDocument], bindCalls }),
      params: { id: "doc_1" },
      actor: manager
    });

    expect(response.status).toBe(200);
    const rejectUpdate = bindCalls.find((call) => call.sql.toLowerCase().includes("set status = 'rejected'"));
    const auditInsert = bindCalls.find((call) => call.sql.toLowerCase().includes("insert into audit_logs"));
    expect(rejectUpdate?.bindings).toEqual(["Missing receipt", "doc_1"]);
    expect(auditInsert?.bindings[1]).toBe("manager_1");
    expect(auditInsert?.bindings).not.toContain("spoofed_actor");
  });

  it.each([
    ["reviewer", { reviewer: "spoofed_reviewer", reason: "Missing receipt" }],
    ["actor", { actor: "spoofed_actor", reason: "Missing receipt" }]
  ])("rejects spoofed %s values on review rejection", async (_field, body) => {
    const response = await rejectReviewDocument({
      request: new Request("https://ledger.test/api/review/documents/doc_1/reject", {
        method: "POST",
        body: JSON.stringify(body)
      }),
      env: mockEnv(),
      params: { id: "doc_1" },
      actor: manager
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "请求中的操作人和当前登录人不一致" });
  });

  it("requires a nonblank rejection reason", async () => {
    const response = await rejectReviewDocument({
      request: new Request("https://ledger.test/api/review/documents/doc_1/reject", {
        method: "POST",
        body: JSON.stringify({ reason: "   " })
      }),
      env: mockEnv(),
      params: { id: "doc_1" },
      actor: manager
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "reason is required" });
  });

  it("does not bypass the router capability gate for review queue reads", async () => {
    const businessQueries: string[] = [];
    const response = await route(
      new Request("https://ledger.test/api/review/documents"),
      mockEnv({ role: "finance_entry", businessQueries })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "权限不足" });
    expect(businessQueries).toHaveLength(0);
  });
});
