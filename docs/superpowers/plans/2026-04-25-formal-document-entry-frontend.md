# Formal Document Entry Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current engineering-style document form with a formal business-entry flow where people, projects, merchants, accounts, categories, currencies, and original documents are selected from controlled data.

**Architecture:** Add a document-entry option API backed by existing master data tables and approved documents. Move frontend document-entry rules into focused model modules, then rebuild `DocumentsPage` around current actor selection, type-specific field rendering, and controlled select inputs.

**Tech Stack:** Cloudflare Workers, D1, TypeScript, React 19, Vite, Vitest.

---

## Source Spec

- `docs/superpowers/specs/2026-04-25-formal-document-entry-frontend-design.md`

## File Structure

Backend option layer:

- Modify `src/repositories/masterDataRepository.ts`
  - Add option row interfaces for people, projects, merchants, accounts, categories, and enabled currencies.
  - Add list methods that only return enabled or active rows.
- Modify `src/repositories/documentRepository.ts`
  - Add original-document option row type.
  - Add `listOriginalDocumentOptions()` for approved original documents.
- Create `src/api/documentEntryOptions.ts`
  - Expose `/api/document-entry/options`.
  - Expose `/api/document-entry/original-documents`.
- Modify `src/worker/router.ts`
  - Register the new option routes.
- Test `tests/api/masterDataRepository.test.ts`
- Test `tests/api/documentRepository.test.ts`
- Create `tests/api/documentEntryOptions.test.ts`

Frontend document-entry model:

- Create `src/app/pages/documents/documentEntryTypes.ts`
  - Shared option, form, field, and validation types.
- Create `src/app/pages/documents/documentEntryModel.ts`
  - Field visibility, filtering, validation, date helpers, amount conversion, and payload building.
- Create `src/app/pages/documents/documentEntryModel.test.ts`
  - Unit coverage for the formal entry rules.

Frontend UI:

- Create `src/app/pages/documents/DocumentEntrySelectors.tsx`
  - Reusable select components and option-label helpers.
- Create `src/app/pages/documents/DocumentTypeFields.tsx`
  - Type-specific field renderer.
- Modify `src/app/pages/DocumentsPage.tsx`
  - Load options.
  - Add current actor selector.
  - Replace free-text ID inputs with select controls.
  - Use `people.id` for create, submit, approve, and reject actors.
- Modify `src/app/pages/DocumentsPage.test.ts`
  - Keep existing payload coverage.
  - Add current-actor payload coverage.
- Modify `src/app/styles.css`
  - Add compact layout styles for current actor, typed forms, field errors, and disabled option notices.

Final verification:

- `npm run test`
- `npx tsc --noEmit`
- `npm run build`
- Browser smoke on `http://localhost:8787/`

---

### Task 1: Add Master Data Option Queries

**Files:**
- Modify: `src/repositories/masterDataRepository.ts`
- Test: `tests/api/masterDataRepository.test.ts`

- [ ] **Step 1: Write failing repository tests**

Append these tests inside the existing `describe("MasterDataRepository", () => { })` block in `tests/api/masterDataRepository.test.ts`:

```ts
  it("lists enabled people options ordered by name", async () => {
    let capturedSql = "";
    const repo = new MasterDataRepository(
      mockDb({
        rows: [{ id: "person_1", name: "Alice", alias: "ali", roles_json: "[\"finance\"]", is_enabled: 1 }],
        onSql: (sql) => (capturedSql = sql)
      })
    );

    await expect(repo.listPeopleOptions()).resolves.toEqual([
      { id: "person_1", name: "Alice", alias: "ali", roles_json: "[\"finance\"]", is_enabled: 1 }
    ]);
    expect(capturedSql.replace(/\s+/g, " ").toLowerCase()).toContain("where is_enabled = 1");
    expect(capturedSql.replace(/\s+/g, " ").toLowerCase()).toContain("order by name, id");
  });

  it("lists active project merchant account and enabled category options", async () => {
    const sqlStatements: string[] = [];
    const repo = new MasterDataRepository(
      mockDb({
        rows: [],
        onSql: (sql) => sqlStatements.push(sql)
      })
    );

    await repo.listProjectOptions();
    await repo.listMerchantOptions();
    await repo.listAccountOptions();
    await repo.listCategoryOptions();
    await repo.listCurrencyOptions();

    const normalized = sqlStatements.join(" ").replace(/\s+/g, " ").toLowerCase();
    expect(normalized).toContain("from projects");
    expect(normalized).toContain("where status = 'active'");
    expect(normalized).toContain("from merchants");
    expect(normalized).toContain("from accounts");
    expect(normalized).toContain("from categories");
    expect(normalized).toContain("where is_enabled = 1");
    expect(normalized).toContain("from currencies");
  });
```

Update the local `mockDb()` helper in the same test file to capture SQL:

```ts
function mockDb(options: {
  rows?: unknown[];
  firstRow?: unknown | null;
  runResult?: D1Result;
  onSql?: (sql: string) => void;
}): D1Database {
  return {
    prepare: (sql: string) => {
      options.onSql?.(sql);
      return {
        bind() {
          return this;
        },
        all: async () => ({ success: true, results: options.rows ?? [] }),
        first: async () => options.firstRow ?? null,
        run: async () => options.runResult ?? ({ success: true } as D1Result)
      } as unknown as D1PreparedStatement;
    }
  } as unknown as D1Database;
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npm run test -- tests/api/masterDataRepository.test.ts
```

Expected: FAIL with TypeScript errors or runtime errors indicating `listPeopleOptions`, `listProjectOptions`, `listMerchantOptions`, `listAccountOptions`, `listCategoryOptions`, and `listCurrencyOptions` do not exist.

- [ ] **Step 3: Implement repository option methods**

In `src/repositories/masterDataRepository.ts`, add these interfaces after `CurrencyRow`:

```ts
export interface PersonOptionRow {
  id: string;
  name: string;
  alias: string | null;
  roles_json: string;
  is_enabled: number;
}

export interface ProjectOptionRow {
  id: string;
  code: string;
  name: string;
  owner_person_id: string | null;
  status: string;
}

export interface MerchantOptionRow {
  id: string;
  code: string;
  name: string;
  project_id: string;
  merchant_type: string | null;
  status: string;
}

export interface AccountOptionRow {
  id: string;
  name: string;
  account_type: string;
  currency_code: string;
  owner_person_id: string | null;
  is_company_account: number;
  allow_negative: number;
  status: string;
}

export interface CategoryOptionRow {
  id: string;
  name: string;
  parent_id: string | null;
  category_type: string;
  direction: string;
  affects_expense_report: number;
  affects_project_report: number;
  requires_merchant: number;
  requires_person: number;
  requires_borrower: number;
  is_enabled: number;
}
```

Add these methods inside `MasterDataRepository`:

```ts
  listPeopleOptions(): Promise<PersonOptionRow[]> {
    return all<PersonOptionRow>(
      this.db.prepare(`
        SELECT id, name, alias, roles_json, is_enabled
        FROM people
        WHERE is_enabled = 1
        ORDER BY name, id
      `)
    );
  }

  listProjectOptions(): Promise<ProjectOptionRow[]> {
    return all<ProjectOptionRow>(
      this.db.prepare(`
        SELECT id, code, name, owner_person_id, status
        FROM projects
        WHERE status = 'active'
        ORDER BY code, name, id
      `)
    );
  }

  listMerchantOptions(): Promise<MerchantOptionRow[]> {
    return all<MerchantOptionRow>(
      this.db.prepare(`
        SELECT id, code, name, project_id, merchant_type, status
        FROM merchants
        WHERE status = 'active'
        ORDER BY project_id, code, name, id
      `)
    );
  }

  listAccountOptions(): Promise<AccountOptionRow[]> {
    return all<AccountOptionRow>(
      this.db.prepare(`
        SELECT
          id, name, account_type, currency_code, owner_person_id,
          is_company_account, allow_negative, status
        FROM accounts
        WHERE status = 'active'
        ORDER BY is_company_account DESC, account_type, name, id
      `)
    );
  }

  listCategoryOptions(): Promise<CategoryOptionRow[]> {
    return all<CategoryOptionRow>(
      this.db.prepare(`
        SELECT
          id, name, parent_id, category_type, direction,
          affects_expense_report, affects_project_report,
          requires_merchant, requires_person, requires_borrower, is_enabled
        FROM categories
        WHERE is_enabled = 1
        ORDER BY category_type, name, id
      `)
    );
  }

  listCurrencyOptions(): Promise<CurrencyRow[]> {
    return all<CurrencyRow>(
      this.db.prepare(`
        SELECT code, name, minor_units, is_enabled
        FROM currencies
        WHERE is_enabled = 1
        ORDER BY code
      `)
    );
  }
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npm run test -- tests/api/masterDataRepository.test.ts
```

Expected: PASS for all `MasterDataRepository` tests.

- [ ] **Step 5: Commit**

```bash
git add src/repositories/masterDataRepository.ts tests/api/masterDataRepository.test.ts
git commit -m "feat: add document entry master data options"
```

---

### Task 2: Add Document Entry Option APIs

**Files:**
- Modify: `src/repositories/documentRepository.ts`
- Create: `src/api/documentEntryOptions.ts`
- Modify: `src/worker/router.ts`
- Test: `tests/api/documentRepository.test.ts`
- Create: `tests/api/documentEntryOptions.test.ts`

- [ ] **Step 1: Write failing document repository tests**

Append this test inside the existing `describe("DocumentRepository", () => { })` block in `tests/api/documentRepository.test.ts`:

```ts
  it("lists approved original document options and excludes approved reversals", async () => {
    let sql = "";
    let boundValues: unknown[] = [];
    const repo = new DocumentRepository(
      mockDb({
        onSql: (value) => (sql = value),
        onBind: (values) => (boundValues = values)
      })
    );

    await repo.listOriginalDocumentOptions({ documentType: "project_income" });

    const normalized = sql.replace(/\s+/g, " ").toLowerCase();
    expect(normalized).toContain("from documents d");
    expect(normalized).toContain("d.status = 'approved'");
    expect(normalized).toContain("d.action_type != 'reversal'");
    expect(normalized).toContain("not exists");
    expect(normalized).toContain("reversal.original_document_id = d.id");
    expect(normalized).toContain("reversal.status = 'approved'");
    expect(normalized).toContain("d.document_type = ?");
    expect(boundValues).toEqual(["project_income"]);
  });
```

- [ ] **Step 2: Write failing API tests**

Create `tests/api/documentEntryOptions.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { listDocumentEntryOptions, listOriginalDocuments } from "../../src/api/documentEntryOptions";
import { route } from "../../src/worker/router";
import type { Env } from "../../src/worker/env";

function mockEnv(options: { allQueues?: unknown[][] } = {}): Env {
  return {
    DB: {
      prepare: () =>
        ({
          bind() {
            return this;
          },
          all: async () => ({ success: true, results: options.allQueues?.shift() ?? [] }),
          first: async () => null,
          run: async () => ({ success: true }) as D1Result
        }) as unknown as D1PreparedStatement
    } as unknown as D1Database,
    ASSETS: { fetch: async () => new Response("asset") } as unknown as Fetcher
  };
}

describe("document entry option API", () => {
  it("returns all controlled option groups", async () => {
    const response = await listDocumentEntryOptions({
      request: new Request("https://ledger.test/api/document-entry/options"),
      env: mockEnv({
        allQueues: [
          [{ id: "person_1", name: "Alice", alias: null, roles_json: "[]", is_enabled: 1 }],
          [{ id: "proj_1", code: "P1", name: "Project", owner_person_id: null, status: "active" }],
          [{ id: "merchant_1", code: "M1", name: "Merchant", project_id: "proj_1", merchant_type: "site", status: "active" }],
          [{ id: "acct_1", name: "AED Reserve", account_type: "currency_reserve", currency_code: "AED", owner_person_id: null, is_company_account: 1, allow_negative: 0, status: "active" }],
          [{ code: "AED", name: "迪拉姆", minor_units: 2, is_enabled: 1 }],
          [{ id: "cat_1", name: "Income", parent_id: null, category_type: "income", direction: "in", affects_expense_report: 0, affects_project_report: 1, requires_merchant: 1, requires_person: 0, requires_borrower: 0, is_enabled: 1 }]
        ]
      }),
      params: {}
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: {
        people: [{ id: "person_1", name: "Alice", alias: null, roles_json: "[]", is_enabled: 1 }],
        projects: [{ id: "proj_1", code: "P1", name: "Project", owner_person_id: null, status: "active" }],
        merchants: [{ id: "merchant_1", code: "M1", name: "Merchant", project_id: "proj_1", merchant_type: "site", status: "active" }],
        accounts: [{ id: "acct_1", name: "AED Reserve", account_type: "currency_reserve", currency_code: "AED", owner_person_id: null, is_company_account: 1, allow_negative: 0, status: "active" }],
        currencies: [{ code: "AED", name: "迪拉姆", minor_units: 2, is_enabled: 1 }],
        categories: [{ id: "cat_1", name: "Income", parent_id: null, category_type: "income", direction: "in", affects_expense_report: 0, affects_project_report: 1, requires_merchant: 1, requires_person: 0, requires_borrower: 0, is_enabled: 1 }]
      }
    });
  });

  it("returns original document options filtered by document type", async () => {
    const response = await listOriginalDocuments({
      request: new Request("https://ledger.test/api/document-entry/original-documents?documentType=project_income"),
      env: mockEnv({
        allQueues: [[{ id: "doc_1", document_no: "DOC-1", document_type: "project_income", business_date: "2026-04-24", period: "2026-04", summary: "Income" }]]
      }),
      params: {}
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: [{ id: "doc_1", document_no: "DOC-1", document_type: "project_income", business_date: "2026-04-24", period: "2026-04", summary: "Income" }]
    });
  });

  it("routes document entry option endpoints", async () => {
    const optionsResponse = await route(new Request("https://ledger.test/api/document-entry/options"), mockEnv());
    const originalsResponse = await route(new Request("https://ledger.test/api/document-entry/original-documents"), mockEnv());

    expect(optionsResponse.status).toBe(200);
    expect(originalsResponse.status).toBe(200);
  });
});
```

- [ ] **Step 3: Run focused tests and verify RED**

Run:

```bash
npm run test -- tests/api/documentRepository.test.ts tests/api/documentEntryOptions.test.ts
```

Expected: FAIL because `listOriginalDocumentOptions()` and `src/api/documentEntryOptions.ts` do not exist.

- [ ] **Step 4: Implement original document query**

In `src/repositories/documentRepository.ts`, add this interface near `DocumentSummaryRow`:

```ts
export interface OriginalDocumentOptionRow {
  id: string;
  document_no: string;
  document_type: DocumentType;
  business_date: string;
  period: string;
  summary: string;
}
```

Add this method inside `DocumentRepository`:

```ts
  listOriginalDocumentOptions(input: { documentType?: DocumentType | null } = {}): Promise<OriginalDocumentOptionRow[]> {
    const documentType = input.documentType?.trim() || null;
    const typeFilter = documentType ? "AND d.document_type = ?" : "";
    const bindings = documentType ? [documentType] : [];

    return all<OriginalDocumentOptionRow>(
      this.db
        .prepare(`
          SELECT d.id, d.document_no, d.document_type, d.business_date, d.period, d.summary
          FROM documents d
          WHERE d.status = 'approved'
            AND d.action_type != 'reversal'
            ${typeFilter}
            AND NOT EXISTS (
              SELECT 1
              FROM documents reversal
              WHERE reversal.original_document_id = d.id
                AND reversal.action_type = 'reversal'
                AND reversal.status = 'approved'
            )
          ORDER BY d.business_date DESC, d.created_at DESC, d.id
          LIMIT 100
        `)
        .bind(...bindings)
    );
  }
```

- [ ] **Step 5: Implement API handlers**

Create `src/api/documentEntryOptions.ts`:

```ts
import type { DocumentType } from "../domain/types";
import { DocumentRepository } from "../repositories/documentRepository";
import { MasterDataRepository } from "../repositories/masterDataRepository";
import type { Handler } from "../worker/env";

const documentTypes = new Set<DocumentType>([
  "project_income",
  "exchange",
  "account_transfer",
  "petty_cash_issue",
  "petty_cash_return",
  "petty_cash_reimbursement",
  "loan_out",
  "loan_repayment",
  "loan_writeoff",
  "manual_adjustment"
]);

function optionalDocumentType(value: string | null): DocumentType | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return documentTypes.has(trimmed as DocumentType) ? (trimmed as DocumentType) : null;
}

export const listDocumentEntryOptions: Handler = async ({ env }) => {
  const repo = new MasterDataRepository(env.DB);
  const [people, projects, merchants, accounts, currencies, categories] = await Promise.all([
    repo.listPeopleOptions(),
    repo.listProjectOptions(),
    repo.listMerchantOptions(),
    repo.listAccountOptions(),
    repo.listCurrencyOptions(),
    repo.listCategoryOptions()
  ]);

  return Response.json({ data: { people, projects, merchants, accounts, currencies, categories } });
};

export const listOriginalDocuments: Handler = async ({ request, env }) => {
  const url = new URL(request.url);
  const documentType = optionalDocumentType(url.searchParams.get("documentType"));
  const repo = new DocumentRepository(env.DB);

  return Response.json({ data: await repo.listOriginalDocumentOptions({ documentType }) });
};
```

- [ ] **Step 6: Register routes**

Modify `src/worker/router.ts`:

```ts
import { listDocumentEntryOptions, listOriginalDocuments } from "../api/documentEntryOptions";
```

Add these route definitions before the `/api/documents` routes:

```ts
  defineRoute("GET", "/api/document-entry/options", listDocumentEntryOptions),
  defineRoute("GET", "/api/document-entry/original-documents", listOriginalDocuments),
```

- [ ] **Step 7: Run focused tests and verify GREEN**

Run:

```bash
npm run test -- tests/api/documentRepository.test.ts tests/api/documentEntryOptions.test.ts
```

Expected: PASS for both files.

- [ ] **Step 8: Commit**

```bash
git add src/repositories/documentRepository.ts src/api/documentEntryOptions.ts src/worker/router.ts tests/api/documentRepository.test.ts tests/api/documentEntryOptions.test.ts
git commit -m "feat: expose document entry options"
```

---

### Task 3: Add Frontend Document Entry Model

**Files:**
- Create: `src/app/pages/documents/documentEntryTypes.ts`
- Create: `src/app/pages/documents/documentEntryModel.ts`
- Create: `src/app/pages/documents/documentEntryModel.test.ts`
- Modify: `src/app/pages/DocumentsPage.test.ts`

- [ ] **Step 1: Write failing model tests**

Create `src/app/pages/documents/documentEntryModel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  amountMajorToMinor,
  buildDocumentPayload,
  categoryOptionsForDocumentType,
  createInitialDocumentForm,
  getVisibleFieldKeys,
  merchantOptionsForProject,
  pettyCashAccountsForPerson,
  validateDocumentForm
} from "./documentEntryModel";
import type { DocumentEntryOptions } from "./documentEntryTypes";

const options: DocumentEntryOptions = {
  people: [{ id: "person_ops", name: "Ops User", alias: "ops", roles_json: "[\"logistics\"]", is_enabled: 1 }],
  projects: [{ id: "proj_1", code: "P1", name: "Project One", owner_person_id: null, status: "active" }],
  merchants: [
    { id: "merchant_1", code: "M1", name: "Merchant One", project_id: "proj_1", merchant_type: "site", status: "active" },
    { id: "merchant_2", code: "M2", name: "Merchant Two", project_id: "proj_2", merchant_type: "site", status: "active" }
  ],
  accounts: [
    { id: "acct_company_aed", name: "AED Reserve", account_type: "currency_reserve", currency_code: "AED", owner_person_id: null, is_company_account: 1, allow_negative: 0, status: "active" },
    { id: "acct_petty_ops", name: "Ops AED Petty", account_type: "petty_cash", currency_code: "AED", owner_person_id: "person_ops", is_company_account: 0, allow_negative: 1, status: "active" }
  ],
  currencies: [{ code: "AED", name: "迪拉姆", minor_units: 2, is_enabled: 1 }],
  categories: [
    { id: "cat_income", name: "Income", parent_id: null, category_type: "income", direction: "in", affects_expense_report: 0, affects_project_report: 1, requires_merchant: 1, requires_person: 0, requires_borrower: 0, is_enabled: 1 },
    { id: "cat_expense", name: "Expense", parent_id: null, category_type: "expense", direction: "out", affects_expense_report: 1, affects_project_report: 0, requires_merchant: 0, requires_person: 1, requires_borrower: 0, is_enabled: 1 }
  ]
};

describe("document entry model", () => {
  it("keeps project income fields business-specific", () => {
    expect(getVisibleFieldKeys("project_income", "normal")).toEqual([
      "operatorPersonId",
      "projectId",
      "merchantId",
      "categoryId",
      "accountId",
      "currencyCode",
      "amountMajor",
      "usdtAmountMajor",
      "summary"
    ]);
  });

  it("adds original document selection for reversal actions", () => {
    expect(getVisibleFieldKeys("project_income", "reversal")[0]).toBe("originalDocumentId");
  });

  it("filters merchants by selected project", () => {
    expect(merchantOptionsForProject(options, "proj_1").map((merchant) => merchant.id)).toEqual(["merchant_1"]);
  });

  it("filters petty cash accounts by selected person", () => {
    expect(pettyCashAccountsForPerson(options, "person_ops").map((account) => account.id)).toEqual(["acct_petty_ops"]);
  });

  it("filters categories for reimbursement documents", () => {
    expect(categoryOptionsForDocumentType(options, "petty_cash_reimbursement").map((category) => category.id)).toEqual(["cat_expense"]);
  });

  it("requires current actor before creating payloads", () => {
    const form = createInitialDocumentForm(new Date("2026-04-24T10:00:00Z"));
    expect(validateDocumentForm(form, options, "")).toContain("请选择当前操作人");
  });

  it("builds project income payload using current actor person id", () => {
    const payload = buildDocumentPayload(
      {
        ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
        documentType: "project_income",
        actionType: "normal",
        businessDate: "2026-04-24",
        period: "2026-04",
        operatorPersonId: "person_ops",
        projectId: "proj_1",
        merchantId: "merchant_1",
        categoryId: "cat_income",
        accountId: "acct_company_aed",
        currencyCode: "AED",
        amountMajor: "120.50",
        usdtAmountMajor: "32.84",
        summary: "Merchant income"
      },
      "person_ops"
    );

    expect(payload).toEqual({
      documentType: "project_income",
      actionType: "normal",
      businessDate: "2026-04-24",
      period: "2026-04",
      operatorPersonId: "person_ops",
      projectId: "proj_1",
      merchantId: "merchant_1",
      categoryId: "cat_income",
      summary: "Merchant income",
      createdBy: "person_ops",
      lines: [{ lineType: "main", accountId: "acct_company_aed", currencyCode: "AED", amountMinor: 12050, usdtAmountMinor: 3284 }]
    });
  });

  it("omits account id for loan writeoff payloads", () => {
    const payload = buildDocumentPayload(
      {
        ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
        documentType: "loan_writeoff",
        businessDate: "2026-04-24",
        period: "2026-04",
        borrowerPersonId: "person_ops",
        categoryId: "cat_expense",
        currencyCode: "AED",
        amountMajor: "50",
        summary: "Write off"
      },
      "person_ops"
    );

    expect(payload).toEqual({
      documentType: "loan_writeoff",
      actionType: "normal",
      businessDate: "2026-04-24",
      period: "2026-04",
      categoryId: "cat_expense",
      summary: "Write off",
      createdBy: "person_ops",
      lines: [{ lineType: "main", currencyCode: "AED", amountMinor: 5000, borrowerPersonId: "person_ops" }]
    });
  });

  it("converts decimal amounts to minor units", () => {
    expect(amountMajorToMinor("10.05")).toBe(1005);
    expect(() => amountMajorToMinor("10.005")).toThrow("金额格式必须最多两位小数");
  });
});
```

- [ ] **Step 2: Run the model test and verify RED**

Run:

```bash
npm run test -- src/app/pages/documents/documentEntryModel.test.ts
```

Expected: FAIL because `documentEntryModel.ts` and `documentEntryTypes.ts` do not exist.

- [ ] **Step 3: Create shared frontend types**

Create `src/app/pages/documents/documentEntryTypes.ts`:

```ts
import type { ActionType, DocumentType } from "../../../domain/types";

export interface PersonOption {
  id: string;
  name: string;
  alias: string | null;
  roles_json: string;
  is_enabled: number;
}

export interface ProjectOption {
  id: string;
  code: string;
  name: string;
  owner_person_id: string | null;
  status: string;
}

export interface MerchantOption {
  id: string;
  code: string;
  name: string;
  project_id: string;
  merchant_type: string | null;
  status: string;
}

export interface AccountOption {
  id: string;
  name: string;
  account_type: string;
  currency_code: string;
  owner_person_id: string | null;
  is_company_account: number;
  allow_negative: number;
  status: string;
}

export interface CurrencyOption {
  code: string;
  name: string;
  minor_units: number;
  is_enabled: number;
}

export interface CategoryOption {
  id: string;
  name: string;
  parent_id: string | null;
  category_type: string;
  direction: string;
  affects_expense_report: number;
  affects_project_report: number;
  requires_merchant: number;
  requires_person: number;
  requires_borrower: number;
  is_enabled: number;
}

export interface OriginalDocumentOption {
  id: string;
  document_no: string;
  document_type: DocumentType;
  business_date: string;
  period: string;
  summary: string;
}

export interface DocumentEntryOptions {
  people: PersonOption[];
  projects: ProjectOption[];
  merchants: MerchantOption[];
  accounts: AccountOption[];
  currencies: CurrencyOption[];
  categories: CategoryOption[];
}

export type DocumentFieldKey =
  | "originalDocumentId"
  | "operatorPersonId"
  | "projectId"
  | "merchantId"
  | "categoryId"
  | "accountId"
  | "counterpartyAccountId"
  | "currencyCode"
  | "amountMajor"
  | "usdtAmountMajor"
  | "personId"
  | "borrowerPersonId"
  | "summary";

export interface DocumentEntryForm {
  documentType: DocumentType;
  actionType: ActionType;
  businessDate: string;
  period: string;
  originalDocumentId: string;
  operatorPersonId: string;
  projectId: string;
  merchantId: string;
  categoryId: string;
  accountId: string;
  counterpartyAccountId: string;
  currencyCode: string;
  amountMajor: string;
  usdtAmountMajor: string;
  personId: string;
  borrowerPersonId: string;
  summary: string;
}
```

- [ ] **Step 4: Implement the document entry model**

Create `src/app/pages/documents/documentEntryModel.ts`:

```ts
import type { ActionType, DocumentType } from "../../../domain/types";
import type {
  AccountOption,
  CategoryOption,
  DocumentEntryForm,
  DocumentEntryOptions,
  DocumentFieldKey,
  MerchantOption
} from "./documentEntryTypes";

function padCalendarPart(value: number) {
  return String(value).padStart(2, "0");
}

export function formatLocalDateInputValue(date: Date) {
  return `${date.getFullYear()}-${padCalendarPart(date.getMonth() + 1)}-${padCalendarPart(date.getDate())}`;
}

export function formatLocalMonthInputValue(date: Date) {
  return `${date.getFullYear()}-${padCalendarPart(date.getMonth() + 1)}`;
}

export function createInitialDocumentForm(date = new Date()): DocumentEntryForm {
  return {
    documentType: "project_income",
    actionType: "normal",
    businessDate: formatLocalDateInputValue(date),
    period: formatLocalMonthInputValue(date),
    originalDocumentId: "",
    operatorPersonId: "",
    projectId: "",
    merchantId: "",
    categoryId: "",
    accountId: "",
    counterpartyAccountId: "",
    currencyCode: "AED",
    amountMajor: "",
    usdtAmountMajor: "",
    personId: "",
    borrowerPersonId: "",
    summary: ""
  };
}

export function isOriginalDocumentRequired(actionType: ActionType) {
  return actionType === "correction" || actionType === "reversal";
}

const baseFieldsByType: Record<DocumentType, DocumentFieldKey[]> = {
  project_income: ["operatorPersonId", "projectId", "merchantId", "categoryId", "accountId", "currencyCode", "amountMajor", "usdtAmountMajor", "summary"],
  exchange: ["operatorPersonId", "counterpartyAccountId", "accountId", "currencyCode", "amountMajor", "usdtAmountMajor", "categoryId", "summary"],
  account_transfer: ["operatorPersonId", "accountId", "counterpartyAccountId", "currencyCode", "amountMajor", "summary"],
  petty_cash_issue: ["operatorPersonId", "personId", "accountId", "counterpartyAccountId", "currencyCode", "amountMajor", "summary"],
  petty_cash_return: ["operatorPersonId", "personId", "accountId", "counterpartyAccountId", "currencyCode", "amountMajor", "summary"],
  petty_cash_reimbursement: ["personId", "projectId", "merchantId", "categoryId", "accountId", "currencyCode", "amountMajor", "summary"],
  loan_out: ["operatorPersonId", "borrowerPersonId", "accountId", "currencyCode", "amountMajor", "usdtAmountMajor", "categoryId", "summary"],
  loan_repayment: ["operatorPersonId", "borrowerPersonId", "accountId", "currencyCode", "amountMajor", "originalDocumentId", "summary"],
  loan_writeoff: ["operatorPersonId", "borrowerPersonId", "projectId", "categoryId", "currencyCode", "amountMajor", "originalDocumentId", "summary"],
  manual_adjustment: ["operatorPersonId", "projectId", "categoryId", "accountId", "currencyCode", "amountMajor", "usdtAmountMajor", "summary"]
};

export function getVisibleFieldKeys(documentType: DocumentType, actionType: ActionType): DocumentFieldKey[] {
  const fields = baseFieldsByType[documentType];
  if (isOriginalDocumentRequired(actionType) && !fields.includes("originalDocumentId")) {
    return ["originalDocumentId", ...fields];
  }
  return fields;
}

export function merchantOptionsForProject(options: DocumentEntryOptions, projectId: string): MerchantOption[] {
  return options.merchants.filter((merchant) => merchant.project_id === projectId);
}

export function pettyCashAccountsForPerson(options: DocumentEntryOptions, personId: string): AccountOption[] {
  return options.accounts.filter((account) => account.account_type === "petty_cash" && account.owner_person_id === personId);
}

export function companyAccounts(options: DocumentEntryOptions): AccountOption[] {
  return options.accounts.filter((account) => account.is_company_account);
}

export function accountCurrencyCode(options: DocumentEntryOptions, accountId: string) {
  return options.accounts.find((account) => account.id === accountId)?.currency_code ?? "";
}

export function categoryOptionsForDocumentType(options: DocumentEntryOptions, documentType: DocumentType): CategoryOption[] {
  if (documentType === "project_income") return options.categories.filter((category) => category.category_type === "income");
  if (documentType === "petty_cash_reimbursement") return options.categories.filter((category) => category.affects_expense_report);
  if (documentType === "loan_writeoff") return options.categories.filter((category) => category.category_type === "expense" || category.category_type === "loss");
  if (documentType === "exchange") return options.categories.filter((category) => category.category_type === "exchange");
  if (documentType === "loan_out" || documentType === "loan_repayment") return options.categories.filter((category) => category.category_type === "loan");
  return options.categories;
}

const fieldLabels: Record<DocumentFieldKey, string> = {
  originalDocumentId: "原单据",
  operatorPersonId: "经办人",
  projectId: "项目",
  merchantId: "商户",
  categoryId: "科目",
  accountId: "账户",
  counterpartyAccountId: "对方账户",
  currencyCode: "币种",
  amountMajor: "金额",
  usdtAmountMajor: "USDT成本",
  personId: "人员",
  borrowerPersonId: "借款人",
  summary: "摘要"
};

function optionalString(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function amountMajorToMinor(value: string) {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error("金额格式必须最多两位小数");
  const [major, minor = ""] = normalized.split(".");
  return Number(major) * 100 + Number(minor.padEnd(2, "0"));
}

export function validateDocumentForm(form: DocumentEntryForm, options: DocumentEntryOptions, currentActorId: string): string[] {
  const errors: string[] = [];
  if (!currentActorId.trim()) errors.push("请选择当前操作人");
  if (options.people.length === 0) errors.push("请先到基础资料维护人员");
  if (options.currencies.length === 0) errors.push("请先到基础资料维护币种");
  if (isOriginalDocumentRequired(form.actionType) && !form.originalDocumentId.trim()) errors.push("请选择原单据");
  for (const field of getVisibleFieldKeys(form.documentType, form.actionType)) {
    if (field === "merchantId" && form.documentType === "petty_cash_reimbursement") continue;
    if (field === "operatorPersonId" && form.documentType === "petty_cash_reimbursement") continue;
    if (field === "projectId" && form.documentType === "loan_writeoff") continue;
    if (field === "originalDocumentId" && !isOriginalDocumentRequired(form.actionType)) continue;
    if (!String(form[field]).trim()) errors.push(`请选择或填写${fieldLabels[field]}`);
  }
  return errors;
}

export function buildDocumentPayload(form: DocumentEntryForm, currentActorId: string) {
  const line: Record<string, unknown> = {
    lineType: "main",
    currencyCode: form.currencyCode.trim().toUpperCase(),
    amountMinor: amountMajorToMinor(form.amountMajor)
  };

  if (form.documentType !== "loan_writeoff") line.accountId = form.accountId.trim();
  if (optionalString(form.counterpartyAccountId)) line.counterpartyAccountId = form.counterpartyAccountId.trim();
  if (optionalString(form.personId)) line.personId = form.personId.trim();
  if (optionalString(form.borrowerPersonId)) line.borrowerPersonId = form.borrowerPersonId.trim();
  if (optionalString(form.usdtAmountMajor)) line.usdtAmountMinor = amountMajorToMinor(form.usdtAmountMajor);

  const payload: Record<string, unknown> = {
    documentType: form.documentType,
    actionType: form.actionType,
    businessDate: form.businessDate,
    period: form.period,
    summary: form.summary.trim(),
    createdBy: currentActorId.trim(),
    lines: [line]
  };

  for (const [key, value] of Object.entries({
    originalDocumentId: optionalString(form.originalDocumentId),
    operatorPersonId: optionalString(form.operatorPersonId),
    projectId: optionalString(form.projectId),
    merchantId: optionalString(form.merchantId),
    categoryId: optionalString(form.categoryId)
  })) {
    if (value) payload[key] = value;
  }

  return payload;
}
```

- [ ] **Step 5: Preserve existing public helper imports**

Modify `src/app/pages/DocumentsPage.test.ts` imports so helper tests can import moved helpers from the model:

```ts
import {
  amountMajorToMinor,
  buildDocumentPayload,
  formatLocalDateInputValue,
  formatLocalMonthInputValue,
  isOriginalDocumentRequired
} from "./documents/documentEntryModel";
```

Keep `canSubmitDocument` and `canApproveDocument` imported from `./DocumentsPage` until Task 5 moves no more helpers.

Update existing `buildDocumentPayload()` test calls to pass the current actor as the second argument:

```ts
buildDocumentPayload({ ...formFields }, "user_1")
```

Remove `createdBy` from each form object passed into `buildDocumentPayload()`, because the model now receives it from `currentActorId`.

- [ ] **Step 6: Run focused tests and verify GREEN**

Run:

```bash
npm run test -- src/app/pages/documents/documentEntryModel.test.ts src/app/pages/DocumentsPage.test.ts
```

Expected: PASS for the model tests and existing document page helper tests.

- [ ] **Step 7: Commit**

```bash
git add src/app/pages/documents/documentEntryTypes.ts src/app/pages/documents/documentEntryModel.ts src/app/pages/documents/documentEntryModel.test.ts src/app/pages/DocumentsPage.test.ts
git commit -m "feat: model formal document entry rules"
```

---

### Task 4: Add Reusable Document Selectors

**Files:**
- Create: `src/app/pages/documents/DocumentEntrySelectors.tsx`
- Create: `src/app/pages/documents/DocumentTypeFields.tsx`
- Modify: `src/app/styles.css`

- [ ] **Step 1: Create selector components**

Create `src/app/pages/documents/DocumentEntrySelectors.tsx`:

```tsx
import type {
  AccountOption,
  CategoryOption,
  CurrencyOption,
  MerchantOption,
  OriginalDocumentOption,
  PersonOption,
  ProjectOption
} from "./documentEntryTypes";

interface SelectFieldProps<T extends { id?: string; code?: string }> {
  label: string;
  value: string;
  options: T[];
  getValue: (option: T) => string;
  getLabel: (option: T) => string;
  onChange: (value: string) => void;
  required?: boolean;
  disabled?: boolean;
  emptyLabel?: string;
}

export function SelectField<T extends { id?: string; code?: string }>({
  label,
  value,
  options,
  getValue,
  getLabel,
  onChange,
  required = false,
  disabled = false,
  emptyLabel = "请选择"
}: SelectFieldProps<T>) {
  return (
    <label>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)} required={required} disabled={disabled}>
        <option value="">{emptyLabel}</option>
        {options.map((option) => {
          const optionValue = getValue(option);
          return (
            <option key={optionValue} value={optionValue}>
              {getLabel(option)}
            </option>
          );
        })}
      </select>
    </label>
  );
}

export function personLabel(person: PersonOption) {
  return person.alias ? `${person.name} / ${person.alias}` : person.name;
}

export function projectLabel(project: ProjectOption) {
  return `${project.code} / ${project.name}`;
}

export function merchantLabel(merchant: MerchantOption) {
  return `${merchant.code} / ${merchant.name}`;
}

export function accountLabel(account: AccountOption) {
  return `${account.name} / ${account.currency_code}`;
}

export function currencyLabel(currency: CurrencyOption) {
  return `${currency.code} / ${currency.name}`;
}

export function categoryLabel(category: CategoryOption) {
  return category.name;
}

export function originalDocumentLabel(document: OriginalDocumentOption) {
  return `${document.document_no} / ${document.business_date} / ${document.summary}`;
}
```

- [ ] **Step 2: Create typed field renderer**

Create `src/app/pages/documents/DocumentTypeFields.tsx`:

```tsx
import type { Dispatch, SetStateAction } from "react";
import type { DocumentEntryForm, DocumentEntryOptions, OriginalDocumentOption } from "./documentEntryTypes";
import {
  accountCurrencyCode,
  categoryOptionsForDocumentType,
  companyAccounts,
  getVisibleFieldKeys,
  isOriginalDocumentRequired,
  merchantOptionsForProject,
  pettyCashAccountsForPerson
} from "./documentEntryModel";
import {
  accountLabel,
  categoryLabel,
  currencyLabel,
  merchantLabel,
  originalDocumentLabel,
  personLabel,
  projectLabel,
  SelectField
} from "./DocumentEntrySelectors";

interface DocumentTypeFieldsProps {
  form: DocumentEntryForm;
  setForm: Dispatch<SetStateAction<DocumentEntryForm>>;
  options: DocumentEntryOptions;
  originalDocuments: OriginalDocumentOption[];
}

export function DocumentTypeFields({ form, setForm, options, originalDocuments }: DocumentTypeFieldsProps) {
  const fields = getVisibleFieldKeys(form.documentType, form.actionType);

  function updateField<K extends keyof DocumentEntryForm>(key: K, value: DocumentEntryForm[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateAccount(key: "accountId" | "counterpartyAccountId", value: string) {
    setForm((current) => ({
      ...current,
      [key]: value,
      currencyCode: key === "accountId" && value ? accountCurrencyCode(options, value) || current.currencyCode : current.currencyCode
    }));
  }

  return (
    <>
      {fields.includes("originalDocumentId") ? (
        <SelectField
          label="原单据"
          value={form.originalDocumentId}
          options={originalDocuments}
          getValue={(document) => document.id}
          getLabel={originalDocumentLabel}
          onChange={(value) => updateField("originalDocumentId", value)}
          required={isOriginalDocumentRequired(form.actionType)}
        />
      ) : null}

      {fields.includes("operatorPersonId") ? (
        <SelectField label="经办人" value={form.operatorPersonId} options={options.people} getValue={(person) => person.id} getLabel={personLabel} onChange={(value) => updateField("operatorPersonId", value)} />
      ) : null}

      {fields.includes("personId") ? (
        <SelectField label={form.documentType === "petty_cash_return" ? "退回人" : form.documentType === "petty_cash_issue" ? "领取人" : "报销人"} value={form.personId} options={options.people} getValue={(person) => person.id} getLabel={personLabel} onChange={(value) => setForm((current) => ({ ...current, personId: value, accountId: "", counterpartyAccountId: "" }))} required />
      ) : null}

      {fields.includes("borrowerPersonId") ? (
        <SelectField label="借款人" value={form.borrowerPersonId} options={options.people} getValue={(person) => person.id} getLabel={personLabel} onChange={(value) => updateField("borrowerPersonId", value)} required />
      ) : null}

      {fields.includes("projectId") ? (
        <SelectField label="项目" value={form.projectId} options={options.projects} getValue={(project) => project.id} getLabel={projectLabel} onChange={(value) => setForm((current) => ({ ...current, projectId: value, merchantId: "" }))} required={form.documentType === "project_income"} />
      ) : null}

      {fields.includes("merchantId") ? (
        <SelectField label="商户" value={form.merchantId} options={merchantOptionsForProject(options, form.projectId)} getValue={(merchant) => merchant.id} getLabel={merchantLabel} onChange={(value) => updateField("merchantId", value)} required={form.documentType === "project_income"} disabled={!form.projectId} />
      ) : null}

      {fields.includes("categoryId") ? (
        <SelectField label="科目" value={form.categoryId} options={categoryOptionsForDocumentType(options, form.documentType)} getValue={(category) => category.id} getLabel={categoryLabel} onChange={(value) => updateField("categoryId", value)} required={form.documentType !== "account_transfer"} />
      ) : null}

      {fields.includes("accountId") ? (
        <SelectField label={form.documentType === "petty_cash_return" || form.documentType === "petty_cash_reimbursement" ? "人员备用金账户" : form.documentType === "exchange" ? "转入账户" : form.documentType === "account_transfer" ? "转出账户" : "账户"} value={form.accountId} options={form.documentType === "petty_cash_return" || form.documentType === "petty_cash_reimbursement" ? pettyCashAccountsForPerson(options, form.personId) : companyAccounts(options)} getValue={(account) => account.id} getLabel={accountLabel} onChange={(value) => updateAccount("accountId", value)} required />
      ) : null}

      {fields.includes("counterpartyAccountId") ? (
        <SelectField label={form.documentType === "petty_cash_issue" ? "人员备用金账户" : form.documentType === "petty_cash_return" ? "公司收回账户" : form.documentType === "exchange" ? "转出账户" : "转入账户"} value={form.counterpartyAccountId} options={form.documentType === "petty_cash_issue" ? pettyCashAccountsForPerson(options, form.personId) : companyAccounts(options)} getValue={(account) => account.id} getLabel={accountLabel} onChange={(value) => updateAccount("counterpartyAccountId", value)} required />
      ) : null}

      {fields.includes("currencyCode") ? (
        <SelectField label="币种" value={form.currencyCode} options={options.currencies} getValue={(currency) => currency.code} getLabel={currencyLabel} onChange={(value) => updateField("currencyCode", value)} required />
      ) : null}

      {fields.includes("amountMajor") ? (
        <label>
          金额
          <input value={form.amountMajor} onChange={(event) => updateField("amountMajor", event.target.value)} required inputMode="decimal" maxLength={24} />
        </label>
      ) : null}

      {fields.includes("usdtAmountMajor") ? (
        <label>
          USDT成本
          <input value={form.usdtAmountMajor} onChange={(event) => updateField("usdtAmountMajor", event.target.value)} inputMode="decimal" maxLength={24} />
        </label>
      ) : null}

      {fields.includes("summary") ? (
        <label className="wide-field">
          摘要
          <input value={form.summary} onChange={(event) => updateField("summary", event.target.value)} required maxLength={240} />
        </label>
      ) : null}
    </>
  );
}
```

- [ ] **Step 3: Add CSS for typed document entry**

Append these rules to `src/app/styles.css` before the media query:

```css
.actor-panel {
  display: grid;
  grid-template-columns: minmax(220px, 360px) 1fr;
  gap: 14px;
  padding: 16px;
}

.document-entry-notice {
  align-self: end;
  color: #667085;
  font-size: 13px;
  line-height: 1.4;
}

.field-error-list {
  display: grid;
  gap: 4px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.field-error-list li {
  color: #b42318;
  font-size: 13px;
}
```

Inside the existing `@media (max-width: 820px)` block, add `.actor-panel` to the one-column grid rule:

```css
  .form-grid,
  .project-form,
  .document-form,
  .report-filter-grid,
  .actor-panel {
    grid-template-columns: 1fr;
  }
```

- [ ] **Step 4: Run type check**

Run:

```bash
npx tsc --noEmit
```

Expected: PASS. These components are not wired into the page yet, but they should type-check.

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/documents/DocumentEntrySelectors.tsx src/app/pages/documents/DocumentTypeFields.tsx src/app/styles.css
git commit -m "feat: add document entry selector components"
```

---

### Task 5: Rebuild Documents Page Around Controlled Entry

**Files:**
- Modify: `src/app/pages/DocumentsPage.tsx`
- Modify: `src/app/pages/DocumentsPage.test.ts`

- [ ] **Step 1: Write failing helper tests for workflow actor usage**

In `src/app/pages/DocumentsPage.test.ts`, import the new helper after it is created in this task:

```ts
import { workflowActionBody } from "./DocumentsPage";
```

Append this test:

```ts
  it("uses selected people ids for workflow actions", () => {
    expect(workflowActionBody("submit", "person_finance")).toEqual({ actor: "person_finance" });
    expect(workflowActionBody("approve", "person_manager")).toEqual({ reviewer: "person_manager" });
    expect(workflowActionBody("reject", "person_manager")).toEqual({ actor: "person_manager", reason: "退回修改" });
  });
```

- [ ] **Step 2: Run page tests and verify RED**

Run:

```bash
npm run test -- src/app/pages/DocumentsPage.test.ts
```

Expected: FAIL because `workflowActionBody` is not exported.

- [ ] **Step 3: Replace local helper exports**

In `src/app/pages/DocumentsPage.tsx`, remove the local `DocumentForm`, date helper, amount helper, and `buildDocumentPayload()` implementations that moved to `documentEntryModel.ts`.

Import the model and types:

```ts
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { ActionType, DocumentType } from "../../domain/types";
import { getJson, postJson, type ApiEnvelope } from "../api";
import { DocumentTypeFields } from "./documents/DocumentTypeFields";
import { personLabel, SelectField } from "./documents/DocumentEntrySelectors";
import {
  buildDocumentPayload,
  createInitialDocumentForm,
  formatLocalDateInputValue,
  formatLocalMonthInputValue,
  isOriginalDocumentRequired,
  validateDocumentForm
} from "./documents/documentEntryModel";
import type { DocumentEntryForm, DocumentEntryOptions, OriginalDocumentOption } from "./documents/documentEntryTypes";
```

Keep exporting date helpers from `documentEntryModel.ts` and update `DocumentsPage.test.ts` to import them from that module.

- [ ] **Step 4: Add workflow body helper**

Add this export near the workflow helpers in `src/app/pages/DocumentsPage.tsx`:

```ts
export function workflowActionBody(action: WorkflowAction, actorId: string) {
  const actor = actorId.trim();
  if (action === "approve") return { reviewer: actor };
  if (action === "reject") return { actor, reason: "退回修改" };
  return { actor };
}
```

- [ ] **Step 5: Add option-loading state**

Inside `DocumentsPage()`, add state:

```ts
  const emptyOptions = useMemo<DocumentEntryOptions>(
    () => ({ people: [], projects: [], merchants: [], accounts: [], currencies: [], categories: [] }),
    []
  );
  const [entryOptions, setEntryOptions] = useState<DocumentEntryOptions>(emptyOptions);
  const [originalDocuments, setOriginalDocuments] = useState<OriginalDocumentOption[]>([]);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [areOptionsLoading, setAreOptionsLoading] = useState(true);
  const [currentActorId, setCurrentActorId] = useState("");
```

Add option loading effect:

```ts
  useEffect(() => {
    let isCurrent = true;

    async function loadOptions() {
      setAreOptionsLoading(true);
      setOptionsError(null);
      try {
        const response = await getJson<ApiEnvelope<DocumentEntryOptions>>("/api/document-entry/options");
        if (isCurrent) {
          setEntryOptions(response.data);
          setCurrentActorId((current) => current || response.data.people[0]?.id || "");
        }
      } catch (loadOptionsError) {
        if (isCurrent) {
          setOptionsError(loadOptionsError instanceof Error ? loadOptionsError.message : "读取单据选项失败");
        }
      } finally {
        if (isCurrent) {
          setAreOptionsLoading(false);
        }
      }
    }

    void loadOptions();

    return () => {
      isCurrent = false;
    };
  }, []);
```

Add original-document loading effect:

```ts
  useEffect(() => {
    let isCurrent = true;

    async function loadOriginalDocuments() {
      if (!isOriginalDocumentRequired(form.actionType)) {
        setOriginalDocuments([]);
        return;
      }
      const query = `?documentType=${encodeURIComponent(form.documentType)}`;
      const response = await getJson<ApiEnvelope<OriginalDocumentOption[]>>(`/api/document-entry/original-documents${query}`);
      if (isCurrent) setOriginalDocuments(response.data);
    }

    void loadOriginalDocuments().catch((error) => {
      if (isCurrent) setError(error instanceof Error ? error.message : "读取原单据失败");
    });

    return () => {
      isCurrent = false;
    };
  }, [form.actionType, form.documentType]);
```

- [ ] **Step 6: Use validation and current actor on create**

Replace `handleSubmit()` payload creation with:

```ts
    const validationErrors = validateDocumentForm(form, entryOptions, currentActorId);
    if (validationErrors.length > 0) {
      setError(validationErrors.join("；"));
      setIsSubmitting(false);
      return;
    }

    try {
      const response = await postJson<ApiEnvelope<DocumentResponse>>("/api/documents", buildDocumentPayload(form, currentActorId));
```

When resetting the form, preserve actor-independent defaults:

```ts
      setForm((current) => ({
        ...createInitialDocumentForm(),
        documentType: current.documentType,
        actionType: current.actionType,
        businessDate: current.businessDate,
        period: current.period,
        currencyCode: current.currencyCode
      }));
```

- [ ] **Step 7: Use current actor on workflow actions**

Replace the existing workflow body construction with:

```ts
    if (!currentActorId.trim()) {
      setError("请选择当前操作人");
      return;
    }

    const body = workflowActionBody(action, currentActorId);
```

- [ ] **Step 8: Replace free-text ID form with controlled selects**

In the JSX, add an actor panel above the document list:

```tsx
      <section className="panel">
        <div className="panel-header">
          <h2>当前操作人</h2>
          <div className="status-slot" role="status" aria-live="polite">
            {areOptionsLoading ? "读取中" : optionsError ? "失败" : currentActorId ? "已选择" : "未选择"}
          </div>
        </div>
        <div className="actor-panel">
          <SelectField
            label="当前操作人"
            value={currentActorId}
            options={entryOptions.people}
            getValue={(person) => person.id}
            getLabel={personLabel}
            onChange={setCurrentActorId}
            required
            disabled={areOptionsLoading || Boolean(optionsError)}
          />
          <div className="document-entry-notice">
            创建、提交、审核、驳回都会使用当前操作人，并保存为人员主数据 ID。
          </div>
        </div>
        {optionsError ? <div className="notice error">{optionsError}</div> : null}
      </section>
```

Replace the current `<form className="form-grid document-form" ...>` inner field list with:

```tsx
          <label>
            单据类型
            <select
              value={form.documentType}
              onChange={(event) =>
                setForm((current) => ({ ...createInitialDocumentForm(), documentType: event.target.value as DocumentType, actionType: current.actionType, businessDate: current.businessDate, period: current.period }))
              }
            >
              {documentTypes.map((documentType) => (
                <option key={documentType} value={documentType}>
                  {documentTypeLabels[documentType]}
                </option>
              ))}
            </select>
          </label>

          <label>
            动作类型
            <select value={form.actionType} onChange={(event) => setForm((current) => ({ ...current, actionType: event.target.value as ActionType, originalDocumentId: "" }))}>
              {actionTypes.map((actionType) => (
                <option key={actionType} value={actionType}>
                  {actionTypeLabels[actionType]}
                </option>
              ))}
            </select>
          </label>

          <label>
            业务日期
            <input
              type="date"
              value={form.businessDate}
              onChange={(event) => setForm((current) => ({ ...current, businessDate: event.target.value, period: event.target.value.slice(0, 7) }))}
              required
            />
          </label>

          <label>
            期间
            <input type="month" value={form.period} onChange={(event) => setForm((current) => ({ ...current, period: event.target.value }))} required />
          </label>

          <DocumentTypeFields form={form} setForm={setForm} options={entryOptions} originalDocuments={originalDocuments} />

          <div className="form-actions">
            <button type="submit" disabled={isSubmitting || areOptionsLoading || Boolean(optionsError) || !currentActorId}>
              {isSubmitting ? "提交中" : "创建草稿"}
            </button>
          </div>
```

Remove labels whose visible text includes these exact strings:

- `原单据ID`
- `创建人`
- `经办人ID`
- `项目ID`
- `商户ID`
- `分类ID`
- `账户ID`
- `对方账户ID`
- `币种代码`
- `人员ID`
- `借款人ID`

- [ ] **Step 9: Run focused tests and type check**

Run:

```bash
npm run test -- src/app/pages/DocumentsPage.test.ts src/app/pages/documents/documentEntryModel.test.ts
npx tsc --noEmit
```

Expected: both commands PASS.

- [ ] **Step 10: Commit**

```bash
git add src/app/pages/DocumentsPage.tsx src/app/pages/DocumentsPage.test.ts
git commit -m "feat: use controlled document entry form"
```

---

### Task 6: Final Verification and Browser Smoke

**Files:**
- Modify only if verification finds a real defect in files changed by Tasks 1-5.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
npm run test
npx tsc --noEmit
npm run build
```

Expected:

- Vitest: all test files pass.
- TypeScript: exits 0 with no type errors.
- Vite build: exits 0 and writes `dist`.

- [ ] **Step 2: Run local database migration check**

Run:

```bash
npm run db:migrate:local
```

Expected: exits 0. It may report that no migrations need to apply.

- [ ] **Step 3: Browser smoke**

Use the in-app browser at `http://localhost:8787/`.

Expected checks:

- Navigate to `业务单据`.
- Page shows `当前操作人`.
- The create form does not show `项目ID`, `商户ID`, `人员ID`, `账户ID`, `对方账户ID`, `币种代码`, or `创建人`.
- `当前操作人` is a select populated from people options.
- `项目收入` shows project, merchant, category, account, currency, amount, USDT cost, and summary controls.
- Selecting a project filters merchant options.
- `备用金报销` shows 报销人 and 人员备用金账户 controls.
- Selecting a person filters petty cash account options.

- [ ] **Step 4: Commit verification fixes if needed**

If Task 6 required code changes, run `git status --short`, add the exact modified files shown for this feature, and commit them. Example when the browser smoke only requires page and CSS fixes:

```bash
git add src/app/pages/DocumentsPage.tsx src/app/styles.css
git commit -m "fix: polish controlled document entry"
```

If no changes were needed, do not create an empty commit.
