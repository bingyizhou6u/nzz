import { describe, expect, it } from "vitest";
import { approveDocument, createDocument, getDocument, rejectDocument } from "../../src/api/documents";
import { route } from "../../src/worker/router";
import type { Env } from "../../src/worker/env";

type PreparedMock = D1PreparedStatement & {
  sql: string;
  bindings: unknown[];
};

function validLine() {
  return {
    accountId: "acct_usdt",
    currencyCode: "USDT",
    amountMinor: 10000,
    usdtAmountMinor: 10000
  };
}

function documentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "doc_1",
    document_no: "docno_1",
    document_type: "project_income",
    action_type: "normal",
    business_date: "2026-04-24",
    period: "2026-04",
    summary: "Merchant income",
    status: "draft",
    created_by: "user_1",
    created_at: "2026-04-24T10:00:00.000Z",
    operator_person_id: null,
    project_id: null,
    merchant_id: null,
    category_id: null,
    original_document_id: null,
    reviewed_by: null,
    reviewed_at: null,
    reject_reason: null,
    ...overrides
  };
}

function lineRow(overrides: Record<string, unknown> = {}) {
  return {
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
    note: null,
    ...overrides
  };
}

function mockEnv(
  options: {
    runResult?: D1Result;
    batchResults?: D1Result[];
    allResults?: unknown[];
    firstResult?: unknown;
    onBind?: (values: unknown[], sql: string) => void;
    onBatch?: (statements: PreparedMock[]) => void;
  } = {}
): Env {
  return {
    DB: {
      prepare: (sql: string) => {
        const statement = {
          sql,
          bindings: [],
          bind(this: PreparedMock, ...values: unknown[]) {
            this.bindings = values;
            options.onBind?.(values, sql);
            return this;
          },
          all: async () => ({ success: true, results: options.allResults ?? [] }),
          first: async () => options.firstResult ?? null,
          run: async () => options.runResult ?? ({ success: true } as D1Result)
        } as unknown as PreparedMock;
        return statement;
      },
      batch: async (statements: D1PreparedStatement[]) => {
        options.onBatch?.(statements as PreparedMock[]);
        return options.batchResults ?? statements.map(() => ({ success: true }) as D1Result);
      }
    } as unknown as D1Database,
    ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher
  };
}

describe("documents API", () => {
  const requiredDocumentFieldsError = {
    error: "documentType, businessDate, period, summary, and createdBy are required"
  };
  const invalidDocumentTypeOrActionTypeError = { error: "Invalid document type or action type" };
  const invalidBusinessDateOrPeriodError = { error: "Invalid business date or period" };
  const requiredOriginalDocumentError = { error: "originalDocumentId is required for correction or reversal" };

  it("creates draft documents", async () => {
    let boundValues: unknown[] = [];
    const response = await createDocument({
      request: new Request("https://ledger.test/api/documents", {
        method: "POST",
        body: JSON.stringify({
          documentType: "project_income",
          businessDate: "2026-04-24",
          period: "2026-04",
          summary: "Initial income",
          createdBy: "user_1",
          lines: [validLine()]
        })
      }),
      env: mockEnv({
        onBind: (values, sql) => {
          if (sql.toLowerCase().includes("insert into documents")) boundValues = values;
        }
      }),
      params: {}
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: { id: string; documentNo: string; status: string } };
    expect(body.data.id).toMatch(/^doc_/);
    expect(body.data.documentNo).toMatch(/^docno_/);
    expect(body.data.status).toBe("draft");
    expect(boundValues[3]).toBe("normal");
    expect(boundValues[11]).toBeNull();
  });

  it("stores trimmed original document linkage when provided", async () => {
    let boundValues: unknown[] = [];
    const response = await createDocument({
      request: new Request("https://ledger.test/api/documents", {
        method: "POST",
        body: JSON.stringify({
          documentType: "project_income",
          actionType: "correction",
          businessDate: "2026-04-24",
          period: "2026-04",
          originalDocumentId: "  doc_original  ",
          summary: "Correct income",
          createdBy: "user_1",
          lines: [validLine()]
        })
      }),
      env: mockEnv({
        onBind: (values, sql) => {
          if (sql.toLowerCase().includes("insert into documents")) boundValues = values;
        }
      }),
      params: {}
    });

    expect(response.status).toBe(201);
    expect(boundValues[3]).toBe("correction");
    expect(boundValues[11]).toBe("doc_original");
  });

  it.each([
    ["missing required fields", JSON.stringify({ documentType: "project_income" })],
    ["null", JSON.stringify(null)],
    ["array", JSON.stringify([{ documentType: "project_income" }])],
    ["primitive", JSON.stringify("project_income")],
    ["malformed", "{"]
  ])("rejects %s document request bodies", async (_name, body) => {
    const response = await createDocument({
      request: new Request("https://ledger.test/api/documents", {
        method: "POST",
        body
      }),
      env: mockEnv(),
      params: {}
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(requiredDocumentFieldsError);
  });

  it("rejects invalid document types", async () => {
    const response = await createDocument({
      request: new Request("https://ledger.test/api/documents", {
        method: "POST",
        body: JSON.stringify({
          documentType: "invalid",
          businessDate: "2026-04-24",
          period: "2026-04",
          summary: "Initial income",
          createdBy: "user_1",
          lines: [validLine()]
        })
      }),
      env: mockEnv(),
      params: {}
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(invalidDocumentTypeOrActionTypeError);
  });

  it("rejects invalid action types", async () => {
    const response = await createDocument({
      request: new Request("https://ledger.test/api/documents", {
        method: "POST",
        body: JSON.stringify({
          documentType: "project_income",
          actionType: "invalid",
          businessDate: "2026-04-24",
          period: "2026-04",
          summary: "Initial income",
          createdBy: "user_1",
          lines: [validLine()]
        })
      }),
      env: mockEnv(),
      params: {}
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(invalidDocumentTypeOrActionTypeError);
  });

  it.each([
    ["impossible business date", { businessDate: "2026-02-30", period: "2026-02" }],
    ["invalid period", { businessDate: "2026-04-24", period: "2026-4" }],
    ["mismatched period", { businessDate: "2026-04-24", period: "2026-05" }]
  ])("rejects %s", async (_name, overrides) => {
    const response = await createDocument({
      request: new Request("https://ledger.test/api/documents", {
        method: "POST",
        body: JSON.stringify({
          documentType: "project_income",
          businessDate: overrides.businessDate,
          period: overrides.period,
          summary: "Initial income",
          createdBy: "user_1",
          lines: [validLine()]
        })
      }),
      env: mockEnv(),
      params: {}
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(invalidBusinessDateOrPeriodError);
  });

  it.each(["correction", "reversal"] as const)("requires originalDocumentId for %s documents", async (actionType) => {
    const response = await createDocument({
      request: new Request("https://ledger.test/api/documents", {
        method: "POST",
        body: JSON.stringify({
          documentType: "project_income",
          actionType,
          businessDate: "2026-04-24",
          period: "2026-04",
          originalDocumentId: "   ",
          summary: "Linked document",
          createdBy: "user_1",
          lines: [validLine()]
        })
      }),
      env: mockEnv(),
      params: {}
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(requiredOriginalDocumentError);
  });

  it("does not require originalDocumentId for repost documents", async () => {
    let boundValues: unknown[] = [];
    const response = await createDocument({
      request: new Request("https://ledger.test/api/documents", {
        method: "POST",
        body: JSON.stringify({
          documentType: "project_income",
          actionType: "repost",
          businessDate: "2026-04-24",
          period: "2026-04",
          summary: "Repost income",
          createdBy: "user_1",
          lines: [validLine()]
        })
      }),
      env: mockEnv({
        onBind: (values, sql) => {
          if (sql.toLowerCase().includes("insert into documents")) boundValues = values;
        }
      }),
      params: {}
    });

    expect(response.status).toBe(201);
    expect(boundValues[3]).toBe("repost");
    expect(boundValues[11]).toBeNull();
  });

  it("routes document creation requests", async () => {
    const response = await route(
      new Request("https://ledger.test/api/documents", {
        method: "POST",
        body: JSON.stringify({
          documentType: "manual_adjustment",
          businessDate: "2026-04-24",
          period: "2026-04",
          summary: "Adjustment",
          createdBy: "user_1",
          lines: [validLine()]
        })
      }),
      mockEnv()
    );

    expect(response.status).toBe(201);
  });

  it("routes document listing requests", async () => {
    const response = await route(new Request("https://ledger.test/api/documents"), mockEnv({ allResults: [documentRow()] }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: [documentRow()] });
  });

  it("routes document submission requests with path params", async () => {
    const response = await route(
      new Request("https://ledger.test/api/documents/doc_1/submit", {
        method: "POST",
        body: JSON.stringify({ actor: "user_1" })
      }),
      mockEnv({ firstResult: documentRow({ status: "draft" }) })
    );

    expect(response.status).not.toBe(404);
  });

  it("routes document approval requests with path params", async () => {
    const response = await route(
      new Request("https://ledger.test/api/documents/doc_1/approve", {
        method: "POST",
        body: JSON.stringify({ reviewer: "reviewer_1" })
      }),
      mockEnv({ firstResult: documentRow({ status: "pending" }) })
    );

    expect(response.status).not.toBe(404);
  });

  it("routes document rejection requests with path params", async () => {
    const response = await route(
      new Request("https://ledger.test/api/documents/doc_1/reject", {
        method: "POST",
        body: JSON.stringify({ actor: "reviewer_1", reason: "Missing receipt" })
      }),
      mockEnv({ firstResult: documentRow({ status: "pending" }) })
    );

    expect(response.status).not.toBe(404);
  });

  it("gets document details with lines when found", async () => {
    const response = await getDocument({
      request: new Request("https://ledger.test/api/documents/doc_1"),
      env: mockEnv({
        firstResult: documentRow(),
        allResults: [lineRow()]
      }),
      params: { id: "doc_1" }
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { document: documentRow(), lines: [lineRow()] } });
  });

  it("returns 404 when a document detail is missing", async () => {
    const response = await getDocument({
      request: new Request("https://ledger.test/api/documents/doc_missing"),
      env: mockEnv(),
      params: { id: "doc_missing" }
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Document not found" });
  });

  it("requires reviewer to approve documents", async () => {
    const response = await approveDocument({
      request: new Request("https://ledger.test/api/documents/doc_1/approve", {
        method: "POST",
        body: JSON.stringify({})
      }),
      env: mockEnv(),
      params: { id: "doc_1" }
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "reviewer is required" });
  });

  it("requires actor and reason to reject documents", async () => {
    const response = await rejectDocument({
      request: new Request("https://ledger.test/api/documents/doc_1/reject", {
        method: "POST",
        body: JSON.stringify({ actor: "user_1" })
      }),
      env: mockEnv(),
      params: { id: "doc_1" }
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "reason is required" });
  });
});
