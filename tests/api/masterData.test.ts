import { describe, expect, it } from "vitest";
import { createProject, listCurrencies } from "../../src/api/masterData";
import { route } from "../../src/worker/router";
import type { Env } from "../../src/worker/env";

function mockEnv(
  options: { rows?: unknown[]; runResult?: D1Result; rolesJson?: string; onBusinessQuery?: (sql: string) => void } = {}
): Env {
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
        return {
          bind() {
            return this;
          },
          all: async () => ({ success: true, results: options.rows ?? [] }),
          first: async () => {
            if (normalizedSql.includes("where lower(login_email) = ?") && normalizedSql.includes("is_enabled = 1")) {
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
          run: async () => options.runResult ?? ({ success: true } as D1Result)
        } as unknown as D1PreparedStatement;
      }
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

  it("does not route legacy project creation", async () => {
    const response = await route(
      new Request("https://ledger.test/api/projects", {
        method: "POST",
        body: JSON.stringify({ code: "P001", name: "Project One" })
      }),
      mockEnv()
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });

  it("rejects master data reads without view permission before running the handler", async () => {
    let businessQueries = 0;
    const response = await route(
      new Request("https://ledger.test/api/master-data/projects"),
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

  it("requires auth for master data routes by default before running handlers", async () => {
    let prepareCalls = 0;
    const response = await route(new Request("https://ledger.test/api/currencies"), {
      CF_ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com",
      CF_ACCESS_AUD: "audience",
      DB: {
        prepare: () => {
          prepareCalls += 1;
          return {
            bind() {
              return this;
            },
            all: async () => ({ success: true, results: [] }),
            first: async () => null,
            run: async () => ({ success: true }) as D1Result
          } as unknown as D1PreparedStatement;
        }
      } as unknown as D1Database,
      ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Missing Cloudflare Access JWT" });
    expect(prepareCalls).toBe(0);
  });

  it("authenticates before decoding malformed route params", async () => {
    const response = await route(new Request("https://ledger.test/api/documents/%E0%A4%A/submit", { method: "POST" }), {
      CF_ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com",
      CF_ACCESS_AUD: "audience",
      DB: {
        prepare: () =>
          ({
            bind() {
              return this;
            },
            all: async () => ({ success: true, results: [] }),
            first: async () => null,
            run: async () => ({ success: true }) as D1Result
          }) as unknown as D1PreparedStatement
      } as unknown as D1Database,
      ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher
    });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Missing Cloudflare Access JWT" });
  });

  it("returns 404 for unknown API routes", async () => {
    const response = await route(new Request("https://ledger.test/api/unknown"), mockEnv());

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Not found" });
  });
});
