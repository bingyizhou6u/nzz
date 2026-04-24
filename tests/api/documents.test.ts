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
    expect(body.data.documentNo).toMatch(/^DOC-\d+$/);
    expect(body.data.status).toBe("draft");
    expect(boundValues[3]).toBe("normal");
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
