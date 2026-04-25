import { describe, expect, it } from "vitest";
import { approveDocument, createDocument, getDocument, rejectDocument, submitDocument } from "../../src/api/documents";
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
    allResultsQueue?: unknown[][];
    firstResult?: unknown;
    firstResults?: unknown[];
    enabledPersonIds?: string[];
    onBind?: (values: unknown[], sql: string) => void;
    onBatch?: (statements: PreparedMock[]) => void;
  } = {}
): Env {
  const enabledPersonIds = options.enabledPersonIds ?? ["user_1", "reviewer_1"];

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
          all: async () => ({ success: true, results: options.allResultsQueue?.shift() ?? options.allResults ?? [] }),
          first(this: PreparedMock) {
            const normalizedSql = sql.replace(/\s+/g, " ").toLowerCase();
            if (normalizedSql.includes("from people") && normalizedSql.includes("is_enabled = 1")) {
              const personId = this.bindings[0];
              return Promise.resolve(
                typeof personId === "string" && enabledPersonIds.includes(personId) ? { id: personId } : null
              );
            }
            return Promise.resolve(options.firstResults?.shift() ?? options.firstResult ?? null);
          },
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

  it("rejects document creation when createdBy is not an enabled person", async () => {
    const response = await createDocument({
      request: new Request("https://ledger.test/api/documents", {
        method: "POST",
        body: JSON.stringify({
          documentType: "project_income",
          businessDate: "2026-04-24",
          period: "2026-04",
          summary: "Initial income",
          createdBy: "freeform_user",
          lines: [validLine()]
        })
      }),
      env: mockEnv(),
      params: {}
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "createdBy must reference an enabled person" });
  });

  it("rejects document submission when actor is not an enabled person", async () => {
    const response = await submitDocument({
      request: new Request("https://ledger.test/api/documents/doc_1/submit", {
        method: "POST",
        body: JSON.stringify({ actor: "freeform_user" })
      }),
      env: mockEnv(),
      params: { id: "doc_1" }
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "actor must reference an enabled person" });
  });

  it("rejects document approval when reviewer is not an enabled person", async () => {
    const response = await approveDocument({
      request: new Request("https://ledger.test/api/documents/doc_1/approve", {
        method: "POST",
        body: JSON.stringify({ reviewer: "freeform_user" })
      }),
      env: mockEnv(),
      params: { id: "doc_1" }
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "reviewer must reference an enabled person" });
  });

  it("rejects document rejection when actor is not an enabled person", async () => {
    const response = await rejectDocument({
      request: new Request("https://ledger.test/api/documents/doc_1/reject", {
        method: "POST",
        body: JSON.stringify({ actor: "freeform_user", reason: "Missing receipt" })
      }),
      env: mockEnv(),
      params: { id: "doc_1" }
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "actor must reference an enabled person" });
  });

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

  it("creates header-only draft documents for current UI payloads", async () => {
    let batchCalled = false;
    const response = await route(
      new Request("https://ledger.test/api/documents", {
        method: "POST",
        body: JSON.stringify({
          documentType: "manual_adjustment",
          businessDate: "2026-04-24",
          period: "2026-04",
          summary: "Header-only adjustment",
          createdBy: "user_1"
        })
      }),
      mockEnv({ onBatch: () => (batchCalled = true) })
    );

    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: { status: string } };
    expect(body.data.status).toBe("draft");
    expect(batchCalled).toBe(false);
  });

  it("creates accountless loan writeoff draft documents", async () => {
    let lineBindings: unknown[] = [];
    const response = await createDocument({
      request: new Request("https://ledger.test/api/documents", {
        method: "POST",
        body: JSON.stringify({
          documentType: "loan_writeoff",
          businessDate: "2026-04-24",
          period: "2026-04",
          originalDocumentId: "doc_loan",
          summary: "Write off bad loan",
          createdBy: "user_1",
          categoryId: "cat_bad_debt",
          lines: [{ currencyCode: "AED", amountMinor: 10000, borrowerPersonId: "person_1" }]
        })
      }),
      env: mockEnv({
        onBatch: (statements) => {
          lineBindings =
            statements.find((statement) => statement.sql.toLowerCase().includes("insert into document_lines"))?.bindings ?? [];
        }
      }),
      params: {}
    });

    expect(response.status).toBe(201);
    expect(lineBindings[4]).toBeNull();
    expect(lineBindings[8]).toBe("AED");
  });

  it("rejects invalid provided document lines", async () => {
    const response = await createDocument({
      request: new Request("https://ledger.test/api/documents", {
        method: "POST",
        body: JSON.stringify({
          documentType: "project_income",
          businessDate: "2026-04-24",
          period: "2026-04",
          summary: "Invalid lines",
          createdBy: "user_1",
          lines: [{ currencyCode: "USDT", amountMinor: 10000 }]
        })
      }),
      env: mockEnv(),
      params: {}
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "line accountId is required" });
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

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { id: "doc_1", status: "pending" } });
  });

  it("routes document approval requests with path params", async () => {
    const response = await route(
      new Request("https://ledger.test/api/documents/doc_1/approve", {
        method: "POST",
        body: JSON.stringify({ reviewer: "reviewer_1" })
      }),
      mockEnv({
        firstResults: [documentRow({ status: "pending" }), null],
        allResults: [lineRow()]
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { id: "doc_1", status: "approved" } });
  });

  it("routes reversal approval requests using original posting entries", async () => {
    const bindCalls: Array<{ sql: string; bindings: unknown[] }> = [];
    let batchStatements: PreparedMock[] = [];
    const response = await route(
      new Request("https://ledger.test/api/documents/doc_reversal/approve", {
        method: "POST",
        body: JSON.stringify({ reviewer: "reviewer_1" })
      }),
      mockEnv({
        firstResults: [
          documentRow({
            id: "doc_reversal",
            status: "pending",
            action_type: "reversal",
            business_date: "2026-04-25",
            period: "2026-04",
            original_document_id: "doc_original"
          }),
          null,
          documentRow({ id: "doc_original", status: "approved" })
        ],
        allResultsQueue: [[{ account_id: "acct_usdt", currency_code: "USDT", amount_minor: 120000 }], []],
        onBind: (bindings, sql) => {
          bindCalls.push({ sql, bindings });
        },
        onBatch: (statements) => {
          batchStatements = statements;
        }
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { id: "doc_reversal", status: "approved" } });

    const originalAccountEntriesRead = bindCalls.find((call) =>
      call.sql.toLowerCase().includes("from account_entries")
    );
    expect(originalAccountEntriesRead?.bindings).toEqual(["doc_original"]);
    expect(bindCalls.some((call) => call.sql.toLowerCase().includes("from document_lines"))).toBe(false);

    const accountEntryStatement = batchStatements.find((statement) =>
      statement.sql.toLowerCase().includes("insert into account_entries")
    );
    expect(accountEntryStatement?.bindings[1]).toBe("doc_reversal");
    expect(accountEntryStatement?.bindings[2]).toBe("acct_usdt");
    expect(accountEntryStatement?.bindings[4]).toBe(-120000);
    expect(accountEntryStatement?.bindings[5]).toBe("2026-04-25");
  });

  it("routes document rejection requests with path params", async () => {
    const response = await route(
      new Request("https://ledger.test/api/documents/doc_1/reject", {
        method: "POST",
        body: JSON.stringify({ actor: "reviewer_1", reason: "Missing receipt" })
      }),
      mockEnv({ firstResult: documentRow({ status: "pending" }) })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { id: "doc_1", status: "rejected" } });
  });

  it("returns client error for malformed encoded route params", async () => {
    const response = await route(
      new Request("https://ledger.test/api/documents/%E0%A4%A/submit", {
        method: "POST",
        body: JSON.stringify({ actor: "user_1" })
      }),
      mockEnv()
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid route parameter" });
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
