# Identity Permissions Review Center Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add trusted Cloudflare Access identity, internal RBAC authorization, a formal review center, and period-lock management without changing existing posting or report accounting rules.

**Architecture:** Cloudflare Access authenticates the request; the Worker validates the Access JWT and maps the email to an enabled `people` row. API handlers receive an `AuthenticatedActor` and authorize named capabilities before calling existing services. Review center APIs reuse `DocumentService` validation and planning logic, while period-lock APIs wrap the existing `period_locks` table with audit logging.

**Tech Stack:** Cloudflare Workers, D1, TypeScript, React, Vite, Vitest, `jose` for Access JWT verification, native HTML form controls.

---

## Source Documents

- Design spec: `docs/superpowers/specs/2026-04-25-identity-permissions-review-center-design.md`
- Overall system spec: `docs/superpowers/specs/2026-04-24-management-ledger-formal-system-design.md`
- Existing router: `src/worker/router.ts`
- Existing Worker env types: `src/worker/env.ts`
- Existing document API: `src/api/documents.ts`
- Existing document service: `src/services/documentService.ts`
- Existing document repository: `src/repositories/documentRepository.ts`
- Existing master-data API: `src/api/masterDataGovernance.ts`
- Existing audit repository: `src/repositories/auditLogRepository.ts`
- Existing document page: `src/app/pages/DocumentsPage.tsx`
- Existing master data page: `src/app/pages/MasterDataPage.tsx`
- Existing app shell: `src/app/App.tsx`
- Existing report page: `src/app/pages/ReportsPage.tsx`
- Cloudflare Access JWT docs: `https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/`

## File Structure

Create:

- `migrations/0007_identity_permissions_review.sql` - login identity fields, audit metadata fields, and useful indexes.
- `src/auth/types.ts` - `AuthenticatedIdentity`, `AuthenticatedActor`, roles, capabilities, and auth errors.
- `src/auth/access.ts` - Cloudflare Access JWT verification and dev identity fallback.
- `src/auth/actorRepository.ts` - D1 lookup from login email to enabled `people` row.
- `src/auth/permissions.ts` - role-to-capability matrix and resource authorization helpers.
- `src/auth/authenticate.ts` - request-level authentication and actor resolution.
- `src/api/me.ts` - `GET /api/me`.
- `src/repositories/periodLockRepository.ts` - list, lock, unlock period rows.
- `src/api/periodLocks.ts` - lock-management handlers.
- `src/api/review.ts` - review queue, detail, preview, approve, reject handlers.
- `src/repositories/reviewRepository.ts` - review queue/detail read models.
- `src/app/session/sessionTypes.ts` - frontend session and capability types.
- `src/app/session/sessionApi.ts` - `/api/me` client.
- `src/app/session/sessionModel.ts` - capability helpers and labels.
- `src/app/pages/ReviewCenterPage.tsx` - review queue/detail/preview page.
- `src/app/pages/PeriodLocksPage.tsx` - period lock management page.
- `src/app/pages/review/reviewTypes.ts` - review frontend row/detail/preview types.
- `src/app/pages/review/reviewApi.ts` - review API client.
- `src/app/pages/review/reviewModel.ts` - review labels and preview grouping.
- `src/app/pages/period-locks/periodLockTypes.ts` - period lock frontend types.
- `src/app/pages/period-locks/periodLockApi.ts` - period lock API client.
- `tests/auth/access.test.ts`
- `tests/auth/actorRepository.test.ts`
- `tests/auth/permissions.test.ts`
- `tests/api/me.test.ts`
- `tests/api/review.test.ts`
- `tests/api/periodLocks.test.ts`
- `src/app/session/sessionModel.test.ts`
- `src/app/pages/review/reviewModel.test.ts`
- `src/app/pages/ReviewCenterPage.test.ts`
- `src/app/pages/PeriodLocksPage.test.ts`

Modify:

- `package.json` and lockfile - add `jose`.
- `wrangler.jsonc` - add non-secret Access configuration variable names and local development auth mode.
- `src/worker/env.ts` - add auth env vars and `actor` on request context.
- `src/worker/router.ts` - support route auth metadata, `/api/me`, `/api/review/*`, `/api/period-locks`.
- `src/api/documents.ts` - use authenticated actor for create/submit/approve/reject.
- `src/api/masterDataGovernance.ts` - use authenticated actor for write APIs and role checks.
- `src/repositories/masterDataGovernanceRepository.ts` - read/write `login_email` and protect admin role edits.
- `src/services/documentService.ts` - expose dry-run approval preview and accept actor from auth context.
- `src/repositories/documentRepository.ts` - add review queue/detail read helpers if not placed in `reviewRepository`.
- `src/repositories/auditLogRepository.ts` - accept actor email/request metadata fields.
- `src/app/App.tsx` - load session, show identity, route navigation by capability.
- `src/app/api.ts` - preserve JSON error behavior for 401/403/409.
- `src/app/pages/DocumentsPage.tsx` - remove production current-actor selector and use session actor.
- `src/app/pages/MasterDataPage.tsx` - remove production current-actor selector and gate writes by capability.
- `src/app/styles.css` - add session bar, review center, and period-lock styles.
- Existing API and frontend tests that still pass actor body values - update expectations to authenticated actor.
- `docs/deployment.md` - document Access application AUD/team domain configuration.

Do not modify in this phase:

- Core posting math in `src/domain/posting.ts`.
- FIFO allocation math in `src/domain/fifoEffects.ts`.
- Loan allocation math in `src/domain/loanEffects.ts`.
- Report SQL output semantics.
- Existing approved document data.

## Shared Decisions

- Production auth source is Cloudflare Access JWT from `Cf-Access-Jwt-Assertion`.
- The Worker validates JWT signature, issuer, audience, and expiration before trusting email.
- Development auth source is an explicit local fallback configured by env, never automatic in production.
- `people.login_email` maps Access email to internal person.
- `borrower` remains a business role and does not grant write permissions by itself.
- Existing body fields `createdBy`, `actor`, and `reviewer` are ignored in authenticated production requests. During transition, if provided and different from authenticated actor, handlers return 403.
- `audit_logs.actor` remains populated with `people.id`; new audit metadata stores email/request context.
- Review preview must reuse the same document validation and planning logic as approval and must not write business effects.
- Period unlock requires a reason.

## Capability Names

Use these strings exactly in tests and frontend capability checks:

```ts
export const capabilities = [
  "session.view",
  "documents.view",
  "documents.create",
  "documents.submit",
  "documents.approve",
  "documents.reject",
  "documents.previewApproval",
  "masterData.view",
  "masterData.write",
  "masterData.managePeopleRoles",
  "reports.view",
  "periodLocks.view",
  "periodLocks.lock",
  "periodLocks.unlock"
] as const;
```

Role mapping:

```ts
const roleCapabilities = {
  admin: [
    "session.view",
    "documents.view",
    "documents.create",
    "documents.submit",
    "documents.approve",
    "documents.reject",
    "documents.previewApproval",
    "masterData.view",
    "masterData.write",
    "masterData.managePeopleRoles",
    "reports.view",
    "periodLocks.view",
    "periodLocks.lock",
    "periodLocks.unlock"
  ],
  finance_manager: [
    "session.view",
    "documents.view",
    "documents.create",
    "documents.submit",
    "documents.approve",
    "documents.reject",
    "documents.previewApproval",
    "masterData.view",
    "masterData.write",
    "reports.view",
    "periodLocks.view",
    "periodLocks.lock"
  ],
  finance_entry: [
    "session.view",
    "documents.view",
    "documents.create",
    "documents.submit",
    "masterData.view",
    "reports.view"
  ],
  logistics: [
    "session.view",
    "documents.view",
    "documents.create",
    "documents.submit",
    "reports.view"
  ],
  readonly: ["session.view", "documents.view", "masterData.view", "reports.view"],
  borrower: ["session.view"]
} as const;
```

---

### Task 1: Identity Schema and Dependency Baseline

**Files:**
- Create: `migrations/0007_identity_permissions_review.sql`
- Modify: `package.json`
- Modify: lockfile if present
- Modify: `wrangler.jsonc`
- Test: `tests/api/masterDataGovernanceRepository.test.ts`

- [ ] **Step 1: Write failing repository tests for login email fields**

Add tests to `tests/api/masterDataGovernanceRepository.test.ts`:

```ts
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
```

- [ ] **Step 2: Run RED test**

Run:

```bash
npm test -- tests/api/masterDataGovernanceRepository.test.ts
```

Expected: fail because person select SQL does not include login identity fields.

- [ ] **Step 3: Add migration**

Create `migrations/0007_identity_permissions_review.sql`:

```sql
PRAGMA foreign_keys = ON;

ALTER TABLE people ADD COLUMN login_email TEXT;
ALTER TABLE people ADD COLUMN access_subject TEXT;
ALTER TABLE people ADD COLUMN last_login_at TEXT;

CREATE UNIQUE INDEX idx_people_login_email
  ON people(login_email)
  WHERE login_email IS NOT NULL;

ALTER TABLE audit_logs ADD COLUMN actor_person_id TEXT;
ALTER TABLE audit_logs ADD COLUMN actor_email TEXT;
ALTER TABLE audit_logs ADD COLUMN request_id TEXT;
ALTER TABLE audit_logs ADD COLUMN ip_address TEXT;
ALTER TABLE audit_logs ADD COLUMN user_agent TEXT;

CREATE INDEX idx_documents_status_submitted_at
  ON documents(status, submitted_at);

CREATE INDEX idx_audit_logs_actor_person_id
  ON audit_logs(actor_person_id, created_at);
```

- [ ] **Step 4: Add `jose` dependency**

Run after user approval for dependency installation during implementation:

```bash
npm install jose
```

Expected: `package.json` contains `"jose"` in dependencies and lockfile updates if present.

- [ ] **Step 5: Add Wrangler auth vars**

Modify `wrangler.jsonc`:

```jsonc
"vars": {
  // For local development, set AUTH_MODE=development and DEV_ACTOR_EMAIL in .dev.vars or wrangler dev env.
  "AUTH_MODE": "access",
  "CF_ACCESS_TEAM_DOMAIN": "",
  "CF_ACCESS_AUD": "",
  "DEV_ACTOR_EMAIL": ""
}
```

Production deployment must override the empty Access settings:

```text
AUTH_MODE=access
CF_ACCESS_TEAM_DOMAIN=https://<team-name>.cloudflareaccess.com
CF_ACCESS_AUD=<Application Audience AUD tag>
```

Local development may use `.dev.vars` or `wrangler dev` environment variables:

```text
AUTH_MODE=development
DEV_ACTOR_EMAIL=<local mapped people.login_email>
```

- [ ] **Step 6: Extend people read model**

Modify person row interfaces and person select SQL in `src/repositories/masterDataGovernanceRepository.ts` to include:

```ts
login_email: string | null;
access_subject: string | null;
last_login_at: string | null;
```

Update both `listPeople()` and `personSelectSql()`.

- [ ] **Step 7: Run GREEN test**

Run:

```bash
npm test -- tests/api/masterDataGovernanceRepository.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json wrangler.jsonc migrations/0007_identity_permissions_review.sql src/repositories/masterDataGovernanceRepository.ts tests/api/masterDataGovernanceRepository.test.ts
git commit -m "feat: add identity schema baseline"
```

---

### Task 2: Access Authentication and Actor Resolution

**Files:**
- Create: `src/auth/types.ts`
- Create: `src/auth/access.ts`
- Create: `src/auth/actorRepository.ts`
- Create: `src/auth/authenticate.ts`
- Modify: `src/worker/env.ts`
- Test: `tests/auth/access.test.ts`
- Test: `tests/auth/actorRepository.test.ts`

- [ ] **Step 1: Write failing Access auth tests**

Create `tests/auth/access.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { authenticateAccessIdentity, AuthError } from "../../src/auth/access";
import type { Env } from "../../src/worker/env";

const baseEnv = {
  AUTH_MODE: "development",
  DEV_ACTOR_EMAIL: "finance@example.test",
  CF_ACCESS_TEAM_DOMAIN: "https://team.cloudflareaccess.com",
  CF_ACCESS_AUD: "aud_1"
} as Env;

describe("authenticateAccessIdentity", () => {
  it("uses explicit development actor email in development mode", async () => {
    await expect(authenticateAccessIdentity(new Request("https://ledger.test"), baseEnv)).resolves.toEqual({
      email: "finance@example.test",
      accessSubject: null,
      accessIssuer: "development",
      accessAudience: ["development"]
    });
  });

  it("rejects production requests without Access JWT", async () => {
    await expect(
      authenticateAccessIdentity(new Request("https://ledger.test"), { ...baseEnv, AUTH_MODE: "access" })
    ).rejects.toMatchObject({ status: 401, message: "Missing Cloudflare Access JWT" });
  });

  it("defaults missing auth mode to Access authentication", async () => {
    const { AUTH_MODE: _authMode, ...envWithoutMode } = baseEnv;
    await expect(
      authenticateAccessIdentity(new Request("https://ledger.test"), envWithoutMode as Env)
    ).rejects.toMatchObject({ status: 401, message: "Missing Cloudflare Access JWT" });
  });

  it("rejects development mode without explicit dev actor", async () => {
    await expect(
      authenticateAccessIdentity(new Request("https://ledger.test"), { ...baseEnv, DEV_ACTOR_EMAIL: "" })
    ).rejects.toMatchObject({ status: 401, message: "Development actor email is not configured" });
  });
});
```

- [ ] **Step 2: Write failing actor repository tests**

Create `tests/auth/actorRepository.test.ts`:

```ts
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
    let bindArgs: unknown[] = [];
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
        onBind: (args) => (bindArgs = args)
      })
    );

    await expect(repo.requireActorByEmail(" ALICE@example.com ")).resolves.toEqual({
      personId: "person_1",
      name: "Alice",
      alias: null,
      email: "alice@example.com",
      roles: ["finance_manager"]
    });
    expect(bindArgs).toEqual(["alice@example.com"]);
  });

  it("rejects unmapped or disabled emails", async () => {
    const repo = new ActorRepository(mockDb({ firstRow: null }));
    await expect(repo.requireActorByEmail("missing@example.com")).rejects.toMatchObject({
      status: 403,
      message: "当前登录邮箱未绑定启用人员，请联系管理员"
    });
  });
});
```

- [ ] **Step 3: Run RED tests**

Run:

```bash
npm test -- tests/auth/access.test.ts tests/auth/actorRepository.test.ts
```

Expected: fail because auth modules do not exist.

- [ ] **Step 4: Create auth types**

Create `src/auth/types.ts`:

```ts
export type PersonRole = "admin" | "finance_manager" | "finance_entry" | "logistics" | "readonly" | "borrower";

export interface AuthenticatedIdentity {
  email: string;
  accessSubject: string | null;
  accessIssuer: string;
  accessAudience: string[];
}

export interface AuthenticatedActor {
  personId: string;
  name: string;
  alias: string | null;
  email: string;
  roles: PersonRole[];
}

export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    message: string
  ) {
    super(message);
    this.name = "AuthError";
  }
}
```

- [ ] **Step 5: Extend Worker env context**

Modify `src/worker/env.ts`:

```ts
import type { AuthenticatedActor } from "../auth/types";

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  AUTH_MODE?: "development" | "access";
  DEV_ACTOR_EMAIL?: string;
  CF_ACCESS_TEAM_DOMAIN?: string;
  CF_ACCESS_AUD?: string;
}

export interface RequestContext {
  request: Request;
  env: Env;
  params: Record<string, string>;
  actor: AuthenticatedActor | null;
}

export type Handler = (context: RequestContext) => Promise<Response>;
```

- [ ] **Step 6: Implement Access identity**

Create `src/auth/access.ts`:

```ts
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { Env } from "../worker/env";
import { AuthError, type AuthenticatedIdentity } from "./types";

interface AccessJwtPayload {
  email?: unknown;
  sub?: unknown;
  iss?: unknown;
  aud?: unknown;
}

export async function authenticateAccessIdentity(request: Request, env: Env): Promise<AuthenticatedIdentity> {
  const mode = env.AUTH_MODE ?? "access";
  if (mode === "development") {
    const email = env.DEV_ACTOR_EMAIL?.trim().toLowerCase();
    if (!email) throw new AuthError(401, "Development actor email is not configured");
    return {
      email,
      accessSubject: null,
      accessIssuer: "development",
      accessAudience: ["development"]
    };
  }

  const teamDomain = env.CF_ACCESS_TEAM_DOMAIN?.trim();
  const audience = env.CF_ACCESS_AUD?.trim();
  if (!teamDomain || !audience) throw new AuthError(401, "Cloudflare Access is not configured");

  const token = request.headers.get("Cf-Access-Jwt-Assertion");
  if (!token) throw new AuthError(401, "Missing Cloudflare Access JWT");

  const jwks = createRemoteJWKSet(new URL(`${teamDomain.replace(/\/$/, "")}/cdn-cgi/access/certs`));
  const verified = await jwtVerify(token, jwks, {
    issuer: teamDomain.replace(/\/$/, ""),
    audience
  }).catch(() => {
    throw new AuthError(401, "Invalid Cloudflare Access JWT");
  });

  return identityFromPayload(verified.payload as AccessJwtPayload);
}

function identityFromPayload(payload: AccessJwtPayload): AuthenticatedIdentity {
  if (typeof payload.email !== "string" || !payload.email.trim()) {
    throw new AuthError(401, "Cloudflare Access JWT is missing email");
  }
  const audience = Array.isArray(payload.aud) ? payload.aud.filter((value): value is string => typeof value === "string") : typeof payload.aud === "string" ? [payload.aud] : [];
  return {
    email: payload.email.trim().toLowerCase(),
    accessSubject: typeof payload.sub === "string" ? payload.sub : null,
    accessIssuer: typeof payload.iss === "string" ? payload.iss : "",
    accessAudience: audience
  };
}
```

- [ ] **Step 7: Implement actor repository**

Create `src/auth/actorRepository.ts`:

```ts
import { first, run } from "../repositories/db";
import { AuthError, type AuthenticatedActor, type PersonRole } from "./types";

interface ActorRow {
  id: string;
  name: string;
  alias: string | null;
  login_email: string;
  roles_json: string;
  is_enabled: number;
}

const knownRoles = new Set<PersonRole>(["admin", "finance_manager", "finance_entry", "logistics", "readonly", "borrower"]);

export class ActorRepository {
  constructor(private readonly db: D1Database) {}

  async requireActorByEmail(email: string): Promise<AuthenticatedActor> {
    const normalizedEmail = email.trim().toLowerCase();
    const row = await first<ActorRow>(
      this.db
        .prepare(
          `SELECT id, name, alias, login_email, roles_json, is_enabled
           FROM people
           WHERE lower(login_email) = ? AND is_enabled = 1`
        )
        .bind(normalizedEmail)
    );
    if (!row) throw new AuthError(403, "当前登录邮箱未绑定启用人员，请联系管理员");
    await run(this.db.prepare("UPDATE people SET last_login_at = ? WHERE id = ?").bind(new Date().toISOString(), row.id));
    return {
      personId: row.id,
      name: row.name,
      alias: row.alias,
      email: row.login_email,
      roles: parseRoles(row.roles_json)
    };
  }
}

function parseRoles(rolesJson: string): PersonRole[] {
  try {
    const parsed = JSON.parse(rolesJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((role): role is PersonRole => typeof role === "string" && knownRoles.has(role as PersonRole));
  } catch {
    return [];
  }
}
```

- [ ] **Step 8: Implement request authenticate helper**

Create `src/auth/authenticate.ts`:

```ts
import type { Env } from "../worker/env";
import { authenticateAccessIdentity } from "./access";
import { ActorRepository } from "./actorRepository";
import type { AuthenticatedActor } from "./types";

export async function authenticateRequest(request: Request, env: Env): Promise<AuthenticatedActor> {
  const identity = await authenticateAccessIdentity(request, env);
  return new ActorRepository(env.DB).requireActorByEmail(identity.email);
}
```

- [ ] **Step 9: Run GREEN tests**

Run:

```bash
npm test -- tests/auth/access.test.ts tests/auth/actorRepository.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/auth src/worker/env.ts tests/auth package.json package-lock.json
git commit -m "feat: add access actor authentication"
```

---

### Task 3: RBAC Permission Matrix

**Files:**
- Create: `src/auth/permissions.ts`
- Test: `tests/auth/permissions.test.ts`

- [ ] **Step 1: Write failing permission tests**

Create `tests/auth/permissions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertCan, capabilitiesForRoles, can } from "../../src/auth/permissions";
import type { AuthenticatedActor } from "../../src/auth/types";

function actor(roles: AuthenticatedActor["roles"]): AuthenticatedActor {
  return { personId: "person_1", name: "Alice", alias: null, email: "alice@example.com", roles };
}

describe("permissions", () => {
  it("grants approval to admin and finance manager", () => {
    expect(can(actor(["admin"]), "documents.approve")).toBe(true);
    expect(can(actor(["finance_manager"]), "documents.approve")).toBe(true);
  });

  it("denies approval to entry, logistics, readonly, and borrower", () => {
    expect(can(actor(["finance_entry"]), "documents.approve")).toBe(false);
    expect(can(actor(["logistics"]), "documents.approve")).toBe(false);
    expect(can(actor(["readonly"]), "documents.approve")).toBe(false);
    expect(can(actor(["borrower"]), "documents.approve")).toBe(false);
  });

  it("keeps borrower from gaining write access by itself", () => {
    expect(capabilitiesForRoles(["borrower"])).toEqual(["session.view"]);
  });

  it("throws 403 with clear message when unauthorized", () => {
    expect(() => assertCan(actor(["readonly"]), "documents.create")).toThrow("权限不足");
  });
});
```

- [ ] **Step 2: Run RED test**

```bash
npm test -- tests/auth/permissions.test.ts
```

Expected: fail because `permissions.ts` does not exist.

- [ ] **Step 3: Implement permission matrix**

Create `src/auth/permissions.ts`:

```ts
import { AuthError, type AuthenticatedActor, type PersonRole } from "./types";

export const capabilities = [
  "session.view",
  "documents.view",
  "documents.create",
  "documents.submit",
  "documents.approve",
  "documents.reject",
  "documents.previewApproval",
  "masterData.view",
  "masterData.write",
  "masterData.managePeopleRoles",
  "reports.view",
  "periodLocks.view",
  "periodLocks.lock",
  "periodLocks.unlock"
] as const;

export type Capability = (typeof capabilities)[number];

const roleCapabilities: Record<PersonRole, Capability[]> = {
  admin: [...capabilities],
  finance_manager: [
    "session.view",
    "documents.view",
    "documents.create",
    "documents.submit",
    "documents.approve",
    "documents.reject",
    "documents.previewApproval",
    "masterData.view",
    "masterData.write",
    "reports.view",
    "periodLocks.view",
    "periodLocks.lock"
  ],
  finance_entry: ["session.view", "documents.view", "documents.create", "documents.submit", "masterData.view", "reports.view"],
  logistics: ["session.view", "documents.view", "documents.create", "documents.submit", "reports.view"],
  readonly: ["session.view", "documents.view", "masterData.view", "reports.view"],
  borrower: ["session.view"]
};

export function capabilitiesForRoles(roles: PersonRole[]): Capability[] {
  return [...new Set(roles.flatMap((role) => roleCapabilities[role] ?? []))];
}

export function can(actor: AuthenticatedActor, capability: Capability): boolean {
  return capabilitiesForRoles(actor.roles).includes(capability);
}

export function assertCan(actor: AuthenticatedActor, capability: Capability): void {
  if (!can(actor, capability)) throw new AuthError(403, "权限不足");
}
```

- [ ] **Step 4: Run GREEN test**

```bash
npm test -- tests/auth/permissions.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/auth/permissions.ts tests/auth/permissions.test.ts
git commit -m "feat: add internal permission matrix"
```

---

### Task 4: Auth-Aware Router and `/api/me`

**Files:**
- Create: `src/api/me.ts`
- Modify: `src/worker/router.ts`
- Test: `tests/api/me.test.ts`

- [ ] **Step 1: Write failing `/api/me` tests**

Create `tests/api/me.test.ts`:

```ts
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
```

- [ ] **Step 2: Run RED test**

```bash
npm test -- tests/api/me.test.ts
```

Expected: fail because `/api/me` route does not exist.

- [ ] **Step 3: Implement `/api/me` handler**

Create `src/api/me.ts`:

```ts
import { capabilitiesForRoles } from "../auth/permissions";
import type { Handler } from "../worker/env";

export const getMe: Handler = async ({ actor }) => {
  if (!actor) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({
    data: {
      person: {
        id: actor.personId,
        name: actor.name,
        alias: actor.alias,
        loginEmail: actor.email,
        roles: actor.roles
      },
      capabilities: capabilitiesForRoles(actor.roles)
    }
  });
};
```

- [ ] **Step 4: Add route auth metadata**

Modify `src/worker/router.ts` route type:

```ts
interface Route {
  method: string;
  pathname: string;
  handler: Handler;
  regex: RegExp;
  paramNames: string[];
  auth: "optional" | "required";
}

function defineRoute(method: string, pathname: string, handler: Handler, auth: "optional" | "required" = "required"): Route {
  const { regex, paramNames } = compilePath(pathname);
  return { method, pathname, handler, regex, paramNames, auth };
}
```

Add imports:

```ts
import { AuthError } from "../auth/types";
import { authenticateRequest } from "../auth/authenticate";
import { getMe } from "../api/me";
```

Add route:

```ts
defineRoute("GET", "/api/me", getMe),
```

Wrap handler call:

```ts
let actor = null;
if (match.candidate.auth === "required") {
  try {
    actor = await authenticateRequest(request, env);
  } catch (error) {
    if (error instanceof AuthError) {
      return Response.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

return match.candidate.handler({ request, env, params, actor });
```

During this task, mark static asset fallback routes outside API as unaffected because `route()` handles only API paths.

- [ ] **Step 5: Run GREEN test**

```bash
npm test -- tests/api/me.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run route regression tests**

```bash
npm test -- tests/api/documents.test.ts tests/api/masterDataGovernance.test.ts tests/api/reports.test.ts
```

Expected: existing tests fail until they provide mapped dev actors. Update test env helpers with `AUTH_MODE: "development"` and `DEV_ACTOR_EMAIL` plus actor first-row handling, then rerun until PASS.

- [ ] **Step 7: Commit**

```bash
git add src/api/me.ts src/worker/router.ts src/worker/env.ts tests/api/me.test.ts tests/api/documents.test.ts tests/api/masterDataGovernance.test.ts tests/api/reports.test.ts
git commit -m "feat: add authenticated session endpoint"
```

---

### Task 5: Enforce Authenticated Actors on Existing Write APIs

**Files:**
- Modify: `src/api/documents.ts`
- Modify: `src/api/masterDataGovernance.ts`
- Modify: `src/repositories/auditLogRepository.ts`
- Test: `tests/api/documents.test.ts`
- Test: `tests/api/masterDataGovernance.test.ts`

- [ ] **Step 1: Write failing document API auth tests**

Add to `tests/api/documents.test.ts`:

```ts
it("uses authenticated actor instead of body createdBy on document creation", async () => {
  const response = await createDocument({
    request: new Request("https://ledger.test/api/documents", {
      method: "POST",
      body: JSON.stringify({
        documentType: "project_income",
        businessDate: "2026-04-24",
        period: "2026-04",
        summary: "Initial income",
        createdBy: "spoofed_person",
        lines: [validLine()]
      })
    }),
    env: mockEnv(),
    params: {},
    actor: { personId: "user_1", name: "User", alias: null, email: "user@example.com", roles: ["finance_entry"] }
  });

  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toEqual({ error: "请求中的操作人和当前登录人不一致" });
});

it("lets authenticated actor create when body actor is omitted", async () => {
  const response = await createDocument({
    request: new Request("https://ledger.test/api/documents", {
      method: "POST",
      body: JSON.stringify({
        documentType: "project_income",
        businessDate: "2026-04-24",
        period: "2026-04",
        summary: "Initial income",
        lines: [validLine()]
      })
    }),
    env: mockEnv({ allResultsQueue: projectIncomeMasterDataResults() }),
    params: {},
    actor: { personId: "user_1", name: "User", alias: null, email: "user@example.com", roles: ["finance_entry"] }
  });

  expect(response.status).toBe(201);
});
```

- [ ] **Step 2: Write failing master data permission tests**

Add to `tests/api/masterDataGovernance.test.ts`:

```ts
it("rejects master data writes from readonly actors", async () => {
  const response = await createMasterDataProject({
    request: new Request("https://ledger.test/api/master-data/projects", {
      method: "POST",
      body: JSON.stringify({ code: "P1", name: "Project" })
    }),
    env: writeMockEnv(),
    params: {},
    actor: { personId: "person_readonly", name: "Reader", alias: null, email: "reader@example.com", roles: ["readonly"] }
  });

  expect(response.status).toBe(403);
  await expect(response.json()).resolves.toEqual({ error: "权限不足" });
});
```

- [ ] **Step 3: Run RED tests**

```bash
npm test -- tests/api/documents.test.ts tests/api/masterDataGovernance.test.ts
```

Expected: fail because handlers still require and trust body actor fields.

- [ ] **Step 4: Add actor helpers in document API**

Modify `src/api/documents.ts`:

```ts
import { assertCan } from "../auth/permissions";
import type { AuthenticatedActor } from "../auth/types";

function requireActor(actor: AuthenticatedActor | null) {
  if (!actor) throw new Error("Unauthorized");
  return actor;
}

function rejectSpoofedActor(body: Record<string, unknown>, keys: string[], personId: string) {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim() && value.trim() !== personId) {
      throw new Error("请求中的操作人和当前登录人不一致");
    }
  }
}
```

Use:

- create: `assertCan(actor, "documents.create")`, `createdBy = actor.personId`.
- submit: `assertCan(actor, "documents.submit")`, actor body ignored after spoof check.
- approve: `assertCan(actor, "documents.approve")`.
- reject: `assertCan(actor, "documents.reject")`.

Catch `AuthError` or normal errors and return 403 for permission/spoof errors, 400 for business validation.

- [ ] **Step 5: Add auth helpers in master data API**

Modify write handlers in `src/api/masterDataGovernance.ts`:

```ts
import { assertCan } from "../auth/permissions";
import { AuthError, type AuthenticatedActor } from "../auth/types";

function requireWriteActor(actor: AuthenticatedActor | null) {
  if (!actor) throw new AuthError(401, "Unauthorized");
  assertCan(actor, "masterData.write");
  return actor.personId;
}
```

Replace `requiredText(body, "actor")` with `requireWriteActor(actor)`.

For person role changes, if roles include `admin` or remove `admin`, require:

```ts
assertCan(actor, "masterData.managePeopleRoles");
```

- [ ] **Step 6: Extend audit metadata**

Modify `src/repositories/auditLogRepository.ts` input:

```ts
actorPersonId?: string | null;
actorEmail?: string | null;
requestId?: string | null;
ipAddress?: string | null;
userAgent?: string | null;
```

Insert new columns with null defaults. Existing tests should still pass because fields are optional.

- [ ] **Step 7: Run GREEN tests**

```bash
npm test -- tests/api/documents.test.ts tests/api/masterDataGovernance.test.ts tests/api/auditLogRepository.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/api/documents.ts src/api/masterDataGovernance.ts src/repositories/auditLogRepository.ts tests/api/documents.test.ts tests/api/masterDataGovernance.test.ts tests/api/auditLogRepository.test.ts
git commit -m "feat: enforce authenticated actors on writes"
```

---

### Task 6: Period Lock API

**Files:**
- Create: `src/repositories/periodLockRepository.ts`
- Create: `src/api/periodLocks.ts`
- Modify: `src/worker/router.ts`
- Test: `tests/api/periodLocks.test.ts`

- [ ] **Step 1: Write failing period lock API tests**

Create `tests/api/periodLocks.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { createPeriodLock, deletePeriodLock, listPeriodLocks } from "../../src/api/periodLocks";
import type { Env } from "../../src/worker/env";

function env(options: { rows?: unknown[]; runResult?: D1Result } = {}): Env {
  return {
    AUTH_MODE: "development",
    DEV_ACTOR_EMAIL: "admin@example.test",
    DB: {
      prepare: () =>
        ({
          bind() {
            return this;
          },
          all: async () => ({ success: true, results: options.rows ?? [] }),
          first: async () => null,
          run: async () => options.runResult ?? ({ success: true }) as D1Result
        }) as unknown as D1PreparedStatement
    } as unknown as D1Database,
    ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher
  };
}

const admin = { personId: "admin_1", name: "Admin", alias: null, email: "admin@example.test", roles: ["admin" as const] };
const manager = { personId: "manager_1", name: "Manager", alias: null, email: "manager@example.test", roles: ["finance_manager" as const] };
const readonly = { personId: "reader_1", name: "Reader", alias: null, email: "reader@example.test", roles: ["readonly" as const] };

describe("period lock API", () => {
  it("lists period locks for authorized users", async () => {
    const response = await listPeriodLocks({
      request: new Request("https://ledger.test/api/period-locks"),
      env: env({ rows: [{ period: "2026-04", locked_by: "admin_1", locked_at: "2026-04-25T00:00:00.000Z", note: "closed" }] }),
      params: {},
      actor: manager
    });
    expect(response.status).toBe(200);
  });

  it("locks periods for finance managers", async () => {
    const response = await createPeriodLock({
      request: new Request("https://ledger.test/api/period-locks", {
        method: "POST",
        body: JSON.stringify({ period: "2026-04", note: "month close" })
      }),
      env: env(),
      params: {},
      actor: manager
    });
    expect(response.status).toBe(201);
  });

  it("requires admin for unlock", async () => {
    const response = await deletePeriodLock({
      request: new Request("https://ledger.test/api/period-locks/2026-04", {
        method: "DELETE",
        body: JSON.stringify({ reason: "reopen for correction" })
      }),
      env: env(),
      params: { period: "2026-04" },
      actor: manager
    });
    expect(response.status).toBe(403);
  });

  it("requires reason when unlocking", async () => {
    const response = await deletePeriodLock({
      request: new Request("https://ledger.test/api/period-locks/2026-04", { method: "DELETE", body: JSON.stringify({}) }),
      env: env(),
      params: { period: "2026-04" },
      actor: admin
    });
    expect(response.status).toBe(400);
  });

  it("rejects readonly lock attempts", async () => {
    const response = await createPeriodLock({
      request: new Request("https://ledger.test/api/period-locks", {
        method: "POST",
        body: JSON.stringify({ period: "2026-04" })
      }),
      env: env(),
      params: {},
      actor: readonly
    });
    expect(response.status).toBe(403);
  });
});
```

- [ ] **Step 2: Run RED tests**

```bash
npm test -- tests/api/periodLocks.test.ts
```

Expected: fail because files do not exist.

- [ ] **Step 3: Implement repository**

Create `src/repositories/periodLockRepository.ts`:

```ts
import { all, run } from "./db";

export interface PeriodLockRow {
  period: string;
  locked_by: string;
  locked_at: string;
  note: string | null;
}

export class PeriodLockRepository {
  constructor(private readonly db: D1Database) {}

  list(): Promise<PeriodLockRow[]> {
    return all<PeriodLockRow>(this.db.prepare("SELECT period, locked_by, locked_at, note FROM period_locks ORDER BY period DESC"));
  }

  async lock(input: { period: string; lockedBy: string; note: string | null }) {
    await run(
      this.db
        .prepare("INSERT INTO period_locks (period, locked_by, locked_at, note) VALUES (?, ?, ?, ?)")
        .bind(input.period, input.lockedBy, new Date().toISOString(), input.note)
    );
  }

  async unlock(period: string) {
    await run(this.db.prepare("DELETE FROM period_locks WHERE period = ?").bind(period));
  }
}
```

- [ ] **Step 4: Implement API**

Create `src/api/periodLocks.ts`:

```ts
import { assertCan } from "../auth/permissions";
import { AuthError } from "../auth/types";
import { AuditLogRepository } from "../repositories/auditLogRepository";
import { PeriodLockRepository } from "../repositories/periodLockRepository";
import type { Handler } from "../worker/env";

function jsonError(error: unknown) {
  if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
  return Response.json({ error: error instanceof Error ? error.message : "Request failed" }, { status: 400 });
}

async function bodyObject(request: Request) {
  try {
    const body = await request.json();
    return body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function validPeriod(value: unknown) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}$/.test(value)) throw new Error("period is required");
  const month = Number(value.slice(5, 7));
  if (month < 1 || month > 12) throw new Error("period is required");
  return value;
}

export const listPeriodLocks: Handler = async ({ env, actor }) => {
  try {
    if (!actor) throw new AuthError(401, "Unauthorized");
    assertCan(actor, "periodLocks.view");
    return Response.json({ data: await new PeriodLockRepository(env.DB).list() });
  } catch (error) {
    return jsonError(error);
  }
};

export const createPeriodLock: Handler = async ({ request, env, actor }) => {
  try {
    if (!actor) throw new AuthError(401, "Unauthorized");
    assertCan(actor, "periodLocks.lock");
    const body = await bodyObject(request);
    const period = validPeriod(body.period);
    const note = typeof body.note === "string" && body.note.trim() ? body.note.trim() : null;
    await new PeriodLockRepository(env.DB).lock({ period, lockedBy: actor.personId, note });
    await new AuditLogRepository(env.DB).record({
      actor: actor.personId,
      actorPersonId: actor.personId,
      actorEmail: actor.email,
      action: "period_lock.create",
      entityType: "period_lock",
      entityId: period,
      after: { period, note }
    });
    return Response.json({ data: { period, status: "locked" } }, { status: 201 });
  } catch (error) {
    return jsonError(error);
  }
};

export const deletePeriodLock: Handler = async ({ request, env, params, actor }) => {
  try {
    if (!actor) throw new AuthError(401, "Unauthorized");
    assertCan(actor, "periodLocks.unlock");
    const period = validPeriod(params.period);
    const body = await bodyObject(request);
    if (typeof body.reason !== "string" || !body.reason.trim()) throw new Error("reason is required");
    await new PeriodLockRepository(env.DB).unlock(period);
    await new AuditLogRepository(env.DB).record({
      actor: actor.personId,
      actorPersonId: actor.personId,
      actorEmail: actor.email,
      action: "period_lock.delete",
      entityType: "period_lock",
      entityId: period,
      reason: body.reason.trim(),
      before: { period }
    });
    return Response.json({ data: { period, status: "unlocked" } });
  } catch (error) {
    return jsonError(error);
  }
};
```

- [ ] **Step 5: Add routes**

Modify `src/worker/router.ts`:

```ts
import { createPeriodLock, deletePeriodLock, listPeriodLocks } from "../api/periodLocks";

defineRoute("GET", "/api/period-locks", listPeriodLocks),
defineRoute("POST", "/api/period-locks", createPeriodLock),
defineRoute("DELETE", "/api/period-locks/:period", deletePeriodLock),
```

- [ ] **Step 6: Run GREEN tests**

```bash
npm test -- tests/api/periodLocks.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/repositories/periodLockRepository.ts src/api/periodLocks.ts src/worker/router.ts tests/api/periodLocks.test.ts
git commit -m "feat: add period lock management api"
```

---

### Task 7: Review Center API and Approval Preview

**Files:**
- Create: `src/repositories/reviewRepository.ts`
- Create: `src/api/review.ts`
- Modify: `src/services/documentService.ts`
- Modify: `src/worker/router.ts`
- Test: `tests/api/review.test.ts`
- Test: `tests/api/documentService.test.ts`

- [ ] **Step 1: Write failing service preview tests**

Add to `tests/api/documentService.test.ts`:

```ts
it("previews approval effects without writing postings or audit logs", async () => {
  repo.getDocument.mockResolvedValue(documentRow({ status: "pending" }));
  repo.getDocumentLines.mockResolvedValue([lineRow()]);
  repo.isPeriodLocked.mockResolvedValue(null);

  const preview = await service.previewApproval("doc_1");

  expect(preview.accountEntries).toHaveLength(1);
  expect(repo.approveWithPostings).not.toHaveBeenCalled();
  expect(audit.record).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Write failing review API tests**

Create `tests/api/review.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { approveReviewDocument, listReviewDocuments, previewReviewDocument, rejectReviewDocument } from "../../src/api/review";
import type { Env } from "../../src/worker/env";

function env(rows: unknown[] = []): Env {
  return {
    AUTH_MODE: "development",
    DEV_ACTOR_EMAIL: "manager@example.test",
    DB: {
      prepare: () =>
        ({
          bind() {
            return this;
          },
          all: async () => ({ success: true, results: rows }),
          first: async () => null,
          run: async () => ({ success: true }) as D1Result
        }) as unknown as D1PreparedStatement,
      batch: async () => []
    } as unknown as D1Database,
    ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher
  };
}

const manager = { personId: "manager_1", name: "Manager", alias: null, email: "manager@example.test", roles: ["finance_manager" as const] };
const entry = { personId: "entry_1", name: "Entry", alias: null, email: "entry@example.test", roles: ["finance_entry" as const] };

describe("review API", () => {
  it("lists review queue for finance managers", async () => {
    const response = await listReviewDocuments({
      request: new Request("https://ledger.test/api/review/documents"),
      env: env([{ id: "doc_1", document_no: "D1", document_type: "project_income", business_date: "2026-04-25", period: "2026-04", submitted_at: "2026-04-25T00:00:00.000Z", summary: "Review me" }]),
      params: {},
      actor: manager
    });
    expect(response.status).toBe(200);
  });

  it("rejects review queue for finance entry users", async () => {
    const response = await listReviewDocuments({
      request: new Request("https://ledger.test/api/review/documents"),
      env: env(),
      params: {},
      actor: entry
    });
    expect(response.status).toBe(403);
  });

  it("requires reject reason", async () => {
    const response = await rejectReviewDocument({
      request: new Request("https://ledger.test/api/review/documents/doc_1/reject", { method: "POST", body: JSON.stringify({}) }),
      env: env(),
      params: { id: "doc_1" },
      actor: manager
    });
    expect(response.status).toBe(400);
  });
});
```

- [ ] **Step 3: Run RED tests**

```bash
npm test -- tests/api/review.test.ts tests/api/documentService.test.ts
```

Expected: fail because review API and service preview do not exist.

- [ ] **Step 4: Implement service preview**

Modify `src/services/documentService.ts`:

```ts
export interface ApprovalPreview {
  accountEntries: ReturnType<typeof entriesForApprovedDocument>["accountEntries"];
  loanEntries: ReturnType<typeof entriesForApprovedDocument>["loanEntries"];
  lotCreations: FifoPostingEffects["lotCreations"];
  lotUpdates: FifoPostingEffects["lotUpdates"];
  lotMovements: FifoPostingEffects["lotMovements"];
  pendingCostCreations: FifoPostingEffects["pendingCostCreations"];
  pendingCostUpdates: FifoPostingEffects["pendingCostUpdates"];
  pendingCostApplications: FifoPostingEffects["pendingCostApplications"];
  loanItemCreations: LoanPostingEffects["loanItemCreations"];
  loanItemUpdates: LoanPostingEffects["loanItemUpdates"];
  loanAllocations: LoanPostingEffects["loanAllocations"];
}
```

Add method:

```ts
async previewApproval(id: string): Promise<ApprovalPreview> {
  const document = await this.requireDocument(id);
  assertDocumentTransition(document.status, "approved", "approve");
  const approvalPeriod = periodFromDate(document.business_date);
  const lockedPeriod = await this.documents.isPeriodLocked(approvalPeriod);
  if (lockedPeriod) throw new Error(`Period ${approvalPeriod} is locked`);
  const validated = await this.validatePersistedDocument(document, "approve");
  if (document.action_type === "reversal") {
    return this.previewReversal(document, approvalPeriod, validated.originalDocument);
  }
  const lines = validated.lines;
  assertSingleLineFifoApproval(document.document_type, lines);
  const borrowerPersonId = borrowerForLoanDocument(document.document_type, lines);
  const posting = entriesForApprovedDocument({
    id: document.id,
    documentType: document.document_type,
    actionType: document.action_type,
    businessDate: document.business_date,
    borrowerPersonId,
    lines: lines.map((line) => ({
      accountId: line.account_id ?? "",
      counterpartyAccountId: line.counterparty_account_id,
      personId: line.person_id,
      currencyCode: line.currency_code,
      amountMinor: line.amount_minor,
      usdtAmountMinor: line.usdt_amount_minor
    }))
  });
  const fifoEffects = await this.planFifoPostingEffects(document.document_type, document.id, document.business_date, lines);
  const loanEffects = await this.planLoanPostingEffects(document, lines, borrowerPersonId);
  return {
    accountEntries: posting.accountEntries,
    loanEntries: attachLoanAllocationCost(document.document_type, posting.loanEntries, totalLoanAllocationUsdtCost(loanEffects)),
    lotCreations: fifoEffects.lotCreations,
    lotUpdates: fifoEffects.lotUpdates,
    lotMovements: fifoEffects.lotMovements,
    pendingCostCreations: fifoEffects.pendingCostCreations,
    pendingCostUpdates: fifoEffects.pendingCostUpdates,
    pendingCostApplications: fifoEffects.pendingCostApplications ?? [],
    loanItemCreations: loanEffects.loanItemCreations,
    loanItemUpdates: loanEffects.loanItemUpdates,
    loanAllocations: loanEffects.loanAllocations
  };
}
```

Extract shared internal helpers if needed so `approve()` and `previewApproval()` do not duplicate more than one small mapping block.

- [ ] **Step 5: Implement review repository**

Create `src/repositories/reviewRepository.ts`:

```ts
import { all, first } from "./db";

export interface ReviewQueueRow {
  id: string;
  document_no: string;
  document_type: string;
  business_date: string;
  period: string;
  submitted_at: string | null;
  summary: string;
  created_by: string;
  operator_person_id: string | null;
  project_id: string | null;
  merchant_id: string | null;
}

export class ReviewRepository {
  constructor(private readonly db: D1Database) {}

  listPending(): Promise<ReviewQueueRow[]> {
    return all<ReviewQueueRow>(
      this.db.prepare(
        `SELECT id, document_no, document_type, business_date, period, submitted_at, summary,
                created_by, operator_person_id, project_id, merchant_id
         FROM documents
         WHERE status = 'pending'
         ORDER BY submitted_at, business_date, document_no`
      )
    );
  }

  getPending(id: string): Promise<ReviewQueueRow | null> {
    return first<ReviewQueueRow>(
      this.db
        .prepare(
          `SELECT id, document_no, document_type, business_date, period, submitted_at, summary,
                  created_by, operator_person_id, project_id, merchant_id
           FROM documents
           WHERE id = ? AND status = 'pending'`
        )
        .bind(id)
    );
  }
}
```

- [ ] **Step 6: Implement review API**

Create `src/api/review.ts`:

```ts
import { assertCan } from "../auth/permissions";
import { AuthError } from "../auth/types";
import { AuditLogRepository } from "../repositories/auditLogRepository";
import { DocumentRepository } from "../repositories/documentRepository";
import { MasterDataRepository } from "../repositories/masterDataRepository";
import { ReviewRepository } from "../repositories/reviewRepository";
import { DocumentService } from "../services/documentService";
import type { Handler } from "../worker/env";

function jsonError(error: unknown) {
  if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
  return Response.json({ error: error instanceof Error ? error.message : "Request failed" }, { status: 400 });
}

function service(env: { DB: D1Database }) {
  return new DocumentService(new DocumentRepository(env.DB), new AuditLogRepository(env.DB), new MasterDataRepository(env.DB));
}

export const listReviewDocuments: Handler = async ({ env, actor }) => {
  try {
    if (!actor) throw new AuthError(401, "Unauthorized");
    assertCan(actor, "documents.approve");
    return Response.json({ data: await new ReviewRepository(env.DB).listPending() });
  } catch (error) {
    return jsonError(error);
  }
};

export const getReviewDocument: Handler = async ({ env, params, actor }) => {
  try {
    if (!actor) throw new AuthError(401, "Unauthorized");
    assertCan(actor, "documents.approve");
    const document = await new ReviewRepository(env.DB).getPending(params.id);
    if (!document) return Response.json({ error: "Document not found" }, { status: 404 });
    return Response.json({ data: document });
  } catch (error) {
    return jsonError(error);
  }
};

export const previewReviewDocument: Handler = async ({ env, params, actor }) => {
  try {
    if (!actor) throw new AuthError(401, "Unauthorized");
    assertCan(actor, "documents.previewApproval");
    return Response.json({ data: await service(env).previewApproval(params.id) });
  } catch (error) {
    return jsonError(error);
  }
};

export const approveReviewDocument: Handler = async ({ env, params, actor }) => {
  try {
    if (!actor) throw new AuthError(401, "Unauthorized");
    assertCan(actor, "documents.approve");
    await service(env).approve(params.id, actor.personId);
    return Response.json({ data: { id: params.id, status: "approved" } });
  } catch (error) {
    return jsonError(error);
  }
};

export const rejectReviewDocument: Handler = async ({ request, env, params, actor }) => {
  try {
    if (!actor) throw new AuthError(401, "Unauthorized");
    assertCan(actor, "documents.reject");
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    if (typeof body.reason !== "string" || !body.reason.trim()) throw new Error("reason is required");
    await service(env).reject(params.id, actor.personId, body.reason.trim());
    return Response.json({ data: { id: params.id, status: "rejected" } });
  } catch (error) {
    return jsonError(error);
  }
};
```

- [ ] **Step 7: Add routes**

Modify `src/worker/router.ts`:

```ts
import {
  approveReviewDocument,
  getReviewDocument,
  listReviewDocuments,
  previewReviewDocument,
  rejectReviewDocument
} from "../api/review";

defineRoute("GET", "/api/review/documents", listReviewDocuments),
defineRoute("GET", "/api/review/documents/:id", getReviewDocument),
defineRoute("GET", "/api/review/documents/:id/preview", previewReviewDocument),
defineRoute("POST", "/api/review/documents/:id/approve", approveReviewDocument),
defineRoute("POST", "/api/review/documents/:id/reject", rejectReviewDocument),
```

- [ ] **Step 8: Run GREEN tests**

```bash
npm test -- tests/api/review.test.ts tests/api/documentService.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/repositories/reviewRepository.ts src/api/review.ts src/services/documentService.ts src/worker/router.ts tests/api/review.test.ts tests/api/documentService.test.ts
git commit -m "feat: add review center api"
```

---

### Task 8: Frontend Session Shell and Capability-Gated Navigation

**Files:**
- Create: `src/app/session/sessionTypes.ts`
- Create: `src/app/session/sessionApi.ts`
- Create: `src/app/session/sessionModel.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/api.ts`
- Test: `src/app/session/sessionModel.test.ts`

- [ ] **Step 1: Write failing session model tests**

Create `src/app/session/sessionModel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canUse, roleLabels, visibleNavigationItems } from "./sessionModel";
import type { SessionState } from "./sessionTypes";

const financeSession: SessionState = {
  status: "authenticated",
  person: { id: "person_1", name: "Finance", alias: null, loginEmail: "finance@example.com", roles: ["finance_manager"] },
  capabilities: ["session.view", "documents.view", "documents.approve", "reports.view", "periodLocks.lock"]
};

describe("session model", () => {
  it("checks capabilities", () => {
    expect(canUse(financeSession, "documents.approve")).toBe(true);
    expect(canUse(financeSession, "masterData.managePeopleRoles")).toBe(false);
  });

  it("shows review center only to users with approval capability", () => {
    expect(visibleNavigationItems(financeSession).map((item) => item.key)).toContain("review");
  });

  it("labels roles", () => {
    expect(roleLabels.finance_manager).toBe("财务主管");
  });
});
```

- [ ] **Step 2: Run RED test**

```bash
npm test -- src/app/session/sessionModel.test.ts
```

Expected: fail because session files do not exist.

- [ ] **Step 3: Create session types and model**

Create `src/app/session/sessionTypes.ts`:

```ts
export type Capability =
  | "session.view"
  | "documents.view"
  | "documents.create"
  | "documents.submit"
  | "documents.approve"
  | "documents.reject"
  | "documents.previewApproval"
  | "masterData.view"
  | "masterData.write"
  | "masterData.managePeopleRoles"
  | "reports.view"
  | "periodLocks.view"
  | "periodLocks.lock"
  | "periodLocks.unlock";

export type PersonRole = "admin" | "finance_manager" | "finance_entry" | "logistics" | "readonly" | "borrower";

export interface SessionPerson {
  id: string;
  name: string;
  alias: string | null;
  loginEmail: string;
  roles: PersonRole[];
}

export type SessionState =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "authenticated"; person: SessionPerson; capabilities: Capability[] };
```

Create `src/app/session/sessionModel.ts`:

```ts
import type { Capability, PersonRole, SessionState } from "./sessionTypes";

export const roleLabels: Record<PersonRole, string> = {
  admin: "管理员",
  finance_manager: "财务主管",
  finance_entry: "财务录入",
  logistics: "后勤人员",
  readonly: "只读",
  borrower: "借款人"
};

export function canUse(session: SessionState, capability: Capability) {
  return session.status === "authenticated" && session.capabilities.includes(capability);
}

export function visibleNavigationItems(session: SessionState) {
  return [
    { key: "documents", label: "业务单据", capability: "documents.view" as Capability },
    { key: "review", label: "审核中心", capability: "documents.approve" as Capability },
    { key: "reports", label: "报表中心", capability: "reports.view" as Capability },
    { key: "master-data", label: "基础资料", capability: "masterData.view" as Capability },
    { key: "period-locks", label: "锁账月结", capability: "periodLocks.view" as Capability }
  ].filter((item) => canUse(session, item.capability));
}
```

Create `src/app/session/sessionApi.ts`:

```ts
import { getJson, type ApiEnvelope } from "../api";
import type { Capability, SessionPerson } from "./sessionTypes";

export function loadSession() {
  return getJson<ApiEnvelope<{ person: SessionPerson; capabilities: Capability[] }>>("/api/me");
}
```

- [ ] **Step 4: Update app shell**

Modify `src/app/App.tsx` to:

- Load `/api/me` on mount.
- Show a compact top identity bar.
- Render navigation from `visibleNavigationItems(session)`.
- If session error, show “当前登录邮箱未绑定启用人员，请联系管理员。” and no write pages.
- Keep default first available page.

- [ ] **Step 5: Run GREEN test and app tests**

```bash
npm test -- src/app/session/sessionModel.test.ts src/app/pages/DocumentsPage.test.ts src/app/pages/master-data/masterDataModel.test.ts
```

Expected: PASS after updating tests to provide session props or mocked `/api/me`.

- [ ] **Step 6: Commit**

```bash
git add src/app/session src/app/App.tsx src/app/api.ts src/app/session/sessionModel.test.ts src/app/pages/DocumentsPage.test.ts src/app/pages/master-data/masterDataModel.test.ts
git commit -m "feat: add authenticated app shell"
```

---

### Task 9: Review Center Frontend

**Files:**
- Create: `src/app/pages/ReviewCenterPage.tsx`
- Create: `src/app/pages/review/reviewTypes.ts`
- Create: `src/app/pages/review/reviewApi.ts`
- Create: `src/app/pages/review/reviewModel.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/styles.css`
- Test: `src/app/pages/review/reviewModel.test.ts`
- Test: `src/app/pages/ReviewCenterPage.test.ts`

- [ ] **Step 1: Write failing review model tests**

Create `src/app/pages/review/reviewModel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { previewGroups, waitingLabel } from "./reviewModel";

describe("review model", () => {
  it("groups approval preview effects by business area", () => {
    const groups = previewGroups({
      accountEntries: [{ accountId: "acct_1", currencyCode: "AED", amountMinor: 1000 }],
      loanEntries: [],
      lotCreations: [],
      lotUpdates: [],
      lotMovements: [{ lotId: "lot_1", amountMinor: 1000 }],
      pendingCostCreations: [],
      pendingCostUpdates: [],
      pendingCostApplications: [],
      loanItemCreations: [],
      loanItemUpdates: [],
      loanAllocations: []
    });
    expect(groups.map((group) => group.label)).toEqual(["账户影响", "FIFO批次影响"]);
  });

  it("formats waiting time from submitted timestamp", () => {
    expect(waitingLabel("2026-04-25T00:00:00.000Z", new Date("2026-04-25T03:00:00.000Z"))).toBe("3 小时");
  });
});
```

- [ ] **Step 2: Write failing page smoke test**

Create `src/app/pages/ReviewCenterPage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canRenderReviewCenter } from "./ReviewCenterPage";

describe("ReviewCenterPage", () => {
  it("exports review center render guard", () => {
    expect(canRenderReviewCenter(["documents.approve"])).toBe(true);
    expect(canRenderReviewCenter(["documents.view"])).toBe(false);
  });
});
```

- [ ] **Step 3: Run RED tests**

```bash
npm test -- src/app/pages/review/reviewModel.test.ts src/app/pages/ReviewCenterPage.test.ts
```

Expected: fail because files do not exist.

- [ ] **Step 4: Implement review types/api/model**

Create `src/app/pages/review/reviewTypes.ts`:

```ts
export interface ReviewDocumentRow {
  id: string;
  document_no: string;
  document_type: string;
  business_date: string;
  period: string;
  submitted_at: string | null;
  summary: string;
  created_by: string;
  operator_person_id: string | null;
  project_id: string | null;
  merchant_id: string | null;
}

export interface ApprovalPreviewState {
  accountEntries: unknown[];
  loanEntries: unknown[];
  lotCreations: unknown[];
  lotUpdates: unknown[];
  lotMovements: unknown[];
  pendingCostCreations: unknown[];
  pendingCostUpdates: unknown[];
  pendingCostApplications: unknown[];
  loanItemCreations: unknown[];
  loanItemUpdates: unknown[];
  loanAllocations: unknown[];
}
```

Create `src/app/pages/review/reviewApi.ts`:

```ts
import { getJson, postJson, type ApiEnvelope } from "../../api";
import type { ApprovalPreviewState, ReviewDocumentRow } from "./reviewTypes";

export const listReviewDocuments = () => getJson<ApiEnvelope<ReviewDocumentRow[]>>("/api/review/documents");
export const getReviewDocument = (id: string) => getJson<ApiEnvelope<ReviewDocumentRow>>(`/api/review/documents/${encodeURIComponent(id)}`);
export const previewReviewDocument = (id: string) => getJson<ApiEnvelope<ApprovalPreviewState>>(`/api/review/documents/${encodeURIComponent(id)}/preview`);
export const approveReviewDocument = (id: string) => postJson<ApiEnvelope<{ id: string; status: string }>>(`/api/review/documents/${encodeURIComponent(id)}/approve`, {});
export const rejectReviewDocument = (id: string, reason: string) => postJson<ApiEnvelope<{ id: string; status: string }>>(`/api/review/documents/${encodeURIComponent(id)}/reject`, { reason });
```

Create `src/app/pages/review/reviewModel.ts`:

```ts
import type { ApprovalPreviewState } from "./reviewTypes";

export function waitingLabel(submittedAt: string | null, now = new Date()) {
  if (!submittedAt) return "未记录";
  const elapsedMs = Math.max(0, now.getTime() - new Date(submittedAt).getTime());
  const hours = Math.floor(elapsedMs / 3_600_000);
  if (hours < 1) return "1 小时内";
  if (hours < 24) return `${hours} 小时`;
  return `${Math.floor(hours / 24)} 天`;
}

export function previewGroups(preview: ApprovalPreviewState) {
  return [
    { key: "account", label: "账户影响", rows: preview.accountEntries },
    { key: "fifo", label: "FIFO批次影响", rows: [...preview.lotCreations, ...preview.lotUpdates, ...preview.lotMovements] },
    { key: "pending", label: "备用金待匹配", rows: [...preview.pendingCostCreations, ...preview.pendingCostUpdates, ...preview.pendingCostApplications] },
    { key: "loan", label: "借款影响", rows: [...preview.loanEntries, ...preview.loanItemCreations, ...preview.loanItemUpdates, ...preview.loanAllocations] }
  ].filter((group) => group.rows.length > 0);
}
```

- [ ] **Step 5: Implement review page**

Create `src/app/pages/ReviewCenterPage.tsx` with:

- Queue table from `listReviewDocuments()`.
- Detail panel for selected row.
- Preview panel from `previewReviewDocument(selected.id)`.
- Approve button enabled only when preview loads successfully.
- Reject form requiring reason.

Also export:

```ts
export function canRenderReviewCenter(capabilities: string[]) {
  return capabilities.includes("documents.approve");
}
```

- [ ] **Step 6: Wire page in app**

Modify `src/app/App.tsx` to render `ReviewCenterPage` for navigation key `review`.

- [ ] **Step 7: Add styles**

Modify `src/app/styles.css` with compact operational styles:

- `.review-layout`
- `.review-queue`
- `.review-detail`
- `.preview-groups`
- `.risk-line`

Keep cards at existing radius and avoid nested cards.

- [ ] **Step 8: Run GREEN tests**

```bash
npm test -- src/app/pages/review/reviewModel.test.ts src/app/pages/ReviewCenterPage.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/pages/ReviewCenterPage.tsx src/app/pages/review src/app/App.tsx src/app/styles.css src/app/pages/review/reviewModel.test.ts src/app/pages/ReviewCenterPage.test.ts
git commit -m "feat: add review center frontend"
```

---

### Task 10: Period Locks Frontend

**Files:**
- Create: `src/app/pages/PeriodLocksPage.tsx`
- Create: `src/app/pages/period-locks/periodLockTypes.ts`
- Create: `src/app/pages/period-locks/periodLockApi.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/styles.css`
- Test: `src/app/pages/PeriodLocksPage.test.ts`

- [ ] **Step 1: Write failing page guard test**

Create `src/app/pages/PeriodLocksPage.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { canLockPeriod, canUnlockPeriod } from "./PeriodLocksPage";

describe("PeriodLocksPage", () => {
  it("guards lock and unlock actions by capability", () => {
    expect(canLockPeriod(["periodLocks.lock"])).toBe(true);
    expect(canLockPeriod(["periodLocks.view"])).toBe(false);
    expect(canUnlockPeriod(["periodLocks.unlock"])).toBe(true);
    expect(canUnlockPeriod(["periodLocks.lock"])).toBe(false);
  });
});
```

- [ ] **Step 2: Run RED test**

```bash
npm test -- src/app/pages/PeriodLocksPage.test.ts
```

Expected: fail because page does not exist.

- [ ] **Step 3: Implement types and API**

Create `src/app/pages/period-locks/periodLockTypes.ts`:

```ts
export interface PeriodLockRow {
  period: string;
  locked_by: string;
  locked_at: string;
  note: string | null;
}
```

Create `src/app/pages/period-locks/periodLockApi.ts`:

```ts
import { getJson, postJson, type ApiEnvelope } from "../../api";
import type { PeriodLockRow } from "./periodLockTypes";

export const listPeriodLocks = () => getJson<ApiEnvelope<PeriodLockRow[]>>("/api/period-locks");
export const lockPeriod = (period: string, note: string) => postJson<ApiEnvelope<{ period: string; status: string }>>("/api/period-locks", { period, note });
export const unlockPeriod = (period: string, reason: string) =>
  fetch(`/api/period-locks/${encodeURIComponent(period)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reason })
  }).then(async (response) => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "请求失败");
    return body as ApiEnvelope<{ period: string; status: string }>;
  });
```

- [ ] **Step 4: Implement page**

Create `src/app/pages/PeriodLocksPage.tsx`:

- `canLockPeriod(capabilities: string[])`
- `canUnlockPeriod(capabilities: string[])`
- list table.
- lock form with month input and note.
- unlock action with reason input.
- no unlock button unless capability includes `periodLocks.unlock`.

- [ ] **Step 5: Wire page in app**

Add navigation target `period-locks` in `src/app/App.tsx`.

- [ ] **Step 6: Run GREEN test**

```bash
npm test -- src/app/pages/PeriodLocksPage.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/pages/PeriodLocksPage.tsx src/app/pages/period-locks src/app/App.tsx src/app/styles.css src/app/pages/PeriodLocksPage.test.ts
git commit -m "feat: add period lock frontend"
```

---

### Task 11: Remove Production Actor Selection from Existing Pages

**Files:**
- Modify: `src/app/pages/DocumentsPage.tsx`
- Modify: `src/app/pages/MasterDataPage.tsx`
- Modify: `src/app/pages/documents/documentEntryModel.ts`
- Modify: `src/app/pages/master-data/masterDataRequests.ts`
- Test: `src/app/pages/DocumentsPage.test.ts`
- Test: `src/app/pages/master-data/masterDataModel.test.ts`

- [ ] **Step 1: Write failing frontend actor tests**

Add to `src/app/pages/DocumentsPage.test.ts`:

```ts
it("builds document payloads without createdBy when using authenticated session", () => {
  const payload = buildDocumentPayload(
    {
      ...createInitialDocumentForm(new Date("2026-04-25T00:00:00.000Z")),
      operatorPersonId: "person_ops",
      projectId: "proj_1",
      merchantId: "merchant_1",
      categoryId: "cat_income",
      accountId: "acct_usdt",
      currencyCode: "USDT",
      amountMajor: "100",
      usdtAmountMajor: "100",
      summary: "Income"
    },
    ""
  );
  expect(payload).not.toHaveProperty("createdBy");
});
```

- [ ] **Step 2: Run RED tests**

```bash
npm test -- src/app/pages/DocumentsPage.test.ts
```

Expected: fail because payload still requires actor.

- [ ] **Step 3: Update document payload model**

Modify `buildDocumentPayload()` so it omits `createdBy` when the actor argument is blank:

```ts
const actor = currentActorId.trim();
if (actor) payload.createdBy = actor;
```

For reversal payload, use the same behavior.

- [ ] **Step 4: Update DocumentsPage**

Remove the current-actor selector section when authenticated session is active. Use capabilities:

- hide create button without `documents.create`.
- hide submit without `documents.submit`.
- hide approve/reject in list unless explicitly keeping shortcut for `documents.approve`.

Pass no actor body for create/submit/approve/reject in production calls.

- [ ] **Step 5: Update MasterDataPage**

Remove current-actor selector for production writes. `masterDataRequests.writeMasterData()` no longer adds `actor`; backend uses session actor.

Gate write buttons by:

- `masterData.write`
- `masterData.managePeopleRoles` for role edits involving admin.

- [ ] **Step 6: Run GREEN frontend tests**

```bash
npm test -- src/app/pages/DocumentsPage.test.ts src/app/pages/master-data/masterDataModel.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/pages/DocumentsPage.tsx src/app/pages/MasterDataPage.tsx src/app/pages/documents/documentEntryModel.ts src/app/pages/master-data/masterDataRequests.ts src/app/pages/DocumentsPage.test.ts src/app/pages/master-data/masterDataModel.test.ts
git commit -m "feat: use session actor in existing pages"
```

---

### Task 12: Deployment Docs, Full Verification, and Browser Smoke

**Files:**
- Modify: `docs/deployment.md`
- Test: full suite and browser smoke

- [ ] **Step 1: Update deployment docs**

Add to `docs/deployment.md`:

```md
## Cloudflare Access

Production deployments must be protected by a Cloudflare Access self-hosted application.

Required Worker variables:

- `AUTH_MODE=access`
- `CF_ACCESS_TEAM_DOMAIN=https://<team-name>.cloudflareaccess.com`
- `CF_ACCESS_AUD=<Application Audience AUD tag>`

The Worker validates `Cf-Access-Jwt-Assertion` on API requests. Do not share the deployed hostname until Access is enabled and at least one `people.login_email` is mapped to an enabled admin.

Local development may use:

- `AUTH_MODE=development`
- `DEV_ACTOR_EMAIL=<local mapped people.login_email>`
```

- [ ] **Step 2: Run focused backend tests**

```bash
npm test -- tests/auth/access.test.ts tests/auth/actorRepository.test.ts tests/auth/permissions.test.ts tests/api/me.test.ts tests/api/review.test.ts tests/api/periodLocks.test.ts tests/api/documents.test.ts tests/api/masterDataGovernance.test.ts tests/api/documentService.test.ts
```

Expected: all listed files PASS.

- [ ] **Step 3: Run focused frontend tests**

```bash
npm test -- src/app/session/sessionModel.test.ts src/app/pages/review/reviewModel.test.ts src/app/pages/ReviewCenterPage.test.ts src/app/pages/PeriodLocksPage.test.ts src/app/pages/DocumentsPage.test.ts src/app/pages/master-data/masterDataModel.test.ts
```

Expected: all listed files PASS.

- [ ] **Step 4: Run full verification**

```bash
npm test
npx tsc --noEmit
npm run build
```

Expected:

- Vitest reports all tests passing.
- TypeScript exits 0.
- Vite build exits 0.

- [ ] **Step 5: Run local D1 migration and seed**

```bash
npm run db:migrate:local
npm run db:seed:local
```

Expected: migrations apply and seed succeeds.

For local smoke with development auth, configure a private `.dev.vars` file or command-line env with:

```text
AUTH_MODE=development
DEV_ACTOR_EMAIL=<your local test email>
```

Then update one test person in local D1 only. Do not commit this email to `scripts/seed-demo.sql`, and do not run this override against remote D1:

```bash
wrangler d1 execute management-ledger-db --local --command "UPDATE people SET login_email = '<your local test email>' WHERE id = '<local test person id>'"
```

- [ ] **Step 6: Start local Worker**

```bash
npm run cf:dev -- --port 8788
```

Expected: Wrangler ready on `http://localhost:8788`.

- [ ] **Step 7: Browser smoke**

Using the in-app browser:

1. Open `http://localhost:8788`.
2. Confirm the app shows current logged-in person from `/api/me`.
3. Confirm no production-style “当前操作人” selector is visible.
4. Create a project income draft as a finance entry or manager.
5. Submit the draft.
6. Open 审核中心 as finance manager.
7. Select the pending draft.
8. Confirm preview shows account impact.
9. Approve it.
10. Confirm document status becomes approved.
11. Open 锁账月结.
12. Lock the current period.
13. Confirm approving another document in that period is blocked.

- [ ] **Step 8: Commit docs and final fixes**

```bash
git add docs/deployment.md scripts/seed-demo.sql
git commit -m "docs: document access auth deployment"
```

If no docs or seed changes remain, skip this commit.

- [ ] **Step 9: Final status**

Run:

```bash
git status --short
```

Expected: clean working tree.

---

## Self-Review Checklist

- Every production write API has an authenticated actor.
- Every production write API has a capability check.
- The plan adds `people.login_email` and keeps non-login business people possible.
- The plan validates Cloudflare Access JWT instead of trusting ordinary email headers.
- Review preview reuses service planning and does not write effects.
- Period lock/unlock writes audit records.
- Frontend capability gating is UX only; backend remains authoritative.
- Full verification includes tests, typecheck, build, D1 migration, local Worker, and browser smoke.
