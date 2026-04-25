import { describe, expect, it } from "vitest";
import { MasterDataGovernanceRepository } from "../../src/repositories/masterDataGovernanceRepository";

type MockStatement = D1PreparedStatement & { sql: string; bindings: unknown[] };

function mockDb(
  options: {
    rows?: unknown[];
    firstRows?: unknown[];
    firstRow?: unknown | null;
    runResult?: D1Result;
    onSql?: (sql: string) => void;
    onBind?: (values: unknown[]) => void;
  } = {}
): D1Database {
  const firstRows = [...(options.firstRows ?? [])];
  return {
    prepare: (sql: string) => {
      options.onSql?.(sql);
      return {
        sql,
        bindings: [],
        bind(this: MockStatement, ...values: unknown[]) {
          this.bindings = values;
          options.onBind?.(values);
          return this;
        },
        all: async () => ({ success: true, results: options.rows ?? [] }),
        first: async () => (options.firstRows ? firstRows.shift() ?? null : options.firstRow ?? null),
        run: async () => options.runResult ?? ({ success: true } as D1Result)
      } as unknown as MockStatement;
    }
  } as unknown as D1Database;
}

function normalizeSql(sql: string) {
  return sql.replace(/\s+/g, " ").trim().toLowerCase();
}

describe("MasterDataGovernanceRepository read model", () => {
  it("lists people with reference counts", async () => {
    let capturedSql = "";
    const row = {
      id: "person_1",
      name: "Alice",
      alias: "ali",
      roles_json: "[\"finance_entry\"]",
      is_enabled: 1,
      created_at: "2026-04-25T00:00:00.000Z",
      referenceCount: 2
    };
    const repo = new MasterDataGovernanceRepository(
      mockDb({ rows: [row], onSql: (sql) => (capturedSql = sql) })
    );

    await expect(repo.listPeople()).resolves.toEqual([row]);
    const sql = normalizeSql(capturedSql);
    expect(sql).toContain("from people p");
    expect(sql).toContain("referencecount");
  });

  it("selects people login identity fields for governance rows", async () => {
    let capturedSql = "";
    const row = {
      id: "person_1",
      name: "Alice",
      alias: "ali",
      roles_json: "[\"admin\"]",
      is_enabled: 1,
      login_email: "alice@example.com",
      access_subject: "sub_1",
      last_login_at: "2026-04-25T00:00:00.000Z",
      created_at: "2026-04-25T00:00:00.000Z",
      referenceCount: 0
    };
    const repo = new MasterDataGovernanceRepository(
      mockDb({ rows: [row], onSql: (sql) => (capturedSql = sql) })
    );

    await expect(repo.listPeople()).resolves.toEqual([row]);
    const sql = normalizeSql(capturedSql);
    expect(sql).toContain("login_email");
    expect(sql).toContain("access_subject");
    expect(sql).toContain("last_login_at");
  });

  it("creates people with normalized login email", async () => {
    const runBindings: unknown[][] = [];
    const repo = new MasterDataGovernanceRepository(
      mockDb({ onBind: (values) => runBindings.push(values) })
    );

    const person = await repo.createPerson({
      name: "Alice",
      alias: "ali",
      roles: ["admin"],
      isEnabled: true,
      loginEmail: "alice@example.com"
    });

    expect(person.login_email).toBe("alice@example.com");
    expect(runBindings.at(-1)).toContain("alice@example.com");
  });

  it("updates people login email", async () => {
    const runBindings: unknown[][] = [];
    const existing = {
      id: "person_1",
      name: "Alice",
      alias: "ali",
      roles_json: "[\"admin\"]",
      is_enabled: 1,
      login_email: "old@example.com",
      access_subject: null,
      last_login_at: null,
      created_at: "2026-04-25T00:00:00.000Z",
      referenceCount: 0
    };
    const repo = new MasterDataGovernanceRepository(
      mockDb({ firstRows: [existing], onBind: (values) => runBindings.push(values) })
    );

    const person = await repo.updatePerson("person_1", {
      name: "Alice",
      alias: "ali",
      roles: ["admin"],
      isEnabled: true,
      loginEmail: "new@example.com"
    });

    expect(person.login_email).toBe("new@example.com");
    expect(runBindings.at(-1)).toEqual(["Alice", "ali", "[\"admin\"]", 1, "new@example.com", "person_1"]);
  });

  it("counts other enabled login admins", async () => {
    let capturedSql = "";
    const repo = new MasterDataGovernanceRepository(
      mockDb({
        firstRow: { count: 2 },
        onSql: (sql) => (capturedSql = sql)
      })
    );

    await expect(repo.countOtherEnabledLoginAdmins("person_1")).resolves.toBe(2);
    const sql = normalizeSql(capturedSql);
    expect(sql).toContain("from people");
    expect(sql).toContain("login_email is not null");
    expect(sql).toContain("json_each");
    expect(sql).toContain("id != ?");
  });

  it("avoids compound selects for high fan-out reference counts", async () => {
    const capturedSql: string[] = [];
    const repo = new MasterDataGovernanceRepository(
      mockDb({
        rows: [],
        firstRow: null,
        onSql: (sql) => capturedSql.push(sql)
      })
    );

    await repo.listPeople();
    await repo.listAccounts();
    await repo.listCurrencies();
    await repo.getPerson("person_1");
    await repo.getAccount("account_1");
    await repo.getCurrency("AED");

    for (const sql of capturedSql.map(normalizeSql)) {
      expect(sql).not.toContain(" union all ");
      expect(sql).toContain("referencecount");
    }
  });

  it("lists projects with reference counts", async () => {
    const row = {
      id: "proj_1",
      code: "P1",
      name: "Project One",
      owner_person_id: null,
      status: "active",
      note: null,
      created_at: "2026-04-25T00:00:00.000Z",
      referenceCount: 1
    };
    const repo = new MasterDataGovernanceRepository(mockDb({ rows: [row] }));

    await expect(repo.listProjects()).resolves.toEqual([row]);
  });

  it("checks enabled people for write actors", async () => {
    const repo = new MasterDataGovernanceRepository(mockDb({ firstRow: { id: "person_admin" } }));

    await expect(repo.requireEnabledPerson("person_admin", "actor")).resolves.toBe("person_admin");
  });

  it("rejects missing enabled people for write actors", async () => {
    const repo = new MasterDataGovernanceRepository(mockDb({ firstRow: null }));

    await expect(repo.requireEnabledPerson("missing", "actor")).rejects.toThrow(
      "actor must reference an enabled person"
    );
  });
});

describe("MasterDataGovernanceRepository protected writes", () => {
  it("rejects changing referenced account currency", async () => {
    const repo = new MasterDataGovernanceRepository(
      mockDb({
        firstRow: {
          id: "acct_1",
          name: "AED Reserve",
          account_type: "currency_reserve",
          currency_code: "AED",
          owner_person_id: null,
          is_company_account: 1,
          allow_negative: 0,
          status: "active",
          created_at: "2026-04-25T00:00:00.000Z",
          referenceCount: 1
        }
      })
    );

    await expect(
      repo.assertAccountProtectedFieldsUnchanged("acct_1", {
        accountType: "currency_reserve",
        currencyCode: "USD",
        isCompanyAccount: true,
        ownerPersonId: null
      })
    ).rejects.toThrow("account currency cannot be changed after use");
  });

  it("rejects changing referenced category direction", async () => {
    const repo = new MasterDataGovernanceRepository(
      mockDb({
        firstRow: {
          id: "cat_1",
          name: "Expense",
          parent_id: null,
          category_type: "expense",
          direction: "out",
          affects_expense_report: 1,
          affects_project_report: 0,
          requires_merchant: 0,
          requires_person: 1,
          requires_borrower: 0,
          is_enabled: 1,
          referenceCount: 1
        }
      })
    );

    await expect(
      repo.assertCategoryProtectedFieldsUnchanged("cat_1", {
        categoryType: "expense",
        direction: "neutral",
        affectsExpenseReport: true,
        affectsProjectReport: false
      })
    ).rejects.toThrow("category direction cannot be changed after use");
  });

  it("rejects changing referenced merchant project", async () => {
    const repo = new MasterDataGovernanceRepository(
      mockDb({
        firstRow: {
          id: "merc_1",
          code: "M1",
          name: "Merchant",
          project_id: "proj_1",
          merchant_type: "site",
          launch_date: null,
          status: "active",
          owner_person_id: null,
          note: null,
          created_at: "2026-04-25T00:00:00.000Z",
          referenceCount: 1
        }
      })
    );

    await expect(repo.assertMerchantProtectedFieldsUnchanged("merc_1", { projectId: "proj_2" })).rejects.toThrow(
      "merchant project cannot be changed after use"
    );
  });

  it("rejects changing referenced currency minor units", async () => {
    const repo = new MasterDataGovernanceRepository(
      mockDb({
        firstRow: {
          code: "AED",
          name: "Dirham",
          minor_units: 2,
          is_enabled: 1,
          referenceCount: 1
        }
      })
    );

    await expect(repo.assertCurrencyProtectedFieldsUnchanged("AED", { minorUnits: 3 })).rejects.toThrow(
      "currency minor units cannot be changed after use"
    );
  });

  it("rejects category parent cycles", async () => {
    const repo = new MasterDataGovernanceRepository(mockDb({ firstRow: { id: "cat_1" } }));

    await expect(repo.assertCategoryParentDoesNotCreateCycle("cat_1", "cat_child")).rejects.toThrow(
      "parentId cannot create category cycle"
    );
  });
});
