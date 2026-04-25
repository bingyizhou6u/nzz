import { describe, expect, it } from "vitest";
import { createProject, listCurrencies } from "../../src/api/masterData";
import { route } from "../../src/worker/router";
import type { Env } from "../../src/worker/env";

function mockEnv(options: { rows?: unknown[]; runResult?: D1Result } = {}): Env {
  return {
    DB: {
      prepare: () =>
        ({
          bind() {
            return this;
          },
          all: async () => ({ success: true, results: options.rows ?? [] }),
          first: async () => null,
          run: async () => options.runResult ?? ({ success: true } as D1Result)
        }) as unknown as D1PreparedStatement
    } as unknown as D1Database,
    ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher
  };
}

describe("master data API", () => {
  const requiredProjectFieldsError = { error: "code and name are required" };

  it("lists currencies", async () => {
    const response = await listCurrencies({
      request: new Request("https://ledger.test/api/currencies"),
      env: mockEnv({ rows: [{ code: "AED", name: "UAE Dirham", minor_units: 2, is_enabled: 1 }] }),
      params: {},
      actor: null
    });

    await expect(response.json()).resolves.toEqual({
      data: [{ code: "AED", name: "UAE Dirham", minor_units: 2, is_enabled: 1 }]
    });
  });

  it("creates projects", async () => {
    const response = await createProject({
      request: new Request("https://ledger.test/api/projects", {
        method: "POST",
        body: JSON.stringify({ code: "P001", name: "Project One", note: "Initial" })
      }),
      env: mockEnv(),
      params: {},
      actor: null
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: { code: string; name: string } };
    expect(body.data.code).toBe("P001");
    expect(body.data.name).toBe("Project One");
  });

  it("requires project code and name", async () => {
    const response = await createProject({
      request: new Request("https://ledger.test/api/projects", {
        method: "POST",
        body: JSON.stringify({ code: "P001" })
      }),
      env: mockEnv(),
      params: {},
      actor: null
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(requiredProjectFieldsError);
  });

  it.each([
    ["null", JSON.stringify(null)],
    ["array", JSON.stringify([{ code: "P001", name: "Project One" }])],
    ["primitive", JSON.stringify("P001")]
  ])("rejects %s project request bodies", async (_name, body) => {
    const response = await createProject({
      request: new Request("https://ledger.test/api/projects", {
        method: "POST",
        body
      }),
      env: mockEnv(),
      params: {},
      actor: null
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(requiredProjectFieldsError);
  });

  it("rejects malformed project request bodies", async () => {
    const response = await createProject({
      request: new Request("https://ledger.test/api/projects", {
        method: "POST",
        body: "{"
      }),
      env: mockEnv(),
      params: {},
      actor: null
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(requiredProjectFieldsError);
  });

  it.each([
    ["code", { code: " ", name: "Project One" }],
    ["name", { code: "P001", name: " " }]
  ])("requires non-blank project %s", async (_field, body) => {
    const response = await createProject({
      request: new Request("https://ledger.test/api/projects", {
        method: "POST",
        body: JSON.stringify(body)
      }),
      env: mockEnv(),
      params: {},
      actor: null
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual(requiredProjectFieldsError);
  });
});

describe("worker router", () => {
  it("routes known master data endpoints", async () => {
    const response = await route(new Request("https://ledger.test/api/currencies"), mockEnv());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: [] });
  });

  it("returns 404 for unknown API routes", async () => {
    const response = await route(new Request("https://ledger.test/api/unknown"), mockEnv());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });
});
