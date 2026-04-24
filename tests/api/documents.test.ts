import { describe, expect, it } from "vitest";
import { createDocument } from "../../src/api/documents";
import { route } from "../../src/worker/router";
import type { Env } from "../../src/worker/env";

function mockEnv(options: { runResult?: D1Result; onBind?: (values: unknown[]) => void } = {}): Env {
  return {
    DB: {
      prepare: () =>
        ({
          bind(...values: unknown[]) {
            options.onBind?.(values);
            return this;
          },
          all: async () => ({ success: true, results: [] }),
          first: async () => null,
          run: async () => options.runResult ?? ({ success: true } as D1Result)
        }) as unknown as D1PreparedStatement
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
          createdBy: "user_1"
        })
      }),
      env: mockEnv({ onBind: (values) => (boundValues = values) }),
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
          createdBy: "user_1"
        })
      }),
      env: mockEnv({ onBind: (values) => (boundValues = values) }),
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
          createdBy: "user_1"
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
          createdBy: "user_1"
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
          createdBy: "user_1"
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
          createdBy: "user_1"
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
          createdBy: "user_1"
        })
      }),
      env: mockEnv({ onBind: (values) => (boundValues = values) }),
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
          createdBy: "user_1"
        })
      }),
      mockEnv()
    );

    expect(response.status).toBe(201);
  });
});
