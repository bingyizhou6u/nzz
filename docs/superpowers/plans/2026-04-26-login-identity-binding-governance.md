# Login Identity Binding Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow administrators to manage `people.login_email` safely from the system while preserving the distinction between business-only people and login users.

**Architecture:** Keep Cloudflare Access as the authentication boundary and keep `people.login_email` as the internal identity binding. Extend the existing master-data governance repository, API, and People tab instead of adding a separate user module. Enforce permission-sensitive changes on the server, and mirror those capabilities in the frontend.

**Tech Stack:** TypeScript, Cloudflare Workers, D1 SQLite, React, Vite, Vitest, jsdom.

---

## File Structure

- Modify `src/repositories/masterDataGovernanceRepository.ts`
  - Add `loginEmail` to person write inputs.
  - Insert/update `people.login_email`.
  - Add a query helper for counting other enabled login admins.
- Modify `src/api/masterDataGovernance.ts`
  - Parse and normalize `loginEmail`.
  - Require `masterData.managePeopleRoles` when login email or roles change.
  - Guard against disabling self, clearing self login email, or removing the last login admin.
  - Convert duplicate login email constraint errors into a stable 400 response.
- Modify `src/app/pages/master-data/masterDataTypes.ts`
  - Add `login_email`, `access_subject`, and `last_login_at` to `PersonRow`.
  - Add `loginEmail` to `PersonForm`.
- Modify `src/app/pages/master-data/masterDataModel.ts`
  - Normalize login email for payloads.
  - Preserve existing login email when role-management permission is missing.
  - Add a login status helper for the People tab.
- Modify `src/app/pages/master-data/PeopleTab.tsx`
  - Render login email input.
  - Disable login email and role controls without `masterData.managePeopleRoles`.
  - Show login status and last login columns.
- Modify tests:
  - `tests/api/masterDataGovernanceRepository.test.ts`
  - `tests/api/masterDataGovernance.test.ts`
  - `src/app/pages/master-data/masterDataModel.test.ts`

---

### Task 1: Repository Persists Login Email and Counts Login Admins

**Files:**
- Modify: `src/repositories/masterDataGovernanceRepository.ts`
- Test: `tests/api/masterDataGovernanceRepository.test.ts`

- [ ] **Step 1: Write failing repository tests**

Add these tests inside `describe("MasterDataGovernanceRepository read model", ...)` or a new nearby describe block in `tests/api/masterDataGovernanceRepository.test.ts`:

```ts
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
```

- [ ] **Step 2: Run repository tests and verify RED**

Run:

```bash
npm test -- tests/api/masterDataGovernanceRepository.test.ts
```

Expected: fail because `CreatePersonInput` and `UpdatePersonInput` do not accept `loginEmail`, `updatePerson` does not persist it, and `countOtherEnabledLoginAdmins` does not exist.

- [ ] **Step 3: Implement repository support**

In `src/repositories/masterDataGovernanceRepository.ts`, update the person input interfaces:

```ts
export interface CreatePersonInput {
  name: string;
  alias: string | null;
  roles: PersonRole[];
  isEnabled: boolean;
  loginEmail: string | null;
}

export type UpdatePersonInput = CreatePersonInput;
```

Update `createPerson()` so the insert includes `login_email`:

```ts
async createPerson(input: CreatePersonInput): Promise<GovernancePersonRow> {
  const id = newId("person");
  const createdAt = nowIso();
  const rolesJson = JSON.stringify(input.roles);
  await run(
    this.db
      .prepare(
        `INSERT INTO people (id, name, alias, roles_json, is_enabled, created_at, login_email)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(id, input.name, input.alias, rolesJson, input.isEnabled ? 1 : 0, createdAt, input.loginEmail)
  );
  return {
    id,
    name: input.name,
    alias: input.alias,
    roles_json: rolesJson,
    is_enabled: input.isEnabled ? 1 : 0,
    login_email: input.loginEmail,
    access_subject: null,
    last_login_at: null,
    created_at: createdAt,
    referenceCount: 0
  };
}
```

Update `updatePerson()` so it writes `login_email`:

```ts
async updatePerson(id: string, input: UpdatePersonInput): Promise<GovernancePersonRow> {
  const existing = await this.getPerson(id);
  const rolesJson = JSON.stringify(input.roles);
  await run(
    this.db
      .prepare("UPDATE people SET name = ?, alias = ?, roles_json = ?, is_enabled = ?, login_email = ? WHERE id = ?")
      .bind(input.name, input.alias, rolesJson, input.isEnabled ? 1 : 0, input.loginEmail, id)
  );
  return {
    id,
    name: input.name,
    alias: input.alias,
    roles_json: rolesJson,
    is_enabled: input.isEnabled ? 1 : 0,
    login_email: input.loginEmail,
    access_subject: existing?.access_subject ?? null,
    last_login_at: existing?.last_login_at ?? null,
    created_at: existing?.created_at ?? nowIso(),
    referenceCount: existing?.referenceCount ?? 0
  };
}
```

Add this method to the repository class:

```ts
async countOtherEnabledLoginAdmins(personId: string): Promise<number> {
  const row = await first<{ count: number }>(
    this.db
      .prepare(
        `SELECT COUNT(*) AS count
         FROM people
         WHERE id != ?
           AND is_enabled = 1
           AND login_email IS NOT NULL
           AND trim(login_email) != ''
           AND EXISTS (
             SELECT 1 FROM json_each(people.roles_json)
             WHERE json_each.value = 'admin'
           )`
      )
      .bind(personId)
  );
  return row?.count ?? 0;
}
```

- [ ] **Step 4: Run repository tests and verify GREEN**

Run:

```bash
npm test -- tests/api/masterDataGovernanceRepository.test.ts
```

Expected: all tests in this file pass.

- [ ] **Step 5: Commit Task 1**

Run:

```bash
git add src/repositories/masterDataGovernanceRepository.ts tests/api/masterDataGovernanceRepository.test.ts
git commit -m "feat: persist people login emails"
```

---

### Task 2: API Enforces Login Email Permission and Lockout Guards

**Files:**
- Modify: `src/api/masterDataGovernance.ts`
- Test: `tests/api/masterDataGovernance.test.ts`

- [ ] **Step 1: Write failing API tests**

Add these tests inside `describe("master data governance write API", ...)` in `tests/api/masterDataGovernance.test.ts`:

```ts
it("creates people with normalized login email", async () => {
  const runBindings: unknown[][] = [];
  const response = await createMasterDataPerson({
    request: new Request("https://ledger.test/api/master-data/people", {
      method: "POST",
      body: JSON.stringify({
        name: "Login Admin",
        alias: null,
        roles: ["admin"],
        loginEmail: "  New.Admin@Example.COM  ",
        isEnabled: true
      })
    }),
    env: writeMockEnv({ onRunBindings: (values) => runBindings.push(values) }),
    params: {},
    actor: adminActor
  });

  expect(response.status).toBe(201);
  const body = (await response.json()) as { data: { login_email: string } };
  expect(body.data.login_email).toBe("new.admin@example.com");
  expect(runBindings.flat()).toContain("new.admin@example.com");
});

it("rejects login email changes without people role management permission", async () => {
  const existingPerson = {
    id: "person_target",
    name: "Target",
    alias: "old",
    roles_json: "[\"finance_entry\"]",
    is_enabled: 1,
    login_email: "target@example.com",
    access_subject: null,
    last_login_at: null,
    created_at: "2026-04-25T00:00:00.000Z",
    referenceCount: 0
  };

  const response = await updateMasterDataPerson({
    request: new Request("https://ledger.test/api/master-data/people/person_target", {
      method: "PATCH",
      body: JSON.stringify({
        name: "Target",
        alias: "old",
        roles: ["finance_entry"],
        loginEmail: "changed@example.com",
        isEnabled: true
      })
    }),
    env: writeMockEnv({ firstRows: [existingPerson] }),
    params: { id: "person_target" },
    actor: financeManagerActor
  });

  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toEqual({ error: "权限不足" });
});

it("lets master data writers update person fields when login email and roles are retained", async () => {
  const existingPerson = {
    id: "person_entry",
    name: "Entry",
    alias: "old",
    roles_json: "[\"finance_entry\"]",
    is_enabled: 1,
    login_email: "entry@example.com",
    access_subject: null,
    last_login_at: null,
    created_at: "2026-04-25T00:00:00.000Z",
    referenceCount: 0
  };

  const response = await updateMasterDataPerson({
    request: new Request("https://ledger.test/api/master-data/people/person_entry", {
      method: "PATCH",
      body: JSON.stringify({
        name: "Entry Renamed",
        alias: "new",
        roles: ["finance_entry"],
        loginEmail: "entry@example.com",
        isEnabled: false
      })
    }),
    env: writeMockEnv({ firstRows: [existingPerson, existingPerson] }),
    params: { id: "person_entry" },
    actor: financeManagerActor
  });

  expect(response.status).toBe(200);
});

it("rejects clearing the current actor login email", async () => {
  const existingAdmin = {
    id: "person_admin",
    name: "Admin",
    alias: null,
    roles_json: "[\"admin\"]",
    is_enabled: 1,
    login_email: "admin@example.com",
    access_subject: null,
    last_login_at: null,
    created_at: "2026-04-25T00:00:00.000Z",
    referenceCount: 0
  };

  const response = await updateMasterDataPerson({
    request: new Request("https://ledger.test/api/master-data/people/person_admin", {
      method: "PATCH",
      body: JSON.stringify({
        name: "Admin",
        alias: null,
        roles: ["admin"],
        loginEmail: "",
        isEnabled: true
      })
    }),
    env: writeMockEnv({ firstRows: [existingAdmin] }),
    params: { id: "person_admin" },
    actor: adminActor
  });

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: "不能清空当前登录人的登录邮箱" });
});

it("rejects disabling the current actor", async () => {
  const existingAdmin = {
    id: "person_admin",
    name: "Admin",
    alias: null,
    roles_json: "[\"admin\"]",
    is_enabled: 1,
    login_email: "admin@example.com",
    access_subject: null,
    last_login_at: null,
    created_at: "2026-04-25T00:00:00.000Z",
    referenceCount: 0
  };

  const response = await updateMasterDataPerson({
    request: new Request("https://ledger.test/api/master-data/people/person_admin", {
      method: "PATCH",
      body: JSON.stringify({
        name: "Admin",
        alias: null,
        roles: ["admin"],
        loginEmail: "admin@example.com",
        isEnabled: false
      })
    }),
    env: writeMockEnv({ firstRows: [existingAdmin] }),
    params: { id: "person_admin" },
    actor: adminActor
  });

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: "不能停用当前登录人" });
});

it("rejects removing the last enabled login admin", async () => {
  const existingAdmin = {
    id: "person_admin_target",
    name: "Admin Target",
    alias: null,
    roles_json: "[\"admin\"]",
    is_enabled: 1,
    login_email: "target@example.com",
    access_subject: null,
    last_login_at: null,
    created_at: "2026-04-25T00:00:00.000Z",
    referenceCount: 0
  };

  const response = await updateMasterDataPerson({
    request: new Request("https://ledger.test/api/master-data/people/person_admin_target", {
      method: "PATCH",
      body: JSON.stringify({
        name: "Admin Target",
        alias: null,
        roles: ["finance_manager"],
        loginEmail: "target@example.com",
        isEnabled: true
      })
    }),
    env: writeMockEnv({ firstRows: [existingAdmin, { count: 0 }] }),
    params: { id: "person_admin_target" },
    actor: adminActor
  });

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: "系统至少需要保留一个可登录管理员" });
});

it("returns a stable error for duplicate login email", async () => {
  const response = await createMasterDataPerson({
    request: new Request("https://ledger.test/api/master-data/people", {
      method: "POST",
      body: JSON.stringify({
        name: "Duplicate",
        alias: null,
        roles: ["finance_entry"],
        loginEmail: "used@example.com",
        isEnabled: true
      })
    }),
    env: writeMockEnv({
      onRunBindings: () => {
        throw new Error("D1_ERROR: UNIQUE constraint failed: index 'idx_people_login_email'");
      }
    }),
    params: {},
    actor: adminActor
  });

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: "登录邮箱已绑定其他人员" });
});
```

Update existing person-update tests that intentionally retain login identity so the body includes `loginEmail` equal to the existing row.

- [ ] **Step 2: Run API tests and verify RED**

Run:

```bash
npm test -- tests/api/masterDataGovernance.test.ts
```

Expected: fail because API parsing, permission checks, lockout guards, and duplicate-email error conversion are not implemented.

- [ ] **Step 3: Implement API parsing helpers**

In `src/api/masterDataGovernance.ts`, add these helpers near `optionalText()`:

```ts
function loginEmail(body: Record<string, unknown>): string | null {
  const value = body.loginEmail;
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) return null;
  const [local, domain, extra] = trimmed.split("@");
  if (!local || !domain || extra !== undefined) throw new Error("登录邮箱格式无效");
  return trimmed;
}

function loginEmailsDiffer(before: string | null, after: string | null) {
  return (before ?? "").trim().toLowerCase() !== (after ?? "").trim().toLowerCase();
}

function hasLoginEmail(value: string | null) {
  return Boolean(value?.trim());
}

function isLoginAdmin(input: { is_enabled: number; login_email: string | null; roles_json: string }) {
  return input.is_enabled === 1 && hasLoginEmail(input.login_email) && rolesFromJson(input.roles_json).includes("admin");
}

function requestedLoginAdmin(input: { isEnabled: boolean; loginEmail: string | null; roles: PersonRole[] }) {
  return input.isEnabled && hasLoginEmail(input.loginEmail) && input.roles.includes("admin");
}
```

- [ ] **Step 4: Implement person input and guards**

In `createMasterDataPerson`, compute the normalized login email and pass it to the repository:

```ts
const roles = personRoles(body);
const normalizedLoginEmail = loginEmail(body);
assertCanManageRoleChanges(actor, [], roles);
if (normalizedLoginEmail) assertCan(actor, "masterData.managePeopleRoles");
const person = await repository.createPerson({
  name: requiredText(body, "name"),
  alias: optionalText(body, "alias"),
  roles,
  isEnabled: booleanField(body, "isEnabled", true),
  loginEmail: normalizedLoginEmail
});
```

In `updateMasterDataPerson`, build one input object and apply identity guards before updating:

```ts
const roles = personRoles(body);
const normalizedLoginEmail = loginEmail(body);
const input = {
  name: requiredText(body, "name"),
  alias: optionalText(body, "alias"),
  roles,
  isEnabled: booleanField(body, "isEnabled", true),
  loginEmail: normalizedLoginEmail
};
assertCanManageRoleChanges(actor, rolesFromJson(before.roles_json), roles);
if (loginEmailsDiffer(before.login_email, input.loginEmail)) {
  assertCan(actor, "masterData.managePeopleRoles");
}
await assertPersonIdentityUpdateAllowed(repository, actor, before, input);
const person = await repository.updatePerson(id, input);
```

Add this helper near `assertCanManageRoleChanges()`:

```ts
async function assertPersonIdentityUpdateAllowed(
  repository: MasterDataGovernanceRepository,
  actor: AuthenticatedActor,
  before: { id: string; is_enabled: number; login_email: string | null; roles_json: string },
  after: { isEnabled: boolean; loginEmail: string | null; roles: PersonRole[] }
) {
  if (before.id === actor.personId && !after.isEnabled) {
    throw new Error("不能停用当前登录人");
  }
  if (before.id === actor.personId && hasLoginEmail(before.login_email) && !hasLoginEmail(after.loginEmail)) {
    throw new Error("不能清空当前登录人的登录邮箱");
  }
  if (isLoginAdmin(before) && !requestedLoginAdmin(after)) {
    const otherAdmins = await repository.countOtherEnabledLoginAdmins(before.id);
    if (otherAdmins === 0) throw new Error("系统至少需要保留一个可登录管理员");
  }
}
```

Update `errorMessage()` to convert duplicate login email errors:

```ts
function errorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed";
  if (message.toLowerCase().includes("idx_people_login_email") || message.toLowerCase().includes("unique constraint")) {
    return "登录邮箱已绑定其他人员";
  }
  return message;
}
```

- [ ] **Step 5: Run API tests and verify GREEN**

Run:

```bash
npm test -- tests/api/masterDataGovernance.test.ts tests/api/masterDataGovernanceRepository.test.ts
```

Expected: both files pass.

- [ ] **Step 6: Commit Task 2**

Run:

```bash
git add src/api/masterDataGovernance.ts tests/api/masterDataGovernance.test.ts
git commit -m "feat: enforce login identity governance"
```

---

### Task 3: Frontend Model Handles Login Email and Status

**Files:**
- Modify: `src/app/pages/master-data/masterDataTypes.ts`
- Modify: `src/app/pages/master-data/masterDataModel.ts`
- Test: `src/app/pages/master-data/masterDataModel.test.ts`

- [ ] **Step 1: Write failing frontend model tests**

Add these tests to `describe("master data model", ...)`:

```ts
it("builds people payloads with normalized login email", () => {
  expect(
    buildPersonPayload({
      name: " Alice ",
      alias: " ali ",
      roles: ["admin"],
      loginEmail: "  Alice@Example.COM  ",
      isEnabled: true
    })
  ).toEqual({
    name: "Alice",
    alias: "ali",
    roles: ["admin"],
    loginEmail: "alice@example.com",
    isEnabled: true
  });
});

it("preserves existing person roles and login email without role management permission", () => {
  expect(
    personFormWithPermittedIdentity(
      { name: "Alice", alias: "", roles: ["finance_entry"], loginEmail: "changed@example.com", isEnabled: true },
      { roles: ["admin"], loginEmail: "admin@example.com" },
      false
    )
  ).toEqual({
    name: "Alice",
    alias: "",
    roles: ["admin"],
    loginEmail: "admin@example.com",
    isEnabled: true
  });
});

it("derives person login statuses", () => {
  expect(personLoginStatus({ is_enabled: 1, login_email: "admin@example.com" })).toEqual({
    label: "可登录",
    tone: "ok"
  });
  expect(personLoginStatus({ is_enabled: 1, login_email: null })).toEqual({
    label: "未绑定邮箱，不可登录",
    tone: "warning"
  });
  expect(personLoginStatus({ is_enabled: 0, login_email: "old@example.com" })).toEqual({
    label: "已停用，不可登录",
    tone: "muted"
  });
});
```

Update the import list in the test:

```ts
import {
  accountTypeLabels,
  buildAccountPayload,
  buildCategoryPayload,
  buildCurrencyPayload,
  buildMerchantPayload,
  buildPersonPayload,
  buildProjectPayload,
  canManagePeopleRoleAssignments,
  canWriteMasterData,
  categoryTypeLabels,
  isProtectedFieldDisabled,
  normalizeCode,
  personFormWithPermittedIdentity,
  personFormWithPermittedRoles,
  personLoginStatus,
  parseRoles
} from "./masterDataModel";
```

- [ ] **Step 2: Run frontend model tests and verify RED**

Run:

```bash
npm test -- src/app/pages/master-data/masterDataModel.test.ts
```

Expected: fail because `PersonForm` has no `loginEmail`, and the new helpers do not exist.

- [ ] **Step 3: Implement frontend types and model helpers**

In `src/app/pages/master-data/masterDataTypes.ts`, update `PersonRow` and `PersonForm`:

```ts
export interface PersonRow extends ReferencedRow {
  id: string;
  name: string;
  alias: string | null;
  roles_json: string;
  is_enabled: number;
  login_email: string | null;
  access_subject: string | null;
  last_login_at: string | null;
  created_at: string;
}

export interface PersonForm {
  name: string;
  alias: string;
  roles: PersonRole[];
  loginEmail: string;
  isEnabled: boolean;
}
```

In `src/app/pages/master-data/masterDataModel.ts`, add helpers:

```ts
function normalizedEmail(value: string) {
  return nullableText(value)?.toLowerCase() ?? null;
}

export function buildPersonPayload(form: PersonForm): Record<string, unknown> {
  return {
    name: form.name.trim(),
    alias: nullableText(form.alias),
    roles: form.roles,
    loginEmail: normalizedEmail(form.loginEmail),
    isEnabled: form.isEnabled
  };
}

export function personFormWithPermittedIdentity(
  form: PersonForm,
  existing: { roles: PersonRole[]; loginEmail: string } | null,
  canManagePeopleRoles: boolean
): PersonForm {
  if (canManagePeopleRoles || !existing) return form;
  return { ...form, roles: existing.roles, loginEmail: existing.loginEmail };
}

export function personFormWithPermittedRoles(
  form: PersonForm,
  existingRoles: PersonRole[] | null,
  canManagePeopleRoles: boolean
): PersonForm {
  return personFormWithPermittedIdentity(
    form,
    existingRoles ? { roles: existingRoles, loginEmail: form.loginEmail } : null,
    canManagePeopleRoles
  );
}

export function personLoginStatus(row: { is_enabled: number; login_email: string | null }) {
  if (!row.is_enabled) return { label: "已停用，不可登录", tone: "muted" as const };
  if (!row.login_email?.trim()) return { label: "未绑定邮箱，不可登录", tone: "warning" as const };
  return { label: "可登录", tone: "ok" as const };
}
```

Update existing test helper `personRow()` in `masterDataModel.test.ts` to include:

```ts
login_email: "admin@example.com",
access_subject: null,
last_login_at: "2026-04-25T10:30:00Z",
```

Update existing `PersonForm` literals in tests to include `loginEmail: ""` for empty forms and `loginEmail: "admin@example.com"` for the admin person fixture.

- [ ] **Step 4: Run frontend model tests and verify GREEN**

Run:

```bash
npm test -- src/app/pages/master-data/masterDataModel.test.ts
```

Expected: this file passes.

- [ ] **Step 5: Commit Task 3**

Run:

```bash
git add src/app/pages/master-data/masterDataTypes.ts src/app/pages/master-data/masterDataModel.ts src/app/pages/master-data/masterDataModel.test.ts
git commit -m "feat: model people login identity fields"
```

---

### Task 4: People Tab Displays and Edits Login Identity

**Files:**
- Modify: `src/app/pages/master-data/PeopleTab.tsx`
- Test: `src/app/pages/master-data/masterDataModel.test.ts`

- [ ] **Step 1: Write failing People tab tests**

Add these tests inside `describe("master data capability gating", ...)` in `src/app/pages/master-data/masterDataModel.test.ts`:

```ts
it("disables login email controls without manage people roles capability", async () => {
  const fetchMock = vi.fn<FetchHandler>().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);

  const container = await renderPeopleTab({ canWrite: true, canManagePeopleRoles: false });

  await act(async () => {
    buttonByText(container, "编辑").click();
  });

  const loginEmail = inputByLabel(container, "登录邮箱");
  expect(loginEmail.disabled).toBe(true);

  await act(async () => {
    setInputValue(loginEmail, "changed@example.com");
    setInputValue(inputByLabel(container, "姓名"), "Alice Updated");
  });

  await act(async () => {
    buttonByText(container, "保存人员").click();
    await Promise.resolve();
  });

  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
    name: "Alice Updated",
    roles: ["admin"],
    loginEmail: "admin@example.com"
  });
});

it("allows login email edits with manage people roles capability", async () => {
  const fetchMock = vi.fn<FetchHandler>().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal("fetch", fetchMock);

  const container = await renderPeopleTab({ canWrite: true, canManagePeopleRoles: true });

  await act(async () => {
    buttonByText(container, "编辑").click();
  });

  const loginEmail = inputByLabel(container, "登录邮箱");
  expect(loginEmail.disabled).toBe(false);

  await act(async () => {
    setInputValue(loginEmail, "  Changed@Example.COM  ");
  });

  await act(async () => {
    buttonByText(container, "保存人员").click();
    await Promise.resolve();
  });

  expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
    loginEmail: "changed@example.com"
  });
});

it("renders login email status and last login columns", async () => {
  const container = await renderPeopleTab({ canWrite: true, canManagePeopleRoles: true });

  expect(container.textContent).toContain("admin@example.com");
  expect(container.textContent).toContain("可登录");
  expect(container.textContent).toContain("2026-04-25T10:30:00Z");
});
```

- [ ] **Step 2: Run People tab tests and verify RED**

Run:

```bash
npm test -- src/app/pages/master-data/masterDataModel.test.ts
```

Expected: fail because People tab does not render a login email input or login status columns.

- [ ] **Step 3: Implement People tab changes**

In `src/app/pages/master-data/PeopleTab.tsx`, update imports:

```ts
import {
  buildPersonPayload,
  parseRoles,
  personFormWithPermittedIdentity,
  personLoginStatus,
  personRoleLabels,
  personRoles
} from "./masterDataModel";
```

Update `emptyForm`:

```ts
const emptyForm: PersonForm = { name: "", alias: "", roles: ["finance_entry"], loginEmail: "", isEnabled: true };
```

Update `rowToForm()`:

```ts
function rowToForm(row: PersonRow): PersonForm {
  return {
    name: row.name,
    alias: row.alias ?? "",
    roles: parseRoles(row.roles_json),
    loginEmail: row.login_email ?? "",
    isEnabled: Boolean(row.is_enabled)
  };
}
```

Update submit payload construction:

```ts
const existingIdentity = editingRow
  ? { roles: parseRoles(editingRow.roles_json), loginEmail: editingRow.login_email ?? "" }
  : null;
await writeMasterData(
  url,
  editingRow ? "PATCH" : "POST",
  buildPersonPayload(personFormWithPermittedIdentity(form, existingIdentity, canManagePeopleRoles))
);
```

Add the login email field after alias:

```tsx
<label>
  登录邮箱
  <input
    value={form.loginEmail}
    onChange={(event) => setForm((current) => ({ ...current, loginEmail: event.target.value }))}
    disabled={!canManagePeopleRoles}
  />
</label>
```

Update the hint:

```tsx
{canWrite && !canManagePeopleRoles ? (
  <FieldHint>{editingRow ? "角色和登录邮箱仅可查看，保存时会保留原值。" : "创建人员需要人员角色管理权限。"}</FieldHint>
) : null}
```

Add table columns before status:

```tsx
{
  key: "loginEmail",
  header: "登录邮箱",
  render: (row) => row.login_email || "未绑定"
},
{
  key: "loginStatus",
  header: "登录状态",
  render: (row) => {
    const status = personLoginStatus(row);
    return <span className={`tag ${status.tone}`}>{status.label}</span>;
  }
},
{
  key: "lastLogin",
  header: "最近登录",
  render: (row) => row.last_login_at || "无"
},
```

- [ ] **Step 4: Run People tab tests and verify GREEN**

Run:

```bash
npm test -- src/app/pages/master-data/masterDataModel.test.ts
```

Expected: this file passes.

- [ ] **Step 5: Commit Task 4**

Run:

```bash
git add src/app/pages/master-data/PeopleTab.tsx src/app/pages/master-data/masterDataModel.test.ts
git commit -m "feat: manage login identity in people tab"
```

---

### Task 5: Full Verification

**Files:**
- No source edits unless verification finds a defect.

- [ ] **Step 1: Run focused permission and identity tests**

Run:

```bash
npm test -- tests/auth tests/api/masterDataGovernanceRepository.test.ts tests/api/masterDataGovernance.test.ts src/app/pages/master-data/masterDataModel.test.ts
```

Expected: all selected files pass.

- [ ] **Step 2: Run full test suite**

Run:

```bash
npm test
```

Expected: all test files pass.

- [ ] **Step 3: Run TypeScript check**

Run:

```bash
npx tsc --noEmit
```

Expected: exit code 0.

- [ ] **Step 4: Run production build**

Run:

```bash
npm run build
```

Expected: Vite build exits 0 and writes `dist/client`.

- [ ] **Step 5: Inspect git status**

Run:

```bash
git status --short
```

Expected: clean working tree after Task 4 commit, or only intentional verification artifacts in ignored paths.

---

## Self-Review

- Spec coverage: Tasks 1 and 2 cover `login_email` persistence, normalization, permission enforcement, duplicate email handling, and lockout guards. Tasks 3 and 4 cover frontend types, payloads, disabled controls, login status display, and last-login display. Task 5 covers full verification.
- Placeholder scan: The plan contains concrete file paths, commands, expected outcomes, and code snippets for each code-writing step.
- Type consistency: The plan consistently uses `loginEmail` at API/UI boundaries and `login_email` for D1 rows.
