import { describe, expect, it } from "vitest";
import { route } from "../../src/worker/router";
import type { Env } from "../../src/worker/env";

function env(firstRow: unknown): Env {
  return {
    AUTH_MODE: "development",
    DEV_ACTOR_EMAIL: "finance@example.test",
    CF_ACCESS_TEAM_DOMAIN: "",
    CF_ACCESS_AUD: "",
    DB: {
      prepare: () =>
        ({
          bind() {
            return this;
          },
          first: async () => firstRow,
          all: async () => ({ success: true, results: [] }),
          run: async () => ({ success: true }) as D1Result
        }) as unknown as D1PreparedStatement
    } as unknown as D1Database,
    ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher
  };
}

describe("/api/me", () => {
  it("returns authenticated actor and capabilities", async () => {
    const response = await route(
      new Request("https://ledger.test/api/me"),
      env({
        id: "person_finance",
        name: "Finance",
        alias: "fin",
        login_email: "finance@example.test",
        roles_json: "[\"finance_manager\"]",
        is_enabled: 1
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        person: {
          id: "person_finance",
          name: "Finance",
          alias: "fin",
          loginEmail: "finance@example.test",
          roles: ["finance_manager"]
        },
        capabilities: expect.arrayContaining(["documents.approve", "periodLocks.lock"])
      }
    });
  });

  it("returns 403 when development email is not mapped to an enabled person", async () => {
    const response = await route(new Request("https://ledger.test/api/me"), env(null));
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "当前登录邮箱未绑定启用人员，请联系管理员" });
  });
});
