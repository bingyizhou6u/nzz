import { describe, expect, it } from "vitest";
import { approveDocument, createDocument, getDocument, rejectDocument, submitDocument } from "../../src/api/documents";
import type { AuthenticatedActor } from "../../src/auth/types";
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

function validProjectIncomeDocumentRow(overrides: Record<string, unknown> = {}) {
  return documentRow({
    operator_person_id: "user_1",
    project_id: "proj_1",
    merchant_id: "merchant_1",
    category_id: "cat_income",
    ...overrides
  });
}

function projectIncomeMasterDataResults() {
  return [
    [{ id: "user_1", name: "User", alias: null, roles_json: "[]", is_enabled: 1 }],
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
}

const financeEntryActor: AuthenticatedActor = {
  personId: "user_1",
  name: "User",
  alias: null,
  email: "user@example.com",
  roles: ["finance_entry"]
};

const financeManagerActor: AuthenticatedActor = {
  personId: "reviewer_1",
  name: "Reviewer",
  alias: null,
  email: "reviewer@example.com",
  roles: ["finance_manager"]
};

const readonlyActor: AuthenticatedActor = {
  personId: "readonly_1",
  name: "Reader",
  alias: null,
  email: "reader@example.com",
  roles: ["readonly"]
};

function mockEnv(
  options: {
    runResult?: D1Result;
    batchResults?: D1Result[];
    allResults?: unknown[];
    allResultsQueue?: unknown[][];
    firstResult?: unknown;
    firstResults?: unknown[];
    enabledPersonIds?: string[];
    rolesJson?: string;
    onBusinessQuery?: (sql: string) => void;
    onBind?: (values: unknown[], sql: string) => void;
    onBatch?: (statements: PreparedMock[]) => void;
  } = {}
): Env {
  const enabledPersonIds = options.enabledPersonIds ?? ["user_1", "reviewer_1"];

  return {
    AUTH_MODE: "development",
    ALLOW_INSECURE_DEV_AUTH: "true",
    DEV_ACTOR_EMAIL: "finance@example.test",
    CF_ACCESS_TEAM_DOMAIN: "",
    CF_ACCESS_AUD: "",
    DB: {
      prepare: (sql: string) => {
        const normalizedSql = sql.replace(/\s+/g, " ").toLowerCase();
        const isAuthQuery =
          normalizedSql.includes("where lower(login_email) = ?") ||
          normalizedSql.includes("update people set last_login_at = ?");
        if (!isAuthQuery) options.onBusinessQuery?.(sql);
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
            if (normalizedSql.includes("where lower(login_email) = ?") && normalizedSql.includes("is_enabled = 1")) {
              return Promise.resolve({
                id: "person_finance",
                name: "Finance",
                alias: "fin",
                login_email: "finance@example.test",
                roles_json: options.rolesJson ?? "[\"finance_manager\"]",
                is_enabled: 1
              });
            }
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
    error: "documentType, businessDate, period, and summary are required"
  };
  const invalidDocumentTypeOrActionTypeError = { error: "Invalid document type or action type" };
  const invalidBusinessDateOrPeriodError = { error: "Invalid business date or period" };
  const requiredOriginalDocumentError = {
    error: "originalDocumentId is required for reversal, loan repayment, or loan writeoff"
  };

  it("uses authenticated actor instead of body createdBy on document creation", async () => {
    const response = await createDocument({
      request: new Request("https://ledger.test/api/documents", {
        method: "POST",
        body: JSON.stringify({
          documentType: "project_income",
          businessDate: "2026-04-24",
          period: "2026-04",
          summary: "Initial income",
          createdBy: "spoofed_person",
          lines: [validLine()]
        })
      }),
      env: mockEnv(),
      params: {},
      actor: financeEntryActor
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "请求中的操作人和当前登录人不一致" });
  });

  it("lets authenticated actor create when body actor is omitted", async () => {
    const response = await createDocument({
      request: new Request("https://ledger.test/api/documents", {
        method: "POST",
        body: JSON.stringify({
          documentType: "project_income",
          businessDate: "2026-04-24",
          period: "2026-04",
          summary: "Initial income",
          lines: [validLine()]
        })
      }),
      env: mockEnv({ allResultsQueue: projectIncomeMasterDataResults() }),
      params: {},
      actor: financeEntryActor
    });

    expect(response.status).toBe(201);
  });

  it("rejects document creation when body createdBy does not match authenticated actor", async () => {
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
      params: {},
      actor: financeEntryActor
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "请求中的操作人和当前登录人不一致" });
  });

  it("rejects document submission when body actor does not match authenticated actor", async () => {
    const response = await submitDocument({
      request: new Request("https://ledger.test/api/documents/doc_1/submit", {
        method: "POST",
        body: JSON.stringify({ actor: "freeform_user" })
      }),
      env: mockEnv(),
      params: { id: "doc_1" },
      actor: financeEntryActor
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "请求中的操作人和当前登录人不一致" });
  });

  it("rejects document approval when body reviewer does not match authenticated actor", async () => {
    const response = await approveDocument({
      request: new Request("https://ledger.test/api/documents/doc_1/approve", {
        method: "POST",
        body: JSON.stringify({ reviewer: "freeform_user" })
      }),
      env: mockEnv(),
      params: { id: "doc_1" },
      actor: financeManagerActor
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "请求中的操作人和当前登录人不一致" });
  });

  it("rejects document rejection when body actor does not match authenticated actor", async () => {
    const response = await rejectDocument({
      request: new Request("https://ledger.test/api/documents/doc_1/reject", {
        method: "POST",
        body: JSON.stringify({ actor: "freeform_user", reason: "Missing receipt" })
      }),
      env: mockEnv(),
      params: { id: "doc_1" },
      actor: financeManagerActor
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "请求中的操作人和当前登录人不一致" });
  });

  it("rejects document creation without create permission", async () => {
    const response = await createDocument({
      request: new Request("https://ledger.test/api/documents", {
        method: "POST",
        body: JSON.stringify({
          documentType: "project_income",
          businessDate: "2026-04-24",
          period: "2026-04",
          summary: "Initial income",
          lines: [validLine()]
        })
      }),
      env: mockEnv(),
      params: {},
      actor: readonlyActor
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "权限不足" });
  });

  it("rejects document submission without submit permission", async () => {
    const response = await submitDocument({
      request: new Request("https://ledger.test/api/documents/doc_1/submit", {
        method: "POST",
        body: JSON.stringify({})
      }),
      env: mockEnv(),
      params: { id: "doc_1" },
      actor: readonlyActor
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "权限不足" });
  });

  it("rejects document rejection without reject permission", async () => {
    const response = await rejectDocument({
      request: new Request("https://ledger.test/api/documents/doc_1/reject", {
        method: "POST",
        body: JSON.stringify({ reason: "Missing receipt" })
      }),
      env: mockEnv(),
      params: { id: "doc_1" },
      actor: readonlyActor
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "权限不足" });
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
          lines: [validLine()]
        })
      }),
      env: mockEnv({
        onBind: (values, sql) => {
          if (sql.toLowerCase().includes("insert into documents")) boundValues = values;
        }
      }),
      params: {},
      actor: financeEntryActor
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: { id: string; documentNo: string; status: string } };
    expect(body.data.id).toMatch(/^doc_/);
    expect(body.data.documentNo).toMatch(/^docno_/);
    expect(body.data.status).toBe("draft");
    expect(boundValues[3]).toBe("normal");
    expect(boundValues[11]).toBeNull();
  });

  it("passes authenticated request audit metadata when creating documents", async () => {
    let auditBindings: unknown[] = [];
    const response = await createDocument({
      request: new Request("https://ledger.test/api/documents", {
        method: "POST",
        headers: {
          "cf-ray": "ray_doc_create",
          "cf-connecting-ip": "203.0.113.20",
          "user-agent": "Vitest documents"
        },
        body: JSON.stringify({
          documentType: "project_income",
          businessDate: "2026-04-24",
          period: "2026-04",
          summary: "Initial income",
          lines: [validLine()]
        })
      }),
      env: mockEnv({
        onBind: (values, sql) => {
          if (sql.toLowerCase().includes("insert into audit_logs")) auditBindings = values;
        }
      }),
      params: {},
      actor: financeEntryActor
    });

    expect(response.status).toBe(201);
    expect(auditBindings.slice(1, 13)).toEqual([
      "user_1",
      "document.create",
      "document",
      expect.stringMatching(/^doc_/),
      null,
      expect.any(String),
      null,
      "user_1",
      "user@example.com",
      "ray_doc_create",
      "203.0.113.20",
      "Vitest documents"
    ]);
  });

  it("stores trimmed original document linkage for reversal documents when provided", async () => {
    let boundValues: unknown[] = [];
    const response = await createDocument({
      request: new Request("https://ledger.test/api/documents", {
        method: "POST",
        body: JSON.stringify({
          documentType: "project_income",
          actionType: "reversal",
          businessDate: "2026-04-24",
          period: "2026-04",
          originalDocumentId: "  doc_original  ",
          summary: "Reverse income",
          createdBy: "user_1"
        })
      }),
      env: mockEnv({
        onBind: (values, sql) => {
          if (sql.toLowerCase().includes("insert into documents")) boundValues = values;
        }
      }),
      params: {},
      actor: financeEntryActor
    });

    expect(response.status).toBe(201);
    expect(boundValues[3]).toBe("reversal");
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
      params: {},
      actor: financeEntryActor
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(requiredDocumentFieldsError);
  });

  it.each(["invalid", "manual_adjustment"])("rejects %s document types", async (documentType) => {
    const response = await createDocument({
      request: new Request("https://ledger.test/api/documents", {
        method: "POST",
        body: JSON.stringify({
          documentType,
          businessDate: "2026-04-24",
          period: "2026-04",
          summary: "Initial income",
          createdBy: "user_1",
          lines: [validLine()]
        })
      }),
      env: mockEnv(),
      params: {},
      actor: financeEntryActor
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(invalidDocumentTypeOrActionTypeError);
  });

  it.each(["invalid", "correction", "repost"])("rejects %s action types", async (actionType) => {
    const response = await createDocument({
      request: new Request("https://ledger.test/api/documents", {
        method: "POST",
        body: JSON.stringify({
          documentType: "project_income",
          actionType,
          businessDate: "2026-04-24",
          period: "2026-04",
          summary: "Initial income",
          createdBy: "user_1",
          lines: [validLine()]
        })
      }),
      env: mockEnv(),
      params: {},
      actor: financeEntryActor
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
      params: {},
      actor: financeEntryActor
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(invalidBusinessDateOrPeriodError);
  });

  it("requires originalDocumentId for reversal documents", async () => {
    const response = await createDocument({
      request: new Request("https://ledger.test/api/documents", {
        method: "POST",
        body: JSON.stringify({
          documentType: "project_income",
          actionType: "reversal",
          businessDate: "2026-04-24",
          period: "2026-04",
          originalDocumentId: "   ",
          summary: "Linked document",
          createdBy: "user_1",
          lines: [validLine()]
        })
      }),
      env: mockEnv(),
      params: {},
      actor: financeEntryActor
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(requiredOriginalDocumentError);
  });

  it.each(["loan_repayment", "loan_writeoff"] as const)(
    "requires originalDocumentId for normal %s documents",
    async (documentType) => {
      const response = await createDocument({
        request: new Request("https://ledger.test/api/documents", {
          method: "POST",
          body: JSON.stringify({
            documentType,
            actionType: "normal",
            businessDate: "2026-04-24",
            period: "2026-04",
            originalDocumentId: "   ",
            summary: "Reduce loan",
            createdBy: "user_1",
            categoryId: documentType === "loan_writeoff" ? "cat_bad_debt" : undefined,
            lines: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 10000, borrowerPersonId: "person_1" }]
          })
        }),
        env: mockEnv(),
        params: {},
        actor: financeEntryActor
      });

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual(requiredOriginalDocumentError);
    }
  );

  it("routes document creation requests", async () => {
    const response = await route(
      new Request("https://ledger.test/api/documents", {
        method: "POST",
        body: JSON.stringify({
          documentType: "project_income",
          businessDate: "2026-04-24",
          period: "2026-04",
          summary: "Initial income",
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
          documentType: "project_income",
          businessDate: "2026-04-24",
          period: "2026-04",
          summary: "Header-only income"
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
      params: {},
      actor: financeEntryActor
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
      params: {},
      actor: financeEntryActor
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "line accountId is required" });
  });

  it("routes document listing requests", async () => {
    const response = await route(new Request("https://ledger.test/api/documents"), mockEnv({ allResults: [documentRow()] }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: [documentRow()] });
  });

  it("rejects document reads without view permission before running the handler", async () => {
    let businessQueries = 0;
    const response = await route(
      new Request("https://ledger.test/api/documents"),
      mockEnv({
        rolesJson: "[\"borrower\"]",
        onBusinessQuery: () => {
          businessQueries += 1;
        }
      })
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "权限不足" });
    expect(businessQueries).toBe(0);
  });

  it("routes document submission requests with path params", async () => {
    const response = await route(
      new Request("https://ledger.test/api/documents/doc_1/submit", {
        method: "POST",
        body: JSON.stringify({})
      }),
      mockEnv({
        firstResult: validProjectIncomeDocumentRow({ status: "draft" }),
        allResultsQueue: [[lineRow()], ...projectIncomeMasterDataResults()]
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { id: "doc_1", status: "pending" } });
  });

  it("passes authenticated request audit metadata when submitting documents", async () => {
    let auditBindings: unknown[] = [];
    const response = await submitDocument({
      request: new Request("https://ledger.test/api/documents/doc_1/submit", {
        method: "POST",
        headers: {
          "x-request-id": "req_doc_submit",
          "x-forwarded-for": "198.51.100.20",
          "user-agent": "Vitest submit"
        },
        body: JSON.stringify({})
      }),
      env: mockEnv({
        firstResult: validProjectIncomeDocumentRow({ status: "draft" }),
        allResultsQueue: [[lineRow()], ...projectIncomeMasterDataResults()],
        onBind: (values, sql) => {
          if (sql.toLowerCase().includes("insert into audit_logs")) auditBindings = values;
        }
      }),
      params: { id: "doc_1" },
      actor: financeEntryActor
    });

    expect(response.status).toBe(200);
    expect(auditBindings.slice(8, 13)).toEqual([
      "user_1",
      "user@example.com",
      "req_doc_submit",
      "198.51.100.20",
      "Vitest submit"
    ]);
  });

  it("returns 400 when submit governance rejects an incomplete draft", async () => {
    const response = await submitDocument({
      request: new Request("https://ledger.test/api/documents/doc_1/submit", {
        method: "POST",
        body: JSON.stringify({ actor: "user_1" })
      }),
      env: mockEnv({
        firstResult: validProjectIncomeDocumentRow({ status: "draft", merchant_id: null }),
        allResultsQueue: [[lineRow()]]
      }),
      params: { id: "doc_1" },
      actor: financeEntryActor
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "项目收入必须选择商户" });
  });

  it("routes document approval requests with path params", async () => {
    const response = await route(
      new Request("https://ledger.test/api/documents/doc_1/approve", {
        method: "POST",
        body: JSON.stringify({})
      }),
      mockEnv({
        firstResults: [validProjectIncomeDocumentRow({ status: "pending" }), null],
        allResultsQueue: [[lineRow()], ...projectIncomeMasterDataResults()]
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { id: "doc_1", status: "approved" } });
  });

  it("returns 400 when approve governance rejects master data relationships", async () => {
    const [, projectRows, merchantRows, accountRows, categoryRows, currencyRows] = projectIncomeMasterDataResults();
    const response = await approveDocument({
      request: new Request("https://ledger.test/api/documents/doc_1/approve", {
        method: "POST",
        body: JSON.stringify({ reviewer: "reviewer_1" })
      }),
      env: mockEnv({
        firstResults: [validProjectIncomeDocumentRow({ status: "pending" }), null],
        allResultsQueue: [
          [lineRow()],
          [{ id: "user_1", name: "User", alias: null, roles_json: "[]", is_enabled: 1 }],
          projectRows,
          merchantRows.map((merchant) => ({ ...merchant, project_id: "proj_other" })),
          accountRows,
          categoryRows,
          currencyRows
        ]
      }),
      params: { id: "doc_1" },
      actor: financeManagerActor
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "商户必须属于所选项目" });
  });

  it("routes reversal approval requests using original posting entries", async () => {
    const bindCalls: Array<{ sql: string; bindings: unknown[] }> = [];
    let batchStatements: PreparedMock[] = [];
    const response = await route(
      new Request("https://ledger.test/api/documents/doc_reversal/approve", {
        method: "POST",
        body: JSON.stringify({})
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
        allResultsQueue: [[], [], [{ account_id: "acct_usdt", currency_code: "USDT", amount_minor: 120000 }], []],
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
    const documentLineReads = bindCalls.filter((call) => call.sql.toLowerCase().includes("from document_lines"));
    expect(documentLineReads.map((call) => call.bindings)).toEqual([["doc_reversal"], ["doc_original"]]);

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
        body: JSON.stringify({ reason: "Missing receipt" })
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
        body: JSON.stringify({})
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
      params: { id: "doc_1" },
      actor: null
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: { document: documentRow(), lines: [lineRow()] } });
  });

  it("returns 404 when a document detail is missing", async () => {
    const response = await getDocument({
      request: new Request("https://ledger.test/api/documents/doc_missing"),
      env: mockEnv(),
      params: { id: "doc_missing" },
      actor: null
    });

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Document not found" });
  });

  it("rejects document approval without approval permission", async () => {
    const response = await approveDocument({
      request: new Request("https://ledger.test/api/documents/doc_1/approve", {
        method: "POST",
        body: JSON.stringify({})
      }),
      env: mockEnv(),
      params: { id: "doc_1" },
      actor: financeEntryActor
    });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "权限不足" });
  });

  it("requires actor and reason to reject documents", async () => {
    const response = await rejectDocument({
      request: new Request("https://ledger.test/api/documents/doc_1/reject", {
        method: "POST",
        body: JSON.stringify({})
      }),
      env: mockEnv(),
      params: { id: "doc_1" },
      actor: financeManagerActor
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "reason is required" });
  });
});
