import { describe, expect, it } from "vitest";
import { ActorRepository } from "../../src/auth/actorRepository";

function mockDb(options: { firstRow?: unknown | null; onSql?: (sql: string) => void; onBind?: (args: unknown[]) => void }): D1Database {
  return {
    prepare: (sql: string) => {
      options.onSql?.(sql);
      return {
        bind(...args: unknown[]) {
          options.onBind?.(args);
          return this;
        },
        first: async () => options.firstRow ?? null,
        all: async () => ({ success: true, results: [] }),
        run: async () => ({ success: true }) as D1Result
      } as unknown as D1PreparedStatement;
    }
  } as unknown as D1Database;
}

describe("ActorRepository", () => {
  it("loads enabled actor by login email", async () => {
    const bindCalls: unknown[][] = [];
    const repo = new ActorRepository(
      mockDb({
        firstRow: {
          id: "person_1",
          name: "Alice",
          alias: null,
          login_email: "alice@example.com",
          roles_json: "[\"finance_manager\"]",
          is_enabled: 1
        },
        onBind: (args) => bindCalls.push(args)
      })
    );

    await expect(repo.requireActorByEmail(" ALICE@example.com ")).resolves.toEqual({
      personId: "person_1",
      name: "Alice",
      alias: null,
      email: "alice@example.com",
      roles: ["finance_manager"]
    });
    expect(bindCalls[0]).toEqual(["alice@example.com"]);
  });

  it("rejects unmapped or disabled emails", async () => {
    const repo = new ActorRepository(mockDb({ firstRow: null }));
    await expect(repo.requireActorByEmail("missing@example.com")).rejects.toMatchObject({
      status: 403,
      message: "当前登录邮箱未绑定启用人员，请联系管理员"
    });
  });
});
