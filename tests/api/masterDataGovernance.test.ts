import { describe, expect, it } from "vitest";
import {
  createMasterDataMerchant,
  createMasterDataPerson,
  listMasterDataAccounts,
  listMasterDataMerchants,
  masterDataReferenceSummary,
  updateMasterDataAccount,
  updateMasterDataCurrency,
  updateMasterDataMerchant,
  updateMasterDataProject,
  listMasterDataSnapshot
} from "../../src/api/masterDataGovernance";
import { route } from "../../src/worker/router";
import type { Env } from "../../src/worker/env";

type MockStatement = D1PreparedStatement & { bindings: unknown[]; sql: string };

function mockEnv(options: { queues?: unknown[][]; onBind?: (values: unknown[]) => void } = {}): Env {
  const queues = [...(options.queues ?? [])];
  return {
    DB: {
      prepare: () =>
        ({
          bindings: [],
          bind(...values: unknown[]) {
            options.onBind?.(values);
            return this;
          },
          all: async () => ({ success: true, results: queues.shift() ?? [] }),
          first: async () => null,
          run: async () => ({ success: true }) as D1Result
        }) as unknown as D1PreparedStatement
    } as unknown as D1Database,
    ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher
  };
}

function writeMockEnv(
  options: {
    enabledPeople?: string[];
    enabledCurrencies?: string[];
    enabledCategories?: string[];
    projectStatuses?: Record<string, string>;
    firstRows?: unknown[];
    onBind?: (values: unknown[]) => void;
    onRunBindings?: (values: unknown[]) => void;
  } = {}
): Env {
  const firstRows = [...(options.firstRows ?? [])];
  return {
    DB: {
      prepare: (sql: string) =>
        ({
          sql,
          bindings: [],
          bind(this: MockStatement, ...values: unknown[]) {
            this.bindings = values;
            options.onBind?.(values);
            return this;
          },
          all: async () => ({ success: true, results: [] }),
          first(this: MockStatement) {
            const normalizedSql = this.sql.replace(/\s+/g, " ").toLowerCase();
            const boundId = this.bindings[0];
            if (
              normalizedSql.includes("from people") &&
              typeof boundId === "string" &&
              options.enabledPeople?.includes(boundId)
            ) {
              return Promise.resolve({ id: boundId });
            }
            if (
              normalizedSql.includes("from currencies") &&
              typeof boundId === "string" &&
              options.enabledCurrencies?.includes(boundId)
            ) {
              return Promise.resolve({ code: boundId });
            }
            if (
              normalizedSql.includes("from categories") &&
              typeof boundId === "string" &&
              options.enabledCategories?.includes(boundId)
            ) {
              return Promise.resolve({ id: boundId });
            }
            if (normalizedSql.includes("select status from projects") && typeof boundId === "string") {
              const status = options.projectStatuses?.[boundId];
              if (status) return Promise.resolve({ status });
            }
            return Promise.resolve(firstRows.shift() ?? null);
          },
          run(this: MockStatement) {
            options.onRunBindings?.(this.bindings);
            return Promise.resolve({ success: true } as D1Result);
          }
        }) as unknown as MockStatement
    } as unknown as D1Database,
    ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher
  };
}

describe("master data governance API", () => {
  it("returns a full master data snapshot", async () => {
    const response = await listMasterDataSnapshot({
      request: new Request("https://ledger.test/api/master-data"),
      env: mockEnv({ queues: [[{ id: "person_1", referenceCount: 0 }], [], [], [], [], []] }),
      params: {}
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        people: [{ id: "person_1", referenceCount: 0 }],
        projects: [],
        merchants: [],
        accounts: [],
        currencies: [],
        categories: []
      }
    });
  });

  it("routes the full master data endpoint", async () => {
    const response = await route(
      new Request("https://ledger.test/api/master-data"),
      mockEnv({ queues: [[], [], [], [], [], []] })
    );

    expect(response.status).toBe(200);
  });

  it("routes reference summary endpoint", async () => {
    const response = await route(
      new Request("https://ledger.test/api/master-data/reference-summary"),
      mockEnv({ queues: [[{ id: "person_1", referenceCount: 2 }], [], [], [], [{ code: "AED", referenceCount: 1 }], []] })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        people: [{ id: "person_1", referenceCount: 2 }],
        projects: [],
        merchants: [],
        accounts: [],
        currencies: [{ id: "AED", referenceCount: 1 }],
        categories: []
      }
    });
  });

  it("passes resource list filters to repository queries", async () => {
    const bindings: unknown[][] = [];
    await listMasterDataMerchants({
      request: new Request("https://ledger.test/api/master-data/merchants?projectId=proj_1"),
      env: mockEnv({ queues: [[]], onBind: (values) => bindings.push(values) }),
      params: {}
    });
    await listMasterDataAccounts({
      request: new Request("https://ledger.test/api/master-data/accounts?currencyCode=aed&accountType=petty_cash&ownerPersonId=person_1"),
      env: mockEnv({ queues: [[]], onBind: (values) => bindings.push(values) }),
      params: {}
    });

    expect(bindings).toContainEqual(["proj_1", "proj_1"]);
    expect(bindings).toContainEqual(["AED", "AED", "petty_cash", "petty_cash", "person_1", "person_1"]);
  });
});

describe("master data governance write API", () => {
  it("creates people with actor audit", async () => {
    const response = await createMasterDataPerson({
      request: new Request("https://ledger.test/api/master-data/people", {
        method: "POST",
        body: JSON.stringify({
          actor: "person_admin",
          name: "Alice",
          alias: "ali",
          roles: ["finance_entry"],
          isEnabled: true
        })
      }),
      env: writeMockEnv({ enabledPeople: ["person_admin"] }),
      params: {}
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as { data: { id: string; name: string; roles_json: string } };
    expect(body.data.id).toMatch(/^person_/);
    expect(body.data.name).toBe("Alice");
    expect(body.data.roles_json).toBe("[\"finance_entry\"]");
  });

  it("rejects merchant creation for archived projects", async () => {
    const response = await createMasterDataMerchant({
      request: new Request("https://ledger.test/api/master-data/merchants", {
        method: "POST",
        body: JSON.stringify({
          actor: "person_admin",
          code: "M1",
          name: "Merchant One",
          projectId: "proj_archived",
          status: "active"
        })
      }),
      env: writeMockEnv({ enabledPeople: ["person_admin"], projectStatuses: { proj_archived: "archived" } }),
      params: {}
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "projectId must reference an active project" });
  });

  it("rejects disabling USDT", async () => {
    const response = await updateMasterDataCurrency({
      request: new Request("https://ledger.test/api/master-data/currencies/USDT", {
        method: "PATCH",
        body: JSON.stringify({ actor: "person_admin", name: "USDT", minorUnits: 2, isEnabled: false })
      }),
      env: writeMockEnv({ enabledPeople: ["person_admin"] }),
      params: { code: "USDT" }
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "USDT cannot be disabled" });
  });

  it("archives projects through PATCH", async () => {
    const runBindings: unknown[][] = [];
    const response = await updateMasterDataProject({
      request: new Request("https://ledger.test/api/master-data/projects/proj_1", {
        method: "PATCH",
        body: JSON.stringify({
          actor: "person_admin",
          code: "P1",
          name: "Project One",
          ownerPersonId: null,
          status: "archived",
          note: null
        })
      }),
      env: writeMockEnv({
        enabledPeople: ["person_admin"],
        firstRows: [
          {
            id: "proj_1",
            code: "P1",
            name: "Project One",
            owner_person_id: null,
            status: "active",
            note: null,
            created_at: "2026-04-25T00:00:00.000Z",
            referenceCount: 0
          }
        ],
        onRunBindings: (values) => runBindings.push(values)
      }),
      params: { id: "proj_1" }
    });

    expect(response.status).toBe(200);
    expect(runBindings.flat()).toContain("master_data.project.status");
  });

  it("rejects PATCH for missing projects", async () => {
    const response = await updateMasterDataProject({
      request: new Request("https://ledger.test/api/master-data/projects/proj_missing", {
        method: "PATCH",
        body: JSON.stringify({
          actor: "person_admin",
          code: "P1",
          name: "Missing Project",
          status: "active"
        })
      }),
      env: writeMockEnv({ enabledPeople: ["person_admin"] }),
      params: { id: "proj_missing" }
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "project not found" });
  });

  it("allows merchant updates when unchanged project is archived", async () => {
    const response = await updateMasterDataMerchant({
      request: new Request("https://ledger.test/api/master-data/merchants/merc_1", {
        method: "PATCH",
        body: JSON.stringify({
          actor: "person_admin",
          code: "M1",
          name: "Merchant Renamed",
          projectId: "proj_archived",
          status: "active"
        })
      }),
      env: writeMockEnv({
        enabledPeople: ["person_admin"],
        projectStatuses: { proj_archived: "archived" },
        firstRows: [
          {
            id: "merc_1",
            code: "M1",
            name: "Merchant One",
            project_id: "proj_archived",
            merchant_type: "site",
            launch_date: null,
            status: "active",
            owner_person_id: null,
            note: null,
            created_at: "2026-04-25T00:00:00.000Z",
            referenceCount: 1
          },
          {
            id: "merc_1",
            code: "M1",
            name: "Merchant One",
            project_id: "proj_archived",
            merchant_type: "site",
            launch_date: null,
            status: "active",
            owner_person_id: null,
            note: null,
            created_at: "2026-04-25T00:00:00.000Z",
            referenceCount: 1
          }
        ]
      }),
      params: { id: "merc_1" }
    });

    expect(response.status).toBe(200);
  });

  it("rejects protected account changes through PATCH", async () => {
    const response = await updateMasterDataAccount({
      request: new Request("https://ledger.test/api/master-data/accounts/acct_1", {
        method: "PATCH",
        body: JSON.stringify({
          actor: "person_admin",
          name: "AED Reserve",
          accountType: "currency_reserve",
          currencyCode: "USD",
          ownerPersonId: null,
          isCompanyAccount: true,
          allowNegative: false,
          status: "active"
        })
      }),
      env: writeMockEnv({
        enabledPeople: ["person_admin"],
        enabledCurrencies: ["USD"],
        firstRows: [
          {
            referenceCount: 1,
            currency_code: "AED",
            account_type: "currency_reserve",
            is_company_account: 1,
            owner_person_id: null
          },
          {
            referenceCount: 1,
            currency_code: "AED",
            account_type: "currency_reserve",
            is_company_account: 1,
            owner_person_id: null
          }
        ]
      }),
      params: { id: "acct_1" }
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "account currency cannot be changed after use" });
  });

  it("rejects protected merchant project changes through PATCH", async () => {
    const response = await updateMasterDataMerchant({
      request: new Request("https://ledger.test/api/master-data/merchants/merc_1", {
        method: "PATCH",
        body: JSON.stringify({
          actor: "person_admin",
          code: "M1",
          name: "Merchant One",
          projectId: "proj_2",
          status: "active"
        })
      }),
      env: writeMockEnv({
        enabledPeople: ["person_admin"],
        projectStatuses: { proj_2: "active" },
        firstRows: [
          {
            id: "merc_1",
            code: "M1",
            name: "Merchant One",
            project_id: "proj_1",
            merchant_type: "site",
            launch_date: null,
            status: "active",
            owner_person_id: null,
            note: null,
            created_at: "2026-04-25T00:00:00.000Z",
            referenceCount: 1
          },
          {
            id: "merc_1",
            code: "M1",
            name: "Merchant One",
            project_id: "proj_1",
            merchant_type: "site",
            launch_date: null,
            status: "active",
            owner_person_id: null,
            note: null,
            created_at: "2026-04-25T00:00:00.000Z",
            referenceCount: 1
          }
        ]
      }),
      params: { id: "merc_1" }
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "merchant project cannot be changed after use" });
  });

  it("rejects protected currency minor unit changes through PATCH", async () => {
    const response = await updateMasterDataCurrency({
      request: new Request("https://ledger.test/api/master-data/currencies/AED", {
        method: "PATCH",
        body: JSON.stringify({ actor: "person_admin", name: "Dirham", minorUnits: 3, isEnabled: true })
      }),
      env: writeMockEnv({
        enabledPeople: ["person_admin"],
        firstRows: [{ code: "AED", name: "Dirham", minor_units: 2, is_enabled: 1, referenceCount: 1 }]
      }),
      params: { code: "AED" }
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "currency minor units cannot be changed after use" });
  });

  it("routes master data account creation", async () => {
    const response = await route(
      new Request("https://ledger.test/api/master-data/accounts", {
        method: "POST",
        body: JSON.stringify({
          actor: "person_admin",
          name: "AED Reserve",
          accountType: "currency_reserve",
          currencyCode: "AED",
          isCompanyAccount: true,
          allowNegative: false,
          status: "active"
        })
      }),
      writeMockEnv({ enabledPeople: ["person_admin"], enabledCurrencies: ["AED"] })
    );

    expect(response.status).toBe(201);
  });
});
