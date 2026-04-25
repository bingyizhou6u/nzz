# Master Data Governance Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a formal master data governance center for people, projects, merchants, accounts, currencies, and management categories, with reference protection, audit logging, and document-entry option consistency.

**Architecture:** Add a focused governance layer beside the existing master data option layer. Backend work creates typed repository methods plus `/api/master-data` and resource-specific handlers; frontend work replaces the MVP `MasterDataPage` with tabbed maintenance views backed by small model helpers and shared table/form components. Existing `/api/document-entry/options` remains the source for document-entry selects and must keep filtering to active/enabled rows.

**Tech Stack:** Cloudflare Workers, D1, TypeScript, React, Vite, Vitest, native HTML form controls.

---

## Source Documents

- Design spec: `docs/superpowers/specs/2026-04-25-master-data-governance-center-design.md`
- Existing page: `src/app/pages/MasterDataPage.tsx`
- Existing API: `src/api/masterData.ts`
- Existing repository: `src/repositories/masterDataRepository.ts`
- Existing router: `src/worker/router.ts`
- Existing audit helper: `src/repositories/auditLogRepository.ts`

## File Structure

Create:

- `src/api/masterDataGovernance.ts` - governance read/write handlers for `/api/master-data` and resource-specific routes.
- `src/repositories/masterDataGovernanceRepository.ts` - D1 reads/writes, reference counts, protected-field checks.
- `src/app/pages/master-data/masterDataTypes.ts` - frontend row and form types.
- `src/app/pages/master-data/masterDataModel.ts` - constants, payload builders, validation helpers, reference-protection helpers.
- `src/app/pages/master-data/MasterDataTable.tsx` - shared compact table and action surface.
- `src/app/pages/master-data/MasterDataForm.tsx` - shared label/error/action layout helpers for forms.
- `src/app/pages/master-data/PeopleTab.tsx`
- `src/app/pages/master-data/ProjectsTab.tsx`
- `src/app/pages/master-data/MerchantsTab.tsx`
- `src/app/pages/master-data/AccountsTab.tsx`
- `src/app/pages/master-data/CurrenciesTab.tsx`
- `src/app/pages/master-data/CategoriesTab.tsx`
- `src/app/pages/master-data/MasterDataOverview.tsx`
- `src/app/pages/master-data/masterDataModel.test.ts`
- `tests/api/masterDataGovernanceRepository.test.ts`
- `tests/api/masterDataGovernance.test.ts`

Modify:

- `src/app/pages/MasterDataPage.tsx` - replace MVP content with governance center container.
- `src/app/styles.css` - add compact tab/table/form styles.
- `src/worker/router.ts` - add governance routes.
- `tests/api/masterData.test.ts` - keep old `/api/currencies` and `/api/projects` route tests passing, or update route coverage if old endpoints are retired later.

Do not modify in this phase:

- `src/services/documentService.ts`
- `src/domain/posting.ts`
- report SQL
- FIFO or loan domain modules

---

## Shared Domain Decisions

Use these constants in backend and frontend tests. Backend may define them in `src/repositories/masterDataGovernanceRepository.ts`; frontend should duplicate display constants in `masterDataModel.ts` to avoid importing server code into client bundles.

```ts
export const PERSON_ROLES = [
  "admin",
  "finance_manager",
  "finance_entry",
  "logistics",
  "readonly",
  "borrower"
] as const;

export const PROJECT_STATUSES = ["active", "archived"] as const;
export const MERCHANT_STATUSES = ["active", "archived"] as const;
export const ACCOUNT_STATUSES = ["active", "archived"] as const;

export const ACCOUNT_TYPES = [
  "usdt_wallet",
  "usd_account",
  "currency_reserve",
  "public_account",
  "petty_cash",
  "temporary"
] as const;

export const CATEGORY_TYPES = ["income", "expense", "exchange", "loan", "loss", "adjustment"] as const;
export const CATEGORY_DIRECTIONS = ["in", "out", "neutral"] as const;
```

All write APIs must receive an `actor` string. The actor must reference an enabled person. Initial admin/person seed remains outside this feature; this phase assumes at least one enabled person exists.

---

### Task 1: Frontend Master Data Model

**Files:**
- Create: `src/app/pages/master-data/masterDataTypes.ts`
- Create: `src/app/pages/master-data/masterDataModel.ts`
- Create: `src/app/pages/master-data/masterDataModel.test.ts`

- [ ] **Step 1: Write the failing model tests**

Add `src/app/pages/master-data/masterDataModel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  accountTypeLabels,
  buildAccountPayload,
  buildPersonPayload,
  categoryTypeLabels,
  isProtectedFieldDisabled,
  normalizeCode,
  parseRoles
} from "./masterDataModel";

describe("master data model", () => {
  it("normalizes business codes to uppercase", () => {
    expect(normalizeCode(" p-demo-001 ")).toBe("P-DEMO-001");
    expect(normalizeCode(" aed ")).toBe("AED");
  });

  it("parses roles_json defensively", () => {
    expect(parseRoles("[\"finance_entry\",\"logistics\"]")).toEqual(["finance_entry", "logistics"]);
    expect(parseRoles("not json")).toEqual([]);
    expect(parseRoles("[1,\"admin\"]")).toEqual(["admin"]);
  });

  it("builds people payloads with trimmed fields and actor", () => {
    expect(
      buildPersonPayload(
        { name: " Alice ", alias: " ali ", roles: ["finance_entry"], isEnabled: true },
        "person_admin"
      )
    ).toEqual({
      actor: "person_admin",
      name: "Alice",
      alias: "ali",
      roles: ["finance_entry"],
      isEnabled: true
    });
  });

  it("builds petty cash account payloads with person ownership and negative balance enabled", () => {
    expect(
      buildAccountPayload(
        {
          name: " Bob AED Petty ",
          accountType: "petty_cash",
          currencyCode: "aed",
          ownerPersonId: "person_bob",
          isCompanyAccount: false,
          allowNegative: true,
          status: "active"
        },
        "person_admin"
      )
    ).toEqual({
      actor: "person_admin",
      name: "Bob AED Petty",
      accountType: "petty_cash",
      currencyCode: "AED",
      ownerPersonId: "person_bob",
      isCompanyAccount: false,
      allowNegative: true,
      status: "active"
    });
  });

  it("marks protected fields disabled when rows are referenced", () => {
    expect(isProtectedFieldDisabled({ referenceCount: 2 }, "currencyCode")).toBe(true);
    expect(isProtectedFieldDisabled({ referenceCount: 0 }, "currencyCode")).toBe(false);
    expect(isProtectedFieldDisabled({ referenceCount: 2 }, "name")).toBe(false);
  });

  it("provides labels for current account and category types", () => {
    expect(accountTypeLabels.petty_cash).toBe("人员备用金账户");
    expect(categoryTypeLabels.loss).toBe("损失");
  });
});
```

- [ ] **Step 2: Run the model test to verify RED**

Run:

```bash
npm test -- src/app/pages/master-data/masterDataModel.test.ts
```

Expected: fail because `masterDataModel.ts` does not exist.

- [ ] **Step 3: Create frontend master data types**

Create `src/app/pages/master-data/masterDataTypes.ts`:

```ts
export type PersonRole = "admin" | "finance_manager" | "finance_entry" | "logistics" | "readonly" | "borrower";
export type ActiveStatus = "active" | "archived";
export type AccountType =
  | "usdt_wallet"
  | "usd_account"
  | "currency_reserve"
  | "public_account"
  | "petty_cash"
  | "temporary";
export type CategoryType = "income" | "expense" | "exchange" | "loan" | "loss" | "adjustment";
export type CategoryDirection = "in" | "out" | "neutral";

export interface ReferencedRow {
  referenceCount: number;
}

export interface PersonRow extends ReferencedRow {
  id: string;
  name: string;
  alias: string | null;
  roles_json: string;
  is_enabled: number;
  created_at: string;
}

export interface ProjectRow extends ReferencedRow {
  id: string;
  code: string;
  name: string;
  owner_person_id: string | null;
  status: ActiveStatus;
  note: string | null;
  created_at: string;
}

export interface MerchantRow extends ReferencedRow {
  id: string;
  code: string;
  name: string;
  project_id: string;
  merchant_type: string | null;
  launch_date: string | null;
  status: ActiveStatus;
  owner_person_id: string | null;
  note: string | null;
  created_at: string;
}

export interface AccountRow extends ReferencedRow {
  id: string;
  name: string;
  account_type: AccountType;
  currency_code: string;
  owner_person_id: string | null;
  is_company_account: number;
  allow_negative: number;
  status: ActiveStatus;
  created_at: string;
}

export interface CurrencyRow extends ReferencedRow {
  code: string;
  name: string;
  minor_units: number;
  is_enabled: number;
}

export interface CategoryRow extends ReferencedRow {
  id: string;
  name: string;
  parent_id: string | null;
  category_type: CategoryType;
  direction: CategoryDirection;
  affects_expense_report: number;
  affects_project_report: number;
  requires_merchant: number;
  requires_person: number;
  requires_borrower: number;
  is_enabled: number;
}

export interface MasterDataSnapshot {
  people: PersonRow[];
  projects: ProjectRow[];
  merchants: MerchantRow[];
  accounts: AccountRow[];
  currencies: CurrencyRow[];
  categories: CategoryRow[];
}
```

- [ ] **Step 4: Create frontend model helpers**

Create `src/app/pages/master-data/masterDataModel.ts`:

```ts
import type { AccountType, CategoryType, PersonRole, ReferencedRow } from "./masterDataTypes";

export const personRoles: PersonRole[] = [
  "admin",
  "finance_manager",
  "finance_entry",
  "logistics",
  "readonly",
  "borrower"
];

export const personRoleLabels: Record<PersonRole, string> = {
  admin: "管理员",
  finance_manager: "财务主管",
  finance_entry: "财务录入",
  logistics: "后勤人员",
  readonly: "只读",
  borrower: "借款人"
};

export const accountTypeLabels: Record<AccountType, string> = {
  usdt_wallet: "USDT 钱包",
  usd_account: "美元账户",
  currency_reserve: "储备金账户",
  public_account: "公开收支账户",
  petty_cash: "人员备用金账户",
  temporary: "临时账户"
};

export const categoryTypeLabels: Record<CategoryType, string> = {
  income: "收入",
  expense: "费用",
  exchange: "换汇",
  loan: "借款",
  loss: "损失",
  adjustment: "调整"
};

export function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

export function parseRoles(rolesJson: string): PersonRole[] {
  try {
    const parsed = JSON.parse(rolesJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((role): role is PersonRole => personRoles.includes(role as PersonRole));
  } catch {
    return [];
  }
}

export function isProtectedFieldDisabled(row: ReferencedRow | null | undefined, field: string) {
  if (!row || row.referenceCount <= 0) return false;
  return [
    "projectId",
    "accountType",
    "currencyCode",
    "isCompanyAccount",
    "ownerPersonId",
    "categoryType",
    "direction",
    "affectsExpenseReport",
    "affectsProjectReport",
    "requiresMerchant",
    "requiresPerson",
    "requiresBorrower",
    "minorUnits"
  ].includes(field);
}

export function buildPersonPayload(
  form: { name: string; alias: string; roles: PersonRole[]; isEnabled: boolean },
  actor: string
): Record<string, unknown> {
  return {
    actor: actor.trim(),
    name: form.name.trim(),
    alias: form.alias.trim() || null,
    roles: form.roles,
    isEnabled: form.isEnabled
  };
}

export function buildAccountPayload(
  form: {
    name: string;
    accountType: AccountType;
    currencyCode: string;
    ownerPersonId: string;
    isCompanyAccount: boolean;
    allowNegative: boolean;
    status: "active" | "archived";
  },
  actor: string
): Record<string, unknown> {
  return {
    actor: actor.trim(),
    name: form.name.trim(),
    accountType: form.accountType,
    currencyCode: normalizeCode(form.currencyCode),
    ownerPersonId: form.ownerPersonId.trim() || null,
    isCompanyAccount: form.isCompanyAccount,
    allowNegative: form.allowNegative,
    status: form.status
  };
}
```

- [ ] **Step 5: Run the model test to verify GREEN**

Run:

```bash
npm test -- src/app/pages/master-data/masterDataModel.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit Task 1**

Run:

```bash
git add src/app/pages/master-data/masterDataTypes.ts src/app/pages/master-data/masterDataModel.ts src/app/pages/master-data/masterDataModel.test.ts
git commit -m "feat: add master data frontend model"
```

---

### Task 2: Governance Repository Read Model

**Files:**
- Create: `src/repositories/masterDataGovernanceRepository.ts`
- Test: `tests/api/masterDataGovernanceRepository.test.ts`

- [ ] **Step 1: Write failing repository read tests**

Create `tests/api/masterDataGovernanceRepository.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { MasterDataGovernanceRepository } from "../../src/repositories/masterDataGovernanceRepository";

type MockStatement = D1PreparedStatement & { sql: string; bindings: unknown[] };

function mockDb(options: { rows?: unknown[]; firstRow?: unknown; onSql?: (sql: string) => void } = {}): D1Database {
  return {
    prepare: (sql: string) => {
      options.onSql?.(sql);
      return {
        sql,
        bindings: [],
        bind(this: MockStatement, ...values: unknown[]) {
          this.bindings = values;
          return this;
        },
        all: async () => ({ success: true, results: options.rows ?? [] }),
        first: async () => options.firstRow ?? null,
        run: async () => ({ success: true }) as D1Result
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
```

- [ ] **Step 2: Run the repository test to verify RED**

Run:

```bash
npm test -- tests/api/masterDataGovernanceRepository.test.ts
```

Expected: fail because repository file does not exist.

- [ ] **Step 3: Implement read repository types and methods**

Create `src/repositories/masterDataGovernanceRepository.ts`:

```ts
import { all, first, newId, nowIso, run } from "./db";

export type PersonRole = "admin" | "finance_manager" | "finance_entry" | "logistics" | "readonly" | "borrower";
export type ActiveStatus = "active" | "archived";
export type AccountType =
  | "usdt_wallet"
  | "usd_account"
  | "currency_reserve"
  | "public_account"
  | "petty_cash"
  | "temporary";
export type CategoryType = "income" | "expense" | "exchange" | "loan" | "loss" | "adjustment";
export type CategoryDirection = "in" | "out" | "neutral";

export const PERSON_ROLES: PersonRole[] = [
  "admin",
  "finance_manager",
  "finance_entry",
  "logistics",
  "readonly",
  "borrower"
];
export const ACTIVE_STATUSES: ActiveStatus[] = ["active", "archived"];
export const ACCOUNT_TYPES: AccountType[] = [
  "usdt_wallet",
  "usd_account",
  "currency_reserve",
  "public_account",
  "petty_cash",
  "temporary"
];
export const CATEGORY_TYPES: CategoryType[] = ["income", "expense", "exchange", "loan", "loss", "adjustment"];
export const CATEGORY_DIRECTIONS: CategoryDirection[] = ["in", "out", "neutral"];

export interface ReferencedRow {
  referenceCount: number;
}

export interface GovernancePersonRow extends ReferencedRow {
  id: string;
  name: string;
  alias: string | null;
  roles_json: string;
  is_enabled: number;
  created_at: string;
}

export interface GovernanceProjectRow extends ReferencedRow {
  id: string;
  code: string;
  name: string;
  owner_person_id: string | null;
  status: ActiveStatus;
  note: string | null;
  created_at: string;
}

export class MasterDataGovernanceRepository {
  constructor(private readonly db: D1Database) {}

  listPeople(): Promise<GovernancePersonRow[]> {
    return all<GovernancePersonRow>(
      this.db.prepare(`
        SELECT
          p.id, p.name, p.alias, p.roles_json, p.is_enabled, p.created_at,
          (
            SELECT COUNT(*) FROM (
              SELECT operator_person_id AS ref_id FROM documents WHERE operator_person_id = p.id
              UNION ALL SELECT person_id FROM document_lines WHERE person_id = p.id
              UNION ALL SELECT borrower_person_id FROM document_lines WHERE borrower_person_id = p.id
              UNION ALL SELECT owner_person_id FROM projects WHERE owner_person_id = p.id
              UNION ALL SELECT owner_person_id FROM merchants WHERE owner_person_id = p.id
              UNION ALL SELECT owner_person_id FROM accounts WHERE owner_person_id = p.id
              UNION ALL SELECT current_person_id FROM lots WHERE current_person_id = p.id
              UNION ALL SELECT from_person_id FROM lot_movements WHERE from_person_id = p.id
              UNION ALL SELECT to_person_id FROM lot_movements WHERE to_person_id = p.id
              UNION ALL SELECT person_id FROM pending_cost_matches WHERE person_id = p.id
              UNION ALL SELECT borrower_person_id FROM loan_entries WHERE borrower_person_id = p.id
            )
          ) AS referenceCount
        FROM people p
        ORDER BY p.is_enabled DESC, p.name, p.id
      `)
    );
  }

  listProjects(): Promise<GovernanceProjectRow[]> {
    return all<GovernanceProjectRow>(
      this.db.prepare(`
        SELECT
          p.id, p.code, p.name, p.owner_person_id, p.status, p.note, p.created_at,
          (
            SELECT COUNT(*) FROM (
              SELECT project_id AS ref_id FROM documents WHERE project_id = p.id
              UNION ALL SELECT project_id FROM merchants WHERE project_id = p.id
            )
          ) AS referenceCount
        FROM projects p
        ORDER BY p.status = 'active' DESC, p.code, p.name, p.id
      `)
    );
  }

  async requireEnabledPerson(id: string, label: string) {
    const normalizedId = id.trim();
    const person = await first<{ id: string }>(
      this.db.prepare("SELECT id FROM people WHERE id = ? AND is_enabled = 1").bind(normalizedId)
    );
    if (!person) throw new Error(`${label} must reference an enabled person`);
    return normalizedId;
  }

  protected newId(prefix: string) {
    return newId(prefix);
  }

  protected nowIso() {
    return nowIso();
  }

  protected run(stmt: D1PreparedStatement) {
    return run(stmt);
  }
}
```

- [ ] **Step 4: Run the repository test to verify GREEN**

Run:

```bash
npm test -- tests/api/masterDataGovernanceRepository.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 2**

Run:

```bash
git add src/repositories/masterDataGovernanceRepository.ts tests/api/masterDataGovernanceRepository.test.ts
git commit -m "feat: add master data governance read repository"
```

---

### Task 3: Governance Read API and Routes

**Files:**
- Create: `src/api/masterDataGovernance.ts`
- Modify: `src/worker/router.ts`
- Test: `tests/api/masterDataGovernance.test.ts`

- [ ] **Step 1: Write failing API read tests**

Create `tests/api/masterDataGovernance.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { listMasterDataSnapshot } from "../../src/api/masterDataGovernance";
import { route } from "../../src/worker/router";
import type { Env } from "../../src/worker/env";

function mockEnv(options: { queues?: unknown[][] } = {}): Env {
  const queues = [...(options.queues ?? [])];
  return {
    DB: {
      prepare: () =>
        ({
          bind() {
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
});
```

- [ ] **Step 2: Run API read tests to verify RED**

Run:

```bash
npm test -- tests/api/masterDataGovernance.test.ts
```

Expected: fail because `src/api/masterDataGovernance.ts` does not exist.

- [ ] **Step 3: Extend repository with the remaining list methods**

Add these methods to `MasterDataGovernanceRepository`:

```ts
listMerchants() {
  return all(this.db.prepare(`
    SELECT
      m.id, m.code, m.name, m.project_id, m.merchant_type, m.launch_date,
      m.status, m.owner_person_id, m.note, m.created_at,
      (SELECT COUNT(*) FROM documents d WHERE d.merchant_id = m.id) AS referenceCount
    FROM merchants m
    ORDER BY m.status = 'active' DESC, m.project_id, m.code, m.name, m.id
  `));
}

listAccounts() {
  return all(this.db.prepare(`
    SELECT
      a.id, a.name, a.account_type, a.currency_code, a.owner_person_id,
      a.is_company_account, a.allow_negative, a.status, a.created_at,
      (
        SELECT COUNT(*) FROM (
          SELECT account_id AS ref_id FROM document_lines WHERE account_id = a.id
          UNION ALL SELECT counterparty_account_id FROM document_lines WHERE counterparty_account_id = a.id
          UNION ALL SELECT account_id FROM account_entries WHERE account_id = a.id
          UNION ALL SELECT current_account_id FROM lots WHERE current_account_id = a.id
          UNION ALL SELECT from_account_id FROM lot_movements WHERE from_account_id = a.id
          UNION ALL SELECT to_account_id FROM lot_movements WHERE to_account_id = a.id
          UNION ALL SELECT account_id FROM pending_cost_matches WHERE account_id = a.id
        )
      ) AS referenceCount
    FROM accounts a
    ORDER BY a.status = 'active' DESC, a.is_company_account DESC, a.account_type, a.name, a.id
  `));
}

listCurrencies() {
  return all(this.db.prepare(`
    SELECT
      c.code, c.name, c.minor_units, c.is_enabled,
      (
        SELECT COUNT(*) FROM (
          SELECT currency_code AS ref_id FROM accounts WHERE currency_code = c.code
          UNION ALL SELECT currency_code FROM document_lines WHERE currency_code = c.code
          UNION ALL SELECT currency_code FROM account_entries WHERE currency_code = c.code
          UNION ALL SELECT currency_code FROM loan_entries WHERE currency_code = c.code
          UNION ALL SELECT currency_code FROM lots WHERE currency_code = c.code
          UNION ALL SELECT currency_code FROM pending_cost_matches WHERE currency_code = c.code
        )
      ) AS referenceCount
    FROM currencies c
    ORDER BY c.is_enabled DESC, c.code
  `));
}

listCategories() {
  return all(this.db.prepare(`
    SELECT
      c.id, c.name, c.parent_id, c.category_type, c.direction,
      c.affects_expense_report, c.affects_project_report,
      c.requires_merchant, c.requires_person, c.requires_borrower, c.is_enabled,
      (
        SELECT COUNT(*) FROM (
          SELECT category_id AS ref_id FROM documents WHERE category_id = c.id
          UNION ALL SELECT parent_id FROM categories WHERE parent_id = c.id
        )
      ) AS referenceCount
    FROM categories c
    ORDER BY c.is_enabled DESC, c.category_type, c.name, c.id
  `));
}
```

- [ ] **Step 4: Implement read API handlers**

Create `src/api/masterDataGovernance.ts`:

```ts
import { AuditLogRepository } from "../repositories/auditLogRepository";
import { MasterDataGovernanceRepository } from "../repositories/masterDataGovernanceRepository";
import type { Handler } from "../worker/env";

function repo(env: { DB: D1Database }) {
  return new MasterDataGovernanceRepository(env.DB);
}

export const listMasterDataSnapshot: Handler = async ({ env }) => {
  const repository = repo(env);
  const [people, projects, merchants, accounts, currencies, categories] = await Promise.all([
    repository.listPeople(),
    repository.listProjects(),
    repository.listMerchants(),
    repository.listAccounts(),
    repository.listCurrencies(),
    repository.listCategories()
  ]);

  return Response.json({ data: { people, projects, merchants, accounts, currencies, categories } });
};

export const listMasterDataPeople: Handler = async ({ env }) => Response.json({ data: await repo(env).listPeople() });
export const listMasterDataProjects: Handler = async ({ env }) =>
  Response.json({ data: await repo(env).listProjects() });
export const listMasterDataMerchants: Handler = async ({ env }) =>
  Response.json({ data: await repo(env).listMerchants() });
export const listMasterDataAccounts: Handler = async ({ env }) =>
  Response.json({ data: await repo(env).listAccounts() });
export const listMasterDataCurrencies: Handler = async ({ env }) =>
  Response.json({ data: await repo(env).listCurrencies() });
export const listMasterDataCategories: Handler = async ({ env }) =>
  Response.json({ data: await repo(env).listCategories() });

export function auditRepo(env: { DB: D1Database }) {
  return new AuditLogRepository(env.DB);
}
```

- [ ] **Step 5: Add read routes**

Modify `src/worker/router.ts` imports:

```ts
import {
  listMasterDataAccounts,
  listMasterDataCategories,
  listMasterDataCurrencies,
  listMasterDataMerchants,
  listMasterDataPeople,
  listMasterDataProjects,
  listMasterDataSnapshot
} from "../api/masterDataGovernance";
```

Add routes before document routes:

```ts
defineRoute("GET", "/api/master-data", listMasterDataSnapshot),
defineRoute("GET", "/api/master-data/people", listMasterDataPeople),
defineRoute("GET", "/api/master-data/projects", listMasterDataProjects),
defineRoute("GET", "/api/master-data/merchants", listMasterDataMerchants),
defineRoute("GET", "/api/master-data/accounts", listMasterDataAccounts),
defineRoute("GET", "/api/master-data/currencies", listMasterDataCurrencies),
defineRoute("GET", "/api/master-data/categories", listMasterDataCategories),
```

- [ ] **Step 6: Run API read tests to verify GREEN**

Run:

```bash
npm test -- tests/api/masterDataGovernance.test.ts tests/api/masterDataGovernanceRepository.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit Task 3**

Run:

```bash
git add src/api/masterDataGovernance.ts src/repositories/masterDataGovernanceRepository.ts src/worker/router.ts tests/api/masterDataGovernance.test.ts tests/api/masterDataGovernanceRepository.test.ts
git commit -m "feat: expose master data governance reads"
```

---

### Task 4: People, Projects, and Merchants Write API

**Files:**
- Modify: `src/repositories/masterDataGovernanceRepository.ts`
- Modify: `src/api/masterDataGovernance.ts`
- Modify: `src/worker/router.ts`
- Modify: `tests/api/masterDataGovernance.test.ts`
- Modify: `tests/api/masterDataGovernanceRepository.test.ts`

- [ ] **Step 1: Add failing write API tests**

Append to `tests/api/masterDataGovernance.test.ts`:

```ts
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
      env: writeMockEnv({ enabledPeople: ["person_admin"], firstRows: [{ id: "person_admin" }, { status: "archived" }] }),
      params: {}
    });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "projectId must reference an active project" });
  });
});
```

At the top of the file, add imports:

```ts
import {
  createMasterDataMerchant,
  createMasterDataPerson
} from "../../src/api/masterDataGovernance";
```

Add a local write mock below `mockEnv`:

```ts
function writeMockEnv(options: { enabledPeople?: string[]; firstRows?: unknown[] } = {}): Env {
  const firstRows = [...(options.firstRows ?? [])];
  return {
    DB: {
      prepare: () =>
        ({
          bindings: [],
          bind(...values: unknown[]) {
            this.bindings = values;
            return this;
          },
          all: async () => ({ success: true, results: [] }),
          first() {
            const boundId = this.bindings?.[0];
            if (typeof boundId === "string" && options.enabledPeople?.includes(boundId)) {
              return Promise.resolve({ id: boundId });
            }
            return Promise.resolve(firstRows.shift() ?? null);
          },
          run: async () => ({ success: true }) as D1Result
        }) as unknown as D1PreparedStatement
    } as unknown as D1Database,
    ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher
  };
}
```

- [ ] **Step 2: Run write tests to verify RED**

Run:

```bash
npm test -- tests/api/masterDataGovernance.test.ts
```

Expected: fail because write handlers are not exported.

- [ ] **Step 3: Add repository write methods**

Add interfaces and methods to `MasterDataGovernanceRepository`:

```ts
export interface CreatePersonInput {
  name: string;
  alias: string | null;
  roles: PersonRole[];
  isEnabled: boolean;
}

export interface CreateProjectInput {
  code: string;
  name: string;
  ownerPersonId: string | null;
  status: ActiveStatus;
  note: string | null;
}

export interface CreateMerchantInput {
  code: string;
  name: string;
  projectId: string;
  merchantType: string | null;
  launchDate: string | null;
  status: ActiveStatus;
  ownerPersonId: string | null;
  note: string | null;
}

async createPerson(input: CreatePersonInput): Promise<GovernancePersonRow> {
  const id = newId("person");
  const createdAt = nowIso();
  const rolesJson = JSON.stringify(input.roles);
  await run(
    this.db
      .prepare(
        `INSERT INTO people (id, name, alias, roles_json, is_enabled, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .bind(id, input.name, input.alias, rolesJson, input.isEnabled ? 1 : 0, createdAt)
  );
  return { id, name: input.name, alias: input.alias, roles_json: rolesJson, is_enabled: input.isEnabled ? 1 : 0, created_at: createdAt, referenceCount: 0 };
}

async createProject(input: CreateProjectInput): Promise<GovernanceProjectRow> {
  const id = newId("proj");
  const createdAt = nowIso();
  await run(
    this.db
      .prepare(
        `INSERT INTO projects (id, code, name, owner_person_id, status, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, input.code, input.name, input.ownerPersonId, input.status, input.note, createdAt)
  );
  return { id, code: input.code, name: input.name, owner_person_id: input.ownerPersonId, status: input.status, note: input.note, created_at: createdAt, referenceCount: 0 };
}
```

Also add `GovernanceMerchantRow` and `createMerchant(input)`:

```ts
export interface GovernanceMerchantRow extends ReferencedRow {
  id: string;
  code: string;
  name: string;
  project_id: string;
  merchant_type: string | null;
  launch_date: string | null;
  status: ActiveStatus;
  owner_person_id: string | null;
  note: string | null;
  created_at: string;
}

async createMerchant(input: CreateMerchantInput): Promise<GovernanceMerchantRow> {
  const id = newId("merc");
  const createdAt = nowIso();
  await run(
    this.db
      .prepare(
        `INSERT INTO merchants (
          id, code, name, project_id, merchant_type, launch_date, status, owner_person_id, note, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        id,
        input.code,
        input.name,
        input.projectId,
        input.merchantType,
        input.launchDate,
        input.status,
        input.ownerPersonId,
        input.note,
        createdAt
      )
  );
  return {
    id,
    code: input.code,
    name: input.name,
    project_id: input.projectId,
    merchant_type: input.merchantType,
    launch_date: input.launchDate,
    status: input.status,
    owner_person_id: input.ownerPersonId,
    note: input.note,
    created_at: createdAt,
    referenceCount: 0
  };
}

async getProjectStatus(id: string): Promise<{ status: ActiveStatus } | null> {
  return first<{ status: ActiveStatus }>(
    this.db.prepare("SELECT status FROM projects WHERE id = ?").bind(id.trim())
  );
}
```

- [ ] **Step 4: Add API body parsing and validation**

In `src/api/masterDataGovernance.ts`, add:

```ts
async function readBody(request: Request) {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}

function requiredText(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required`);
  return value.trim();
}

function optionalText(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}
```

Export:

```ts
export const createMasterDataPerson: Handler = async ({ request, env }) => {
  const body = await readBody(request);
  if (!body) return badRequest("request body is required");

  try {
    const repository = repo(env);
    const actor = await repository.requireEnabledPerson(requiredText(body, "actor"), "actor");
    const name = requiredText(body, "name");
    const roles = Array.isArray(body.roles)
      ? body.roles.filter((role): role is PersonRole => PERSON_ROLES.includes(role as PersonRole))
      : [];
    if (roles.length === 0) return badRequest("roles must include at least one valid role");

    const person = await repository.createPerson({
      name,
      alias: optionalText(body, "alias"),
      roles,
      isEnabled: body.isEnabled !== false
    });
    await auditRepo(env).record({
      actor,
      action: "master_data.person.create",
      entityType: "person",
      entityId: person.id,
      after: person
    });
    return Response.json({ data: person }, { status: 201 });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Request failed");
  }
};
```

Add `createMasterDataProject`:

```ts
export const createMasterDataProject: Handler = async ({ request, env }) => {
  const body = await readBody(request);
  if (!body) return badRequest("request body is required");

  try {
    const repository = repo(env);
    const actor = await repository.requireEnabledPerson(requiredText(body, "actor"), "actor");
    const ownerPersonId = optionalText(body, "ownerPersonId");
    if (ownerPersonId) await repository.requireEnabledPerson(ownerPersonId, "ownerPersonId");
    const status = optionalText(body, "status") ?? "active";
    if (!ACTIVE_STATUSES.includes(status as ActiveStatus)) return badRequest("status must be active or archived");

    const project = await repository.createProject({
      code: normalizeCode(requiredText(body, "code")),
      name: requiredText(body, "name"),
      ownerPersonId,
      status: status as ActiveStatus,
      note: optionalText(body, "note")
    });
    await auditRepo(env).record({
      actor,
      action: "master_data.project.create",
      entityType: "project",
      entityId: project.id,
      after: project
    });
    return Response.json({ data: project }, { status: 201 });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Request failed");
  }
};
```

Add `createMasterDataMerchant`:

```ts
export const createMasterDataMerchant: Handler = async ({ request, env }) => {
  const body = await readBody(request);
  if (!body) return badRequest("request body is required");

  try {
    const repository = repo(env);
    const actor = await repository.requireEnabledPerson(requiredText(body, "actor"), "actor");
    const projectId = requiredText(body, "projectId");
    const project = await repository.getProjectStatus(projectId);
    if (project?.status !== "active") return badRequest("projectId must reference an active project");

    const ownerPersonId = optionalText(body, "ownerPersonId");
    if (ownerPersonId) await repository.requireEnabledPerson(ownerPersonId, "ownerPersonId");
    const status = optionalText(body, "status") ?? "active";
    if (!ACTIVE_STATUSES.includes(status as ActiveStatus)) return badRequest("status must be active or archived");

    const merchant = await repository.createMerchant({
      code: normalizeCode(requiredText(body, "code")),
      name: requiredText(body, "name"),
      projectId,
      merchantType: optionalText(body, "merchantType"),
      launchDate: optionalText(body, "launchDate"),
      status: status as ActiveStatus,
      ownerPersonId,
      note: optionalText(body, "note")
    });
    await auditRepo(env).record({
      actor,
      action: "master_data.merchant.create",
      entityType: "merchant",
      entityId: merchant.id,
      after: merchant
    });
    return Response.json({ data: merchant }, { status: 201 });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Request failed");
  }
};
```

- [ ] **Step 5: Add write routes**

Modify `src/worker/router.ts` imports:

```ts
import {
  createMasterDataMerchant,
  createMasterDataPerson,
  createMasterDataProject
} from "../api/masterDataGovernance";
```

Add routes:

```ts
defineRoute("POST", "/api/master-data/people", createMasterDataPerson),
defineRoute("POST", "/api/master-data/projects", createMasterDataProject),
defineRoute("POST", "/api/master-data/merchants", createMasterDataMerchant),
```

- [ ] **Step 6: Run write tests to verify GREEN**

Run:

```bash
npm test -- tests/api/masterDataGovernance.test.ts tests/api/masterDataGovernanceRepository.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit Task 4**

Run:

```bash
git add src/api/masterDataGovernance.ts src/repositories/masterDataGovernanceRepository.ts src/worker/router.ts tests/api/masterDataGovernance.test.ts tests/api/masterDataGovernanceRepository.test.ts
git commit -m "feat: add people project merchant governance writes"
```

---

### Task 5: Accounts, Currencies, and Categories Write API with Protection

**Files:**
- Modify: `src/repositories/masterDataGovernanceRepository.ts`
- Modify: `src/api/masterDataGovernance.ts`
- Modify: `src/worker/router.ts`
- Modify: `tests/api/masterDataGovernance.test.ts`
- Modify: `tests/api/masterDataGovernanceRepository.test.ts`

- [ ] **Step 1: Add failing protection tests**

Append to `tests/api/masterDataGovernanceRepository.test.ts`:

```ts
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
});
```

Append to `tests/api/masterDataGovernance.test.ts`:

```ts
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
```

- [ ] **Step 2: Run protection tests to verify RED**

Run:

```bash
npm test -- tests/api/masterDataGovernance.test.ts tests/api/masterDataGovernanceRepository.test.ts
```

Expected: fail because account/currency/category write methods are not implemented.

- [ ] **Step 3: Add account, currency, and category repository methods**

Add methods with these signatures:

```ts
createAccount(input: CreateAccountInput): Promise<GovernanceAccountRow>
updateAccount(id: string, input: UpdateAccountInput): Promise<GovernanceAccountRow>
createCurrency(input: CreateCurrencyInput): Promise<GovernanceCurrencyRow>
updateCurrency(code: string, input: UpdateCurrencyInput): Promise<GovernanceCurrencyRow>
createCategory(input: CreateCategoryInput): Promise<GovernanceCategoryRow>
updateCategory(id: string, input: UpdateCategoryInput): Promise<GovernanceCategoryRow>
assertAccountProtectedFieldsUnchanged(id: string, next: AccountProtectedFields): Promise<void>
assertCategoryProtectedFieldsUnchanged(id: string, next: CategoryProtectedFields): Promise<void>
```

Protected account checks:

```ts
if (existing.referenceCount > 0 && existing.currency_code !== next.currencyCode) {
  throw new Error("account currency cannot be changed after use");
}
if (existing.referenceCount > 0 && existing.account_type !== next.accountType) {
  throw new Error("account type cannot be changed after use");
}
if (existing.referenceCount > 0 && Boolean(existing.is_company_account) !== next.isCompanyAccount) {
  throw new Error("account company flag cannot be changed after use");
}
if (existing.referenceCount > 0 && (existing.owner_person_id ?? null) !== next.ownerPersonId) {
  throw new Error("account owner cannot be changed after use");
}
```

Protected category checks:

```ts
if (existing.referenceCount > 0 && existing.category_type !== next.categoryType) {
  throw new Error("category type cannot be changed after use");
}
if (existing.referenceCount > 0 && existing.direction !== next.direction) {
  throw new Error("category direction cannot be changed after use");
}
if (existing.referenceCount > 0 && Number(existing.affects_expense_report) !== Number(next.affectsExpenseReport)) {
  throw new Error("category expense report flag cannot be changed after use");
}
```

- [ ] **Step 4: Add API validations**

In `src/repositories/masterDataGovernanceRepository.ts`, also add these lookup helpers because the API handlers call them before writes:

```ts
async requireEnabledCurrency(code: string): Promise<string> {
  const normalizedCode = code.trim().toUpperCase();
  const currency = await first<{ code: string }>(
    this.db.prepare("SELECT code FROM currencies WHERE code = ? AND is_enabled = 1").bind(normalizedCode)
  );
  if (!currency) throw new Error("currencyCode must reference an enabled currency");
  return normalizedCode;
}

async requireEnabledCategory(id: string): Promise<string> {
  const normalizedId = id.trim();
  const category = await first<{ id: string }>(
    this.db.prepare("SELECT id FROM management_categories WHERE id = ? AND is_enabled = 1").bind(normalizedId)
  );
  if (!category) throw new Error("parentId must reference an enabled category");
  return normalizedId;
}
```

In `src/api/masterDataGovernance.ts`, add these validation helpers:

```ts
function requiredParam(params: Record<string, string>, key: string) {
  const value = params[key];
  if (!value || !value.trim()) throw new Error(`${key} is required`);
  return value.trim();
}

function booleanField(body: Record<string, unknown>, key: string, fallback: boolean) {
  const value = body[key];
  return typeof value === "boolean" ? value : fallback;
}

function integerField(body: Record<string, unknown>, key: string) {
  const value = body[key];
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isInteger(parsed)) throw new Error(`${key} must be an integer`);
  return parsed;
}

function activeStatus(body: Record<string, unknown>) {
  const value = requiredText(body, "status");
  if (!ACTIVE_STATUSES.includes(value as ActiveStatus)) throw new Error("status must be active or archived");
  return value as ActiveStatus;
}

function accountType(body: Record<string, unknown>) {
  const value = requiredText(body, "accountType");
  if (!ACCOUNT_TYPES.includes(value as AccountType)) throw new Error("accountType is invalid");
  return value as AccountType;
}

function categoryType(body: Record<string, unknown>) {
  const value = requiredText(body, "categoryType");
  if (!CATEGORY_TYPES.includes(value as CategoryType)) throw new Error("categoryType is invalid");
  return value as CategoryType;
}

function categoryDirection(body: Record<string, unknown>) {
  const value = requiredText(body, "direction");
  if (!CATEGORY_DIRECTIONS.includes(value as CategoryDirection)) throw new Error("direction is invalid");
  return value as CategoryDirection;
}
```

Add these request builders:

```ts
async function accountInput(repository: MasterDataGovernanceRepository, body: Record<string, unknown>) {
  const nextAccountType = accountType(body);
  const currencyCode = await repository.requireEnabledCurrency(requiredText(body, "currencyCode"));
  const ownerPersonId = optionalText(body, "ownerPersonId");
  if (ownerPersonId) await repository.requireEnabledPerson(ownerPersonId, "ownerPersonId");
  const isCompanyAccount = booleanField(body, "isCompanyAccount", false);
  const allowNegative = booleanField(body, "allowNegative", false);
  if (nextAccountType === "petty_cash" && !ownerPersonId) throw new Error("petty cash account requires ownerPersonId");
  if (nextAccountType === "petty_cash" && isCompanyAccount) throw new Error("petty cash account cannot be company account");
  if (nextAccountType === "petty_cash" && !allowNegative) throw new Error("petty cash account must allow negative balance");
  if (isCompanyAccount && ownerPersonId) throw new Error("company account cannot have ownerPersonId");
  return {
    name: requiredText(body, "name"),
    accountType: nextAccountType,
    currencyCode,
    ownerPersonId,
    isCompanyAccount,
    allowNegative,
    status: activeStatus(body)
  };
}

function currencyInput(body: Record<string, unknown>, codeFromRoute?: string) {
  const code = normalizeCode(codeFromRoute ?? requiredText(body, "code"));
  const minorUnits = integerField(body, "minorUnits");
  if (minorUnits < 0 || minorUnits > 6) throw new Error("minorUnits must be between 0 and 6");
  const isEnabled = booleanField(body, "isEnabled", true);
  if (code === "USDT" && !isEnabled) throw new Error("USDT cannot be disabled");
  return {
    code,
    name: requiredText(body, "name"),
    minorUnits,
    isEnabled
  };
}

async function categoryInput(
  repository: MasterDataGovernanceRepository,
  body: Record<string, unknown>,
  currentId?: string
) {
  const parentId = optionalText(body, "parentId");
  if (parentId && currentId && parentId === currentId) throw new Error("parentId cannot equal category id");
  if (parentId) await repository.requireEnabledCategory(parentId);
  return {
    name: requiredText(body, "name"),
    parentId,
    categoryType: categoryType(body),
    direction: categoryDirection(body),
    affectsExpenseReport: booleanField(body, "affectsExpenseReport", false),
    affectsProjectReport: booleanField(body, "affectsProjectReport", false),
    requiresMerchant: booleanField(body, "requiresMerchant", false),
    requiresPerson: booleanField(body, "requiresPerson", false),
    requiresBorrower: booleanField(body, "requiresBorrower", false),
    isEnabled: booleanField(body, "isEnabled", true)
  };
}
```

Add these handlers:

```ts
export const createMasterDataAccount: Handler = async ({ request, env }) => {
  const body = await readBody(request);
  if (!body) return badRequest("request body is required");
  try {
    const repository = repo(env);
    const actor = await repository.requireEnabledPerson(requiredText(body, "actor"), "actor");
    const input = await accountInput(repository, body);
    const account = await repository.createAccount(input);
    await auditRepo(env).record({ actor, action: "master_data.account.create", entityType: "account", entityId: account.id, after: account });
    return Response.json({ data: account }, { status: 201 });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Request failed");
  }
};

export const updateMasterDataAccount: Handler = async ({ request, env, params }) => {
  const body = await readBody(request);
  if (!body) return badRequest("request body is required");
  try {
    const id = requiredParam(params, "id");
    const repository = repo(env);
    const actor = await repository.requireEnabledPerson(requiredText(body, "actor"), "actor");
    const input = await accountInput(repository, body);
    await repository.assertAccountProtectedFieldsUnchanged(id, input);
    const account = await repository.updateAccount(id, input);
    await auditRepo(env).record({ actor, action: "master_data.account.update", entityType: "account", entityId: account.id, after: account });
    return Response.json({ data: account });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Request failed");
  }
};

export const createMasterDataCurrency: Handler = async ({ request, env }) => {
  const body = await readBody(request);
  if (!body) return badRequest("request body is required");
  try {
    const repository = repo(env);
    const actor = await repository.requireEnabledPerson(requiredText(body, "actor"), "actor");
    const input = currencyInput(body);
    const currency = await repository.createCurrency(input);
    await auditRepo(env).record({ actor, action: "master_data.currency.create", entityType: "currency", entityId: currency.code, after: currency });
    return Response.json({ data: currency }, { status: 201 });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Request failed");
  }
};

export const updateMasterDataCurrency: Handler = async ({ request, env, params }) => {
  const body = await readBody(request);
  if (!body) return badRequest("request body is required");
  try {
    const repository = repo(env);
    const actor = await repository.requireEnabledPerson(requiredText(body, "actor"), "actor");
    const input = currencyInput(body, requiredParam(params, "code"));
    const currency = await repository.updateCurrency(input.code, input);
    await auditRepo(env).record({ actor, action: "master_data.currency.update", entityType: "currency", entityId: currency.code, after: currency });
    return Response.json({ data: currency });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Request failed");
  }
};

export const createMasterDataCategory: Handler = async ({ request, env }) => {
  const body = await readBody(request);
  if (!body) return badRequest("request body is required");
  try {
    const repository = repo(env);
    const actor = await repository.requireEnabledPerson(requiredText(body, "actor"), "actor");
    const input = await categoryInput(repository, body);
    const category = await repository.createCategory(input);
    await auditRepo(env).record({ actor, action: "master_data.category.create", entityType: "management_category", entityId: category.id, after: category });
    return Response.json({ data: category }, { status: 201 });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Request failed");
  }
};

export const updateMasterDataCategory: Handler = async ({ request, env, params }) => {
  const body = await readBody(request);
  if (!body) return badRequest("request body is required");
  try {
    const id = requiredParam(params, "id");
    const repository = repo(env);
    const actor = await repository.requireEnabledPerson(requiredText(body, "actor"), "actor");
    const input = await categoryInput(repository, body, id);
    await repository.assertCategoryProtectedFieldsUnchanged(id, input);
    const category = await repository.updateCategory(id, input);
    await auditRepo(env).record({ actor, action: "master_data.category.update", entityType: "management_category", entityId: category.id, after: category });
    return Response.json({ data: category });
  } catch (error) {
    return badRequest(error instanceof Error ? error.message : "Request failed");
  }
};
```

- [ ] **Step 5: Add routes**

Add to `src/worker/router.ts`:

```ts
defineRoute("POST", "/api/master-data/accounts", createMasterDataAccount),
defineRoute("PATCH", "/api/master-data/accounts/:id", updateMasterDataAccount),
defineRoute("POST", "/api/master-data/currencies", createMasterDataCurrency),
defineRoute("PATCH", "/api/master-data/currencies/:code", updateMasterDataCurrency),
defineRoute("POST", "/api/master-data/categories", createMasterDataCategory),
defineRoute("PATCH", "/api/master-data/categories/:id", updateMasterDataCategory),
```

- [ ] **Step 6: Run tests to verify GREEN**

Run:

```bash
npm test -- tests/api/masterDataGovernance.test.ts tests/api/masterDataGovernanceRepository.test.ts
```

Expected: pass.

- [ ] **Step 7: Commit Task 5**

Run:

```bash
git add src/api/masterDataGovernance.ts src/repositories/masterDataGovernanceRepository.ts src/worker/router.ts tests/api/masterDataGovernance.test.ts tests/api/masterDataGovernanceRepository.test.ts
git commit -m "feat: add protected master data writes"
```

---

### Task 6: Shared Master Data UI Components

**Files:**
- Create: `src/app/pages/master-data/MasterDataTable.tsx`
- Create: `src/app/pages/master-data/MasterDataForm.tsx`
- Create: `src/app/pages/master-data/MasterDataOverview.tsx`
- Modify: `src/app/styles.css`

- [ ] **Step 1: Write a failing import smoke test**

Add to `src/app/pages/master-data/masterDataModel.test.ts`:

```ts
import { describe, expect, it } from "vitest";

describe("master data component modules", () => {
  it("exports shared table and form components", async () => {
    const table = await import("./MasterDataTable");
    const form = await import("./MasterDataForm");
    const overview = await import("./MasterDataOverview");

    expect(table.MasterDataTable).toBeTypeOf("function");
    expect(form.FormActions).toBeTypeOf("function");
    expect(overview.MasterDataOverview).toBeTypeOf("function");
  });
});
```

- [ ] **Step 2: Run the smoke test to verify RED**

Run:

```bash
npm test -- src/app/pages/master-data/masterDataModel.test.ts
```

Expected: fail because component files do not exist.

- [ ] **Step 3: Create shared table**

Create `src/app/pages/master-data/MasterDataTable.tsx`:

```tsx
import type { ReactNode } from "react";

interface Column<Row> {
  key: string;
  header: string;
  render: (row: Row) => ReactNode;
}

interface MasterDataTableProps<Row> {
  rows: Row[];
  columns: Array<Column<Row>>;
  getRowKey: (row: Row) => string;
  emptyText: string;
}

export function MasterDataTable<Row>({ rows, columns, getRowKey, emptyText }: MasterDataTableProps<Row>) {
  return (
    <div className="table-wrap master-data-table-wrap">
      <table className="data-table master-data-table">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key}>{column.header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length > 0 ? (
            rows.map((row) => (
              <tr key={getRowKey(row)}>
                {columns.map((column) => (
                  <td key={column.key}>{column.render(row)}</td>
                ))}
              </tr>
            ))
          ) : (
            <tr>
              <td className="empty-cell" colSpan={columns.length}>
                {emptyText}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 4: Create form helpers**

Create `src/app/pages/master-data/MasterDataForm.tsx`:

```tsx
import type { ReactNode } from "react";

export function FormActions({
  isSubmitting,
  submitLabel,
  onCancel
}: {
  isSubmitting: boolean;
  submitLabel: string;
  onCancel?: () => void;
}) {
  return (
    <div className="form-actions">
      {onCancel ? (
        <button className="secondary-button" type="button" onClick={onCancel} disabled={isSubmitting}>
          取消
        </button>
      ) : null}
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "提交中" : submitLabel}
      </button>
    </div>
  );
}

export function FieldHint({ children }: { children: ReactNode }) {
  return <div className="field-hint">{children}</div>;
}
```

- [ ] **Step 5: Create overview component**

Create `src/app/pages/master-data/MasterDataOverview.tsx`:

```tsx
import type { MasterDataSnapshot } from "./masterDataTypes";

export function MasterDataOverview({ data }: { data: MasterDataSnapshot }) {
  const activeProjects = data.projects.filter((project) => project.status === "active").length;
  const activeMerchants = data.merchants.filter((merchant) => merchant.status === "active").length;
  const companyAccounts = data.accounts.filter(
    (account) => account.status === "active" && account.is_company_account
  ).length;
  const pettyCashAccounts = data.accounts.filter(
    (account) => account.status === "active" && account.account_type === "petty_cash"
  ).length;

  return (
    <div className="master-data-overview">
      <div><span>启用人员</span><strong>{data.people.filter((person) => person.is_enabled).length}</strong></div>
      <div><span>项目</span><strong>{activeProjects}</strong></div>
      <div><span>商户</span><strong>{activeMerchants}</strong></div>
      <div><span>公司账户</span><strong>{companyAccounts}</strong></div>
      <div><span>备用金账户</span><strong>{pettyCashAccounts}</strong></div>
      <div><span>启用科目</span><strong>{data.categories.filter((category) => category.is_enabled).length}</strong></div>
    </div>
  );
}
```

- [ ] **Step 6: Add compact styles**

Append to `src/app/styles.css`:

```css
.master-data-overview {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 12px;
}

.master-data-overview > div {
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 12px;
  background: var(--surface);
}

.master-data-overview span {
  display: block;
  color: var(--muted);
  font-size: 12px;
}

.master-data-overview strong {
  display: block;
  margin-top: 4px;
  font-size: 20px;
}

.master-data-tabs {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.field-hint {
  color: var(--muted);
  font-size: 12px;
}
```

If `--border`, `--surface`, or `--muted` do not exist, use existing CSS variables from `src/app/styles.css`.

- [ ] **Step 7: Run frontend tests to verify GREEN**

Run:

```bash
npm test -- src/app/pages/master-data/masterDataModel.test.ts
npx tsc --noEmit
```

Expected: both pass.

- [ ] **Step 8: Commit Task 6**

Run:

```bash
git add src/app/pages/master-data/MasterDataTable.tsx src/app/pages/master-data/MasterDataForm.tsx src/app/pages/master-data/MasterDataOverview.tsx src/app/pages/master-data/masterDataModel.test.ts src/app/styles.css
git commit -m "feat: add master data shared UI components"
```

---

### Task 7: People, Projects, and Merchants Tabs

**Files:**
- Create: `src/app/pages/master-data/PeopleTab.tsx`
- Create: `src/app/pages/master-data/ProjectsTab.tsx`
- Create: `src/app/pages/master-data/MerchantsTab.tsx`
- Modify: `src/app/pages/MasterDataPage.tsx`

- [ ] **Step 1: Add a failing page import test**

Add to `src/app/pages/master-data/masterDataModel.test.ts`:

```ts
describe("master data first tab modules", () => {
  it("exports people project and merchant tabs", async () => {
    const people = await import("./PeopleTab");
    const projects = await import("./ProjectsTab");
    const merchants = await import("./MerchantsTab");

    expect(people.PeopleTab).toBeTypeOf("function");
    expect(projects.ProjectsTab).toBeTypeOf("function");
    expect(merchants.MerchantsTab).toBeTypeOf("function");
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
npm test -- src/app/pages/master-data/masterDataModel.test.ts
```

Expected: fail because tab modules do not exist.

- [ ] **Step 3: Create PeopleTab**

Create `src/app/pages/master-data/PeopleTab.tsx`:

```tsx
import type { PersonRow } from "./masterDataTypes";
import { MasterDataTable } from "./MasterDataTable";
import { parseRoles, personRoleLabels } from "./masterDataModel";

export function PeopleTab({ rows }: { rows: PersonRow[] }) {
  return (
    <MasterDataTable
      rows={rows}
      getRowKey={(row) => row.id}
      emptyText="暂无人员"
      columns={[
        { key: "name", header: "姓名", render: (row) => row.name },
        { key: "alias", header: "别名", render: (row) => row.alias || "无" },
        {
          key: "roles",
          header: "角色",
          render: (row) => parseRoles(row.roles_json).map((role) => personRoleLabels[role]).join("、") || "无"
        },
        { key: "status", header: "状态", render: (row) => (row.is_enabled ? "启用" : "停用") },
        { key: "refs", header: "引用", render: (row) => row.referenceCount }
      ]}
    />
  );
}
```

- [ ] **Step 4: Create ProjectsTab and MerchantsTab**

Create `src/app/pages/master-data/ProjectsTab.tsx`:

```tsx
import { MasterDataTable } from "./MasterDataTable";
import type { ProjectRow } from "./masterDataTypes";

export function ProjectsTab({ rows }: { rows: ProjectRow[] }) {
  return (
    <MasterDataTable
      rows={rows}
      getRowKey={(row) => row.id}
      emptyText="暂无项目"
      columns={[
        { key: "code", header: "项目编码", render: (row) => <span className="mono">{row.code}</span> },
        { key: "name", header: "项目名称", render: (row) => row.name },
        { key: "owner", header: "负责人", render: (row) => row.owner_person_id || "无" },
        { key: "status", header: "状态", render: (row) => (row.status === "active" ? "启用" : "归档") },
        { key: "refs", header: "引用", render: (row) => row.referenceCount }
      ]}
    />
  );
}
```

Create `src/app/pages/master-data/MerchantsTab.tsx`:

```tsx
import { MasterDataTable } from "./MasterDataTable";
import type { MerchantRow } from "./masterDataTypes";

export function MerchantsTab({ rows }: { rows: MerchantRow[] }) {
  return (
    <MasterDataTable
      rows={rows}
      getRowKey={(row) => row.id}
      emptyText="暂无商户"
      columns={[
        { key: "code", header: "商户编码", render: (row) => <span className="mono">{row.code}</span> },
        { key: "name", header: "商户名称", render: (row) => row.name },
        { key: "project", header: "所属项目", render: (row) => row.project_id },
        { key: "type", header: "商户类型", render: (row) => row.merchant_type || "无" },
        { key: "status", header: "状态", render: (row) => (row.status === "active" ? "启用" : "归档") },
        { key: "refs", header: "引用", render: (row) => row.referenceCount }
      ]}
    />
  );
}
```

- [ ] **Step 5: Integrate tabs into MasterDataPage read-only**

Replace `src/app/pages/MasterDataPage.tsx` with a read-only governance shell:

```tsx
import { useEffect, useState } from "react";
import { getJson, type ApiEnvelope } from "../api";
import { MasterDataOverview } from "./master-data/MasterDataOverview";
import { MerchantsTab } from "./master-data/MerchantsTab";
import { PeopleTab } from "./master-data/PeopleTab";
import { ProjectsTab } from "./master-data/ProjectsTab";
import type { MasterDataSnapshot } from "./master-data/masterDataTypes";

type TabKey = "people" | "projects" | "merchants";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "people", label: "人员" },
  { key: "projects", label: "项目" },
  { key: "merchants", label: "商户" }
];

const emptySnapshot: MasterDataSnapshot = {
  people: [],
  projects: [],
  merchants: [],
  accounts: [],
  currencies: [],
  categories: []
};

export function MasterDataPage() {
  const [activeTab, setActiveTab] = useState<TabKey>("people");
  const [data, setData] = useState<MasterDataSnapshot>(emptySnapshot);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await getJson<ApiEnvelope<MasterDataSnapshot>>("/api/master-data");
        if (isCurrent) setData(response.data);
      } catch (loadError) {
        if (isCurrent) setError(loadError instanceof Error ? loadError.message : "读取基础资料失败");
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }
    void load();
    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <h2>基础资料治理中心</h2>
          <div className="status-slot" role="status" aria-live="polite">
            {isLoading ? "读取中" : error ? "读取失败" : "已读取"}
          </div>
        </div>
        {error ? <div className="notice error">{error}</div> : <MasterDataOverview data={data} />}
      </section>

      <section className="panel">
        <div className="master-data-tabs" role="tablist" aria-label="基础资料分类">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              className={activeTab === tab.key ? "tab-button active" : "tab-button"}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {activeTab === "people" ? <PeopleTab rows={data.people} /> : null}
        {activeTab === "projects" ? <ProjectsTab rows={data.projects} /> : null}
        {activeTab === "merchants" ? <MerchantsTab rows={data.merchants} /> : null}
      </section>
    </div>
  );
}
```

- [ ] **Step 6: Run tests and typecheck**

Run:

```bash
npm test -- src/app/pages/master-data/masterDataModel.test.ts
npx tsc --noEmit
```

Expected: pass.

- [ ] **Step 7: Commit Task 7**

Run:

```bash
git add src/app/pages/MasterDataPage.tsx src/app/pages/master-data/PeopleTab.tsx src/app/pages/master-data/ProjectsTab.tsx src/app/pages/master-data/MerchantsTab.tsx
git commit -m "feat: add master data people project merchant tabs"
```

---

### Task 8: Accounts, Currencies, and Categories Tabs

**Files:**
- Create or modify: `src/app/pages/master-data/AccountsTab.tsx`
- Create or modify: `src/app/pages/master-data/CurrenciesTab.tsx`
- Create or modify: `src/app/pages/master-data/CategoriesTab.tsx`
- Modify: `src/app/pages/MasterDataPage.tsx`
- Modify: `src/app/pages/master-data/masterDataModel.test.ts`

- [ ] **Step 1: Add failing tab export test**

Append:

```ts
describe("master data accounting tab modules", () => {
  it("exports account currency and category tabs", async () => {
    const accounts = await import("./AccountsTab");
    const currencies = await import("./CurrenciesTab");
    const categories = await import("./CategoriesTab");

    expect(accounts.AccountsTab).toBeTypeOf("function");
    expect(currencies.CurrenciesTab).toBeTypeOf("function");
    expect(categories.CategoriesTab).toBeTypeOf("function");
  });
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
npm test -- src/app/pages/master-data/masterDataModel.test.ts
```

Expected: fail if modules are not already complete.

- [ ] **Step 3: Create AccountsTab**

Create:

```tsx
import type { AccountRow } from "./masterDataTypes";
import { MasterDataTable } from "./MasterDataTable";
import { accountTypeLabels } from "./masterDataModel";

export function AccountsTab({ rows }: { rows: AccountRow[] }) {
  return (
    <MasterDataTable
      rows={rows}
      getRowKey={(row) => row.id}
      emptyText="暂无账户"
      columns={[
        { key: "name", header: "账户", render: (row) => row.name },
        { key: "type", header: "类型", render: (row) => accountTypeLabels[row.account_type] },
        { key: "currency", header: "币种", render: (row) => <span className="mono">{row.currency_code}</span> },
        { key: "owner", header: "所属人员", render: (row) => row.owner_person_id || "无" },
        { key: "negative", header: "允许负数", render: (row) => (row.allow_negative ? "是" : "否") },
        { key: "status", header: "状态", render: (row) => row.status === "active" ? "启用" : "归档" },
        { key: "refs", header: "引用", render: (row) => row.referenceCount }
      ]}
    />
  );
}
```

- [ ] **Step 4: Create CurrenciesTab**

Create `src/app/pages/master-data/CurrenciesTab.tsx`:

```tsx
import { MasterDataTable } from "./MasterDataTable";
import type { CurrencyRow } from "./masterDataTypes";

export function CurrenciesTab({ rows }: { rows: CurrencyRow[] }) {
  return (
    <MasterDataTable
      rows={rows}
      getRowKey={(row) => row.code}
      emptyText="暂无币种"
      columns={[
        { key: "code", header: "币种", render: (row) => <span className="mono">{row.code}</span> },
        { key: "name", header: "名称", render: (row) => row.name },
        { key: "minor", header: "小数位", render: (row) => row.minor_units },
        { key: "status", header: "状态", render: (row) => (row.is_enabled ? "启用" : "停用") },
        { key: "refs", header: "引用", render: (row) => row.referenceCount }
      ]}
    />
  );
}
```

- [ ] **Step 5: Create CategoriesTab**

Create `src/app/pages/master-data/CategoriesTab.tsx`:

```tsx
import { MasterDataTable } from "./MasterDataTable";
import { categoryTypeLabels } from "./masterDataModel";
import type { CategoryDirection, CategoryRow } from "./masterDataTypes";

const categoryDirectionLabels: Record<CategoryDirection, string> = {
  in: "流入",
  out: "流出",
  neutral: "中性"
};

export function CategoriesTab({ rows }: { rows: CategoryRow[] }) {
  return (
    <MasterDataTable
      rows={rows}
      getRowKey={(row) => row.id}
      emptyText="暂无科目"
      columns={[
        { key: "name", header: "科目", render: (row) => row.name },
        { key: "type", header: "类型", render: (row) => categoryTypeLabels[row.category_type] },
        { key: "direction", header: "方向", render: (row) => categoryDirectionLabels[row.direction] },
        { key: "expense", header: "费用报表", render: (row) => (row.affects_expense_report ? "是" : "否") },
        { key: "project", header: "项目报表", render: (row) => (row.affects_project_report ? "是" : "否") },
        { key: "status", header: "状态", render: (row) => (row.is_enabled ? "启用" : "停用") },
        { key: "refs", header: "引用", render: (row) => row.referenceCount }
      ]}
    />
  );
}
```

- [ ] **Step 6: Add the accounting tabs to MasterDataPage**

Modify `src/app/pages/MasterDataPage.tsx` imports:

```tsx
import { AccountsTab } from "./master-data/AccountsTab";
import { CategoriesTab } from "./master-data/CategoriesTab";
import { CurrenciesTab } from "./master-data/CurrenciesTab";
```

Replace `TabKey` and `tabs` with:

```tsx
type TabKey = "people" | "projects" | "merchants" | "accounts" | "currencies" | "categories";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "people", label: "人员" },
  { key: "projects", label: "项目" },
  { key: "merchants", label: "商户" },
  { key: "accounts", label: "账户" },
  { key: "currencies", label: "币种" },
  { key: "categories", label: "管理科目" }
];
```

Add these render branches inside the tab panel:

```tsx
{activeTab === "accounts" ? <AccountsTab rows={data.accounts} /> : null}
{activeTab === "currencies" ? <CurrenciesTab rows={data.currencies} /> : null}
{activeTab === "categories" ? <CategoriesTab rows={data.categories} /> : null}
```

- [ ] **Step 7: Run tests and typecheck**

Run:

```bash
npm test -- src/app/pages/master-data/masterDataModel.test.ts
npx tsc --noEmit
```

Expected: pass.

- [ ] **Step 8: Commit Task 8**

Run:

```bash
git add src/app/pages/MasterDataPage.tsx src/app/pages/master-data/AccountsTab.tsx src/app/pages/master-data/CurrenciesTab.tsx src/app/pages/master-data/CategoriesTab.tsx src/app/pages/master-data/masterDataModel.test.ts
git commit -m "feat: add account currency category tabs"
```

---

### Task 9: Create Forms and Reload Flow

**Files:**
- Modify: `src/app/pages/master-data/PeopleTab.tsx`
- Modify: `src/app/pages/master-data/ProjectsTab.tsx`
- Modify: `src/app/pages/master-data/MerchantsTab.tsx`
- Modify: `src/app/pages/master-data/AccountsTab.tsx`
- Modify: `src/app/pages/master-data/CurrenciesTab.tsx`
- Modify: `src/app/pages/master-data/CategoriesTab.tsx`
- Modify: `src/app/pages/MasterDataPage.tsx`
- Modify: `src/app/pages/master-data/masterDataModel.ts`

- [ ] **Step 1: Add model tests for create payloads**

Extend `masterDataModel.test.ts`:

```ts
import {
  buildCategoryPayload,
  buildCurrencyPayload,
  buildMerchantPayload,
  buildProjectPayload
} from "./masterDataModel";

it("builds project payloads with uppercase code and actor", () => {
  expect(buildProjectPayload({ code: " p1 ", name: " Project ", ownerPersonId: "", status: "active", note: "" }, "person_admin")).toEqual({
    actor: "person_admin",
    code: "P1",
    name: "Project",
    ownerPersonId: null,
    status: "active",
    note: null
  });
});

it("builds merchant payloads with project linkage", () => {
  expect(buildMerchantPayload({ code: " m1 ", name: " Merchant ", projectId: "proj_1", merchantType: "site", launchDate: "", status: "active", ownerPersonId: "", note: "" }, "person_admin")).toEqual({
    actor: "person_admin",
    code: "M1",
    name: "Merchant",
    projectId: "proj_1",
    merchantType: "site",
    launchDate: null,
    status: "active",
    ownerPersonId: null,
    note: null
  });
});

it("builds currency and category payloads", () => {
  expect(buildCurrencyPayload({ code: " aed ", name: "Dirham", minorUnits: "2", isEnabled: true }, "person_admin")).toEqual({
    actor: "person_admin",
    code: "AED",
    name: "Dirham",
    minorUnits: 2,
    isEnabled: true
  });
  expect(buildCategoryPayload({ name: "Travel", parentId: "", categoryType: "expense", direction: "out", affectsExpenseReport: true, affectsProjectReport: false, requiresMerchant: false, requiresPerson: true, requiresBorrower: false, isEnabled: true }, "person_admin")).toMatchObject({
    actor: "person_admin",
    name: "Travel",
    parentId: null,
    categoryType: "expense",
    direction: "out"
  });
});
```

- [ ] **Step 2: Run payload tests to verify RED**

Run:

```bash
npm test -- src/app/pages/master-data/masterDataModel.test.ts
```

Expected: fail for missing payload builders.

- [ ] **Step 3: Implement payload builders**

Add form interfaces to `masterDataTypes.ts`:

```ts
export interface ProjectForm {
  code: string;
  name: string;
  ownerPersonId: string;
  status: ActiveStatus;
  note: string;
}

export interface MerchantForm {
  code: string;
  name: string;
  projectId: string;
  merchantType: string;
  launchDate: string;
  status: ActiveStatus;
  ownerPersonId: string;
  note: string;
}

export interface CurrencyForm {
  code: string;
  name: string;
  minorUnits: string;
  isEnabled: boolean;
}

export interface CategoryForm {
  name: string;
  parentId: string;
  categoryType: CategoryType;
  direction: CategoryDirection;
  affectsExpenseReport: boolean;
  affectsProjectReport: boolean;
  requiresMerchant: boolean;
  requiresPerson: boolean;
  requiresBorrower: boolean;
  isEnabled: boolean;
}
```

Add these builders to `masterDataModel.ts`:

```ts
import type { CategoryForm, CurrencyForm, MerchantForm, ProjectForm } from "./masterDataTypes";

function nullableText(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function buildProjectPayload(form: ProjectForm, actor: string): Record<string, unknown> {
  return {
    actor: actor.trim(),
    code: normalizeCode(form.code),
    name: form.name.trim(),
    ownerPersonId: nullableText(form.ownerPersonId),
    status: form.status,
    note: nullableText(form.note)
  };
}

export function buildMerchantPayload(form: MerchantForm, actor: string): Record<string, unknown> {
  return {
    actor: actor.trim(),
    code: normalizeCode(form.code),
    name: form.name.trim(),
    projectId: form.projectId.trim(),
    merchantType: nullableText(form.merchantType),
    launchDate: nullableText(form.launchDate),
    status: form.status,
    ownerPersonId: nullableText(form.ownerPersonId),
    note: nullableText(form.note)
  };
}

export function buildCurrencyPayload(form: CurrencyForm, actor: string): Record<string, unknown> {
  return {
    actor: actor.trim(),
    code: normalizeCode(form.code),
    name: form.name.trim(),
    minorUnits: Number(form.minorUnits),
    isEnabled: form.isEnabled
  };
}

export function buildCategoryPayload(form: CategoryForm, actor: string): Record<string, unknown> {
  return {
    actor: actor.trim(),
    name: form.name.trim(),
    parentId: nullableText(form.parentId),
    categoryType: form.categoryType,
    direction: form.direction,
    affectsExpenseReport: form.affectsExpenseReport,
    affectsProjectReport: form.affectsProjectReport,
    requiresMerchant: form.requiresMerchant,
    requiresPerson: form.requiresPerson,
    requiresBorrower: form.requiresBorrower,
    isEnabled: form.isEnabled
  };
}
```

- [ ] **Step 4: Update MasterDataPage with current actor and reload**

Add state:

```ts
const [currentActorId, setCurrentActorId] = useState("");
const [reloadKey, setReloadKey] = useState(0);
```

Change the load effect dependency from `[]` to `[reloadKey]`. After loading snapshot:

```ts
setCurrentActorId((current) => current || response.data.people.find((person) => person.is_enabled)?.id || "");
```

Add this top section between the overview section and the tab section:

```tsx
<section className="panel master-data-actor-panel">
  <label>
    <span>当前操作人</span>
    <select value={currentActorId} onChange={(event) => setCurrentActorId(event.target.value)} required>
      <option value="">请选择操作人</option>
      {data.people
        .filter((person) => person.is_enabled)
        .map((person) => (
          <option key={person.id} value={person.id}>
            {person.name}
          </option>
        ))}
    </select>
  </label>
</section>
```

Pass `currentActorId` and `onChanged={() => setReloadKey((value) => value + 1)}` to all tabs.

- [ ] **Step 5: Add create forms inside each tab**

Each tab should render:

- Existing list.
- A compact create form above the list or in a simple panel section.
- Submit button disabled when actor is empty.
- On success, call `onChanged()`.
- On error, show message in `role="status"` line.

Use endpoints:

- People: `POST /api/master-data/people`
- Projects: `POST /api/master-data/projects`
- Merchants: `POST /api/master-data/merchants`
- Accounts: `POST /api/master-data/accounts`
- Currencies: `POST /api/master-data/currencies`
- Categories: `POST /api/master-data/categories`

- [ ] **Step 6: Run frontend checks**

Run:

```bash
npm test -- src/app/pages/master-data/masterDataModel.test.ts
npx tsc --noEmit
```

Expected: pass.

- [ ] **Step 7: Commit Task 9**

Run:

```bash
git add src/app/pages/MasterDataPage.tsx src/app/pages/master-data src/app/styles.css
git commit -m "feat: add master data create forms"
```

---

### Task 10: Edit, Status Changes, and Protected Field UX

**Files:**
- Modify: backend write handlers from Tasks 4 and 5
- Modify: all tab files
- Modify: tests

- [ ] **Step 1: Add failing PATCH tests**

In `tests/api/masterDataGovernance.test.ts`, add tests for:

```ts
it("archives projects through PATCH", async () => {
  const response = await updateMasterDataProject({
    request: new Request("https://ledger.test/api/master-data/projects/proj_1", {
      method: "PATCH",
      body: JSON.stringify({ actor: "person_admin", code: "P1", name: "Project One", ownerPersonId: null, status: "archived", note: null })
    }),
    env: writeMockEnv({ enabledPeople: ["person_admin"] }),
    params: { id: "proj_1" }
  });

  expect(response.status).toBe(200);
});

it("rejects protected account changes through PATCH", async () => {
  const response = await updateMasterDataAccount({
    request: new Request("https://ledger.test/api/master-data/accounts/acct_1", {
      method: "PATCH",
      body: JSON.stringify({ actor: "person_admin", name: "AED Reserve", accountType: "currency_reserve", currencyCode: "USD", ownerPersonId: null, isCompanyAccount: true, allowNegative: false, status: "active" })
    }),
    env: writeMockEnv({ enabledPeople: ["person_admin"], firstRows: [{ id: "person_admin" }, { referenceCount: 1, currency_code: "AED", account_type: "currency_reserve", is_company_account: 1, owner_person_id: null }] }),
    params: { id: "acct_1" }
  });

  expect(response.status).toBe(400);
});
```

- [ ] **Step 2: Run PATCH tests to verify RED**

Run:

```bash
npm test -- tests/api/masterDataGovernance.test.ts
```

Expected: fail because update handlers are incomplete or not routed.

- [ ] **Step 3: Complete PATCH handlers and routes**

Ensure all update handlers exist:

```ts
updateMasterDataPerson
updateMasterDataProject
updateMasterDataMerchant
updateMasterDataAccount
updateMasterDataCurrency
updateMasterDataCategory
```

Ensure all PATCH routes exist in `src/worker/router.ts`.

Every update handler must:

- Validate actor.
- Read current row when protected checks require it.
- Reject protected field changes after reference.
- Record audit with `before` and `after`.
- Return 200 with `{ data: updatedRow }`.

- [ ] **Step 4: Add edit/status controls to tabs**

For each row:

- Add `编辑` button.
- Add status button:
  - people/currencies/categories: `启用` or `停用`.
  - projects/merchants/accounts: `恢复` or `归档`.
- Disable protected fields in edit form when `referenceCount > 0`.
- Show text `已有引用，受保护字段不能修改`.

- [ ] **Step 5: Run checks**

Run:

```bash
npm test -- tests/api/masterDataGovernance.test.ts tests/api/masterDataGovernanceRepository.test.ts src/app/pages/master-data/masterDataModel.test.ts
npx tsc --noEmit
```

Expected: pass.

- [ ] **Step 6: Commit Task 10**

Run:

```bash
git add src/api/masterDataGovernance.ts src/repositories/masterDataGovernanceRepository.ts src/worker/router.ts tests/api/masterDataGovernance.test.ts tests/api/masterDataGovernanceRepository.test.ts src/app/pages/master-data src/app/pages/MasterDataPage.tsx
git commit -m "feat: add master data edit and status controls"
```

---

### Task 11: Document Entry Option Linkage Tests

**Files:**
- Modify: `tests/api/documentEntryOptions.test.ts`
- Modify: `tests/api/masterDataGovernance.test.ts`

- [ ] **Step 1: Add failing linkage test**

Add to `tests/api/documentEntryOptions.test.ts`:

```ts
it("excludes archived governance rows from document entry options", async () => {
  const response = await listDocumentEntryOptions({
    request: new Request("https://ledger.test/api/document-entry/options"),
    env: mockEnv({
      queues: [
        [{ id: "person_active", name: "Active", alias: null, roles_json: "[]", is_enabled: 1 }],
        [{ id: "proj_active", code: "P1", name: "Active Project", owner_person_id: null, status: "active" }],
        [{ id: "merchant_active", code: "M1", name: "Active Merchant", project_id: "proj_active", merchant_type: "site", status: "active" }],
        [{ id: "acct_active", name: "AED Reserve", account_type: "currency_reserve", currency_code: "AED", owner_person_id: null, is_company_account: 1, allow_negative: 0, status: "active" }],
        [{ code: "AED", name: "Dirham", minor_units: 2, is_enabled: 1 }],
        [{ id: "cat_active", name: "Expense", parent_id: null, category_type: "expense", direction: "out", affects_expense_report: 1, affects_project_report: 0, requires_merchant: 0, requires_person: 1, requires_borrower: 0, is_enabled: 1 }]
      ]
    }),
    params: {}
  });

  const body = (await response.json()) as { data: { people: unknown[]; projects: unknown[]; merchants: unknown[]; accounts: unknown[]; currencies: unknown[]; categories: unknown[] } };
  expect(body.data.people).toHaveLength(1);
  expect(body.data.projects).toHaveLength(1);
  expect(body.data.merchants).toHaveLength(1);
  expect(body.data.accounts).toHaveLength(1);
  expect(body.data.currencies).toHaveLength(1);
  expect(body.data.categories).toHaveLength(1);
});
```

- [ ] **Step 2: Run linkage tests**

Run:

```bash
npm test -- tests/api/documentEntryOptions.test.ts tests/api/masterDataGovernance.test.ts
```

Expected: pass if existing filters remain correct. If the test fails because helper shape differs, adjust only the test mock helper to match existing `documentEntryOptions.test.ts` structure.

- [ ] **Step 3: Add API governance smoke route test**

In `tests/api/masterDataGovernance.test.ts`, ensure the router covers:

```ts
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
    writeMockEnv({ enabledPeople: ["person_admin"], firstRows: [{ code: "AED", is_enabled: 1 }] })
  );

  expect(response.status).toBe(201);
});
```

- [ ] **Step 4: Run full API tests**

Run:

```bash
npm test -- tests/api/masterDataGovernance.test.ts tests/api/masterDataGovernanceRepository.test.ts tests/api/documentEntryOptions.test.ts tests/api/masterData.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit Task 11**

Run:

```bash
git add tests/api/documentEntryOptions.test.ts tests/api/masterDataGovernance.test.ts
git commit -m "test: cover master data document entry linkage"
```

---

### Task 12: Browser Verification and Final Hardening

**Files:**
- Modify only files needed to fix verification failures.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
npm run test
npx tsc --noEmit
npm run build
npm run db:migrate:local
git diff --check
```

Expected:

- Vitest passes all files.
- TypeScript exits 0.
- Vite build exits 0.
- Wrangler local migrations report success or no migrations to apply.
- `git diff --check` exits 0.

- [ ] **Step 2: Start or reuse local dev server**

If `http://localhost:8787/` is not already running, start:

```bash
npm run dev
```

Expected: local app available on port 8787 or the next available port shown by Wrangler.

- [ ] **Step 3: Browser smoke test**

In the in-app browser:

1. Open `http://localhost:8787/`.
2. Navigate to `基础资料`.
3. Confirm the page title is `基础资料治理中心`.
4. Confirm tabs are visible: `人员`, `项目`, `商户`, `账户`, `币种`, `管理科目`.
5. Select each tab and confirm a table appears.
6. Create a test person with role `finance_entry`.
7. Create a test project.
8. Create a test merchant under that project.
9. Create a test company account.
10. Create a test expense category.
11. Navigate to `业务单据`.
12. Confirm new active rows appear in relevant selects.

Do not create destructive test data in production. This smoke test is for local D1 only.

- [ ] **Step 4: Final code review**

Use a fresh code-review subagent to inspect:

- API contract and validation.
- Reference protection correctness.
- Audit log writes.
- Frontend state and reload flow.
- Document-entry option consistency.

Expected: no P0/P1 findings. Fix any real findings with TDD and commit.

- [ ] **Step 5: Final commit if verification fixes were needed**

If Step 4 required fixes:

```bash
git add src/api/masterDataGovernance.ts src/repositories/masterDataGovernanceRepository.ts src/worker/router.ts src/app/pages/MasterDataPage.tsx src/app/pages/master-data src/app/styles.css tests/api/masterDataGovernance.test.ts tests/api/masterDataGovernanceRepository.test.ts tests/api/documentEntryOptions.test.ts
git commit -m "fix: harden master data governance center"
```

If no fixes were needed, do not create an empty commit.

---

## Self-Review Checklist

- Spec coverage:
  - People, projects, merchants, accounts, currencies, categories are covered.
  - Reference protection is covered.
  - Audit logging is covered.
  - Document-entry option linkage is covered.
  - Browser verification is covered.
- Placeholder scan:
  - No task uses deferred implementation language.
  - Each task has concrete files, commands, and expected results.
- Type consistency:
  - Frontend payload builders use camelCase request bodies.
  - Backend repository maps to snake_case D1 columns.
  - Status values are `active`/`archived` for projects, merchants, accounts.
  - Enabled flags remain numeric in DB rows and boolean in form payloads.
