# Document Entry Governance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a formal document-entry governance loop so draft creation stays flexible while submit and approve reject incomplete or master-data-inconsistent documents.

**Architecture:** Add a pure `documentRules` domain module that validates structure and master-data relationships without database access. Extend `MasterDataRepository` with batch lookup methods, inject it into `DocumentService`, and run the same rule checks on submit and approve before posting, FIFO, and loan effects. On the frontend, keep the existing document page but replace scattered field and option logic with a derived `DocumentEntryState`.

**Tech Stack:** Cloudflare Workers, D1, TypeScript, React, Vite, Vitest, native HTML form controls.

---

## Source Documents

- Design spec: `docs/superpowers/specs/2026-04-25-document-entry-governance-design.md`
- Existing backend service: `src/services/documentService.ts`
- Existing master data options repository: `src/repositories/masterDataRepository.ts`
- Existing document repository: `src/repositories/documentRepository.ts`
- Existing document API: `src/api/documents.ts`
- Existing frontend model: `src/app/pages/documents/documentEntryModel.ts`
- Existing frontend field renderer: `src/app/pages/documents/DocumentTypeFields.tsx`
- Existing document page: `src/app/pages/DocumentsPage.tsx`

## File Structure

Create:

- `src/domain/documentRules.ts` - pure document structure and master-data relationship rules.
- `tests/domain/documentRules.test.ts` - domain tests for the rule matrix.
- `src/app/pages/documents/documentEntryRules.ts` - frontend derived field state, option filtering, and residual selection checks.
- `src/app/pages/documents/documentEntryRules.test.ts` - frontend derived-state tests.

Modify:

- `src/repositories/masterDataRepository.ts` - add unfiltered batch lookup methods used by submit and approve validation.
- `tests/api/masterDataRepository.test.ts` - cover batch lookup SQL and empty input behavior.
- `src/services/documentService.ts` - inject master data repository, run draft line checks, submit checks, and approve checks.
- `tests/api/documentService.test.ts` - cover create, submit, approve, and reversal validation gates.
- `src/api/documents.ts` - construct `DocumentService` with `MasterDataRepository`.
- `tests/api/documents.test.ts` - cover API errors from submit and approve rule failures.
- `src/app/pages/documents/documentEntryModel.ts` - preserve public helpers and delegate required-field validation to derived rules.
- `src/app/pages/documents/DocumentTypeFields.tsx` - render fields from derived state and use derived option sets.
- `src/app/pages/DocumentsPage.tsx` - compute derived entry state and show validation errors.
- `src/app/pages/documents/documentEntryModel.test.ts` - keep existing payload tests and update validation expectations.

Do not modify in this phase:

- `src/domain/posting.ts`
- `src/domain/fifoEffects.ts`
- `src/domain/loanEffects.ts`
- report SQL
- Cloudflare deployment config

## Shared Decisions

- `manual_adjustment` remains unsupported for creation, submit, and approve.
- Draft creation can save header-only documents.
- Draft creation with lines runs shape checks for provided lines.
- Submit requires complete header and line data.
- Approve repeats submit validation and then runs existing posting, FIFO, loan, and reversal logic.
- Reversal validates original document linkage and avoids active/enabled checks on the original document's historical master data.
- Current UI still creates one line per document; backend rules allow multiple lines only where existing posting code already supports them.
- Frontend and backend share names for rule concepts but do not import server code into the browser bundle.

## Rule Messages

Use these user-facing messages exactly in tests:

```ts
export const documentRuleMessages = {
  unsupportedDocumentType: "单据类型暂不支持创建或审核",
  lineRequired: "单据必须至少有一条明细",
  singleLineRequired: "当前单据类型必须只有一条明细",
  originalRequired: "必须选择原单据",
  originalMustBeApprovedLoanOut: "借款还款或核销必须关联已审核借款发放单",
  loanBorrowerMatch: "借款人必须与原借款单一致",
  loanCurrencyMatch: "还款或核销币种必须与原借款单一致",
  projectRequired: "必须选择项目",
  merchantRequired: "项目收入必须选择商户",
  categoryRequired: "必须选择科目",
  accountRequired: "必须选择账户",
  counterpartyAccountRequired: "必须选择对方账户",
  personRequired: "必须选择人员",
  borrowerRequired: "必须选择借款人",
  currencyRequired: "必须选择币种",
  amountRequired: "金额必须大于 0",
  usdtCostRequired: "必须填写 USDT 成本",
  projectActive: "项目必须是启用状态",
  merchantActive: "商户必须是启用状态",
  merchantProject: "商户必须属于所选项目",
  accountActive: "账户必须是启用状态",
  companyAccount: "账户必须是公司账户",
  pettyCashAccount: "备用金账户必须属于所选人员",
  sameCurrency: "币种必须与账户币种一致",
  transferSameAccount: "转出账户和转入账户不能相同",
  currencyEnabled: "币种必须是启用状态",
  personEnabled: "人员必须是启用状态",
  categoryEnabled: "科目必须是启用状态",
  categoryType: "科目类型不适用于当前单据类型",
  categoryDirection: "科目方向不适用于当前单据类型",
  categoryRequiresMerchant: "该科目要求选择商户",
  categoryRequiresPerson: "该科目要求选择人员",
  categoryRequiresBorrower: "该科目要求选择借款人",
  reversalTypeMatch: "冲正单据类型必须与原单据一致",
  reversalOriginalApproved: "冲正必须关联已审核原单据"
} as const;
```

---

### Task 1: Domain Document Rules

**Files:**
- Create: `src/domain/documentRules.ts`
- Create: `tests/domain/documentRules.test.ts`

- [ ] **Step 1: Write the failing domain tests**

Create `tests/domain/documentRules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  documentRuleMessages,
  validateDocumentMasterData,
  validateDocumentStructure,
  type DocumentMasterDataSnapshot,
  type DocumentRuleDocument,
  type DocumentRuleLine
} from "../../src/domain/documentRules";

function document(overrides: Partial<DocumentRuleDocument> = {}): DocumentRuleDocument {
  return {
    id: "doc_1",
    documentType: "project_income",
    actionType: "normal",
    operatorPersonId: "person_ops",
    projectId: "proj_1",
    merchantId: "merchant_1",
    categoryId: "cat_income",
    originalDocumentId: null,
    summary: "Merchant income",
    businessDate: "2026-04-24",
    period: "2026-04",
    ...overrides
  };
}

function line(overrides: Partial<DocumentRuleLine> = {}): DocumentRuleLine {
  return {
    accountId: "acct_company_aed",
    counterpartyAccountId: null,
    personId: null,
    borrowerPersonId: null,
    currencyCode: "AED",
    amountMinor: 12050,
    usdtAmountMinor: null,
    ...overrides
  };
}

function masterData(overrides: Partial<DocumentMasterDataSnapshot> = {}): DocumentMasterDataSnapshot {
  return {
    people: new Map([
      ["person_ops", { id: "person_ops", is_enabled: 1 }],
      ["person_bob", { id: "person_bob", is_enabled: 1 }]
    ]),
    projects: new Map([["proj_1", { id: "proj_1", status: "active" }]]),
    merchants: new Map([["merchant_1", { id: "merchant_1", project_id: "proj_1", status: "active" }]]),
    accounts: new Map([
      [
        "acct_company_aed",
        {
          id: "acct_company_aed",
          account_type: "currency_reserve",
          currency_code: "AED",
          owner_person_id: null,
          is_company_account: 1,
          status: "active"
        }
      ],
      [
        "acct_petty_bob",
        {
          id: "acct_petty_bob",
          account_type: "petty_cash",
          currency_code: "AED",
          owner_person_id: "person_bob",
          is_company_account: 0,
          status: "active"
        }
      ],
      [
        "acct_usdt",
        {
          id: "acct_usdt",
          account_type: "usdt_wallet",
          currency_code: "USDT",
          owner_person_id: null,
          is_company_account: 1,
          status: "active"
        }
      ]
    ]),
    categories: new Map([
      [
        "cat_income",
        {
          id: "cat_income",
          category_type: "income",
          direction: "in",
          affects_expense_report: 0,
          requires_merchant: 1,
          requires_person: 0,
          requires_borrower: 0,
          is_enabled: 1
        }
      ],
      [
        "cat_expense_person",
        {
          id: "cat_expense_person",
          category_type: "expense",
          direction: "out",
          affects_expense_report: 1,
          requires_merchant: 0,
          requires_person: 1,
          requires_borrower: 0,
          is_enabled: 1
        }
      ],
      [
        "cat_loss",
        {
          id: "cat_loss",
          category_type: "loss",
          direction: "out",
          affects_expense_report: 1,
          requires_merchant: 0,
          requires_person: 0,
          requires_borrower: 1,
          is_enabled: 1
        }
      ],
      [
        "cat_exchange",
        {
          id: "cat_exchange",
          category_type: "exchange",
          direction: "neutral",
          affects_expense_report: 0,
          requires_merchant: 0,
          requires_person: 0,
          requires_borrower: 0,
          is_enabled: 1
        }
      ]
    ]),
    currencies: new Map([
      ["AED", { code: "AED", is_enabled: 1 }],
      ["USDT", { code: "USDT", is_enabled: 1 }]
    ]),
    ...overrides
  };
}

describe("document structure rules", () => {
  it("allows header-only draft documents", () => {
    expect(validateDocumentStructure({ stage: "draft", document: document(), lines: [] })).toEqual([]);
  });

  it("requires project income merchant on submit", () => {
    const errors = validateDocumentStructure({
      stage: "submit",
      document: document({ merchantId: null }),
      lines: [line()]
    });

    expect(errors.map((error) => error.message)).toContain(documentRuleMessages.merchantRequired);
  });

  it("requires exchange counterparty account and USDT cost", () => {
    const errors = validateDocumentStructure({
      stage: "submit",
      document: document({ documentType: "exchange", categoryId: "cat_exchange" }),
      lines: [line({ counterpartyAccountId: null, usdtAmountMinor: null })]
    });

    expect(errors.map((error) => error.message)).toEqual([
      documentRuleMessages.counterpartyAccountRequired,
      documentRuleMessages.usdtCostRequired
    ]);
  });

  it("allows loan writeoff lines without cash account", () => {
    const errors = validateDocumentStructure({
      stage: "submit",
      document: document({
        documentType: "loan_writeoff",
        borrowerPersonId: "person_bob",
        originalDocumentId: "doc_loan",
        categoryId: "cat_loss"
      }),
      lines: [line({ accountId: null, borrowerPersonId: "person_bob" })]
    });

    expect(errors).toEqual([]);
  });

  it("requires only original document and summary for reversal", () => {
    const errors = validateDocumentStructure({
      stage: "submit",
      document: document({ actionType: "reversal", originalDocumentId: "doc_original", summary: "Reverse" }),
      lines: []
    });

    expect(errors).toEqual([]);
  });
});

describe("document master data rules", () => {
  it("rejects merchant outside the selected project", () => {
    const snapshot = masterData({
      merchants: new Map([["merchant_1", { id: "merchant_1", project_id: "proj_2", status: "active" }]])
    });

    const errors = validateDocumentMasterData({
      document: document(),
      lines: [line()],
      masterData: snapshot
    });

    expect(errors.map((error) => error.message)).toContain(documentRuleMessages.merchantProject);
  });

  it("rejects disabled accounts before posting", () => {
    const snapshot = masterData({
      accounts: new Map([
        [
          "acct_company_aed",
          {
            id: "acct_company_aed",
            account_type: "currency_reserve",
            currency_code: "AED",
            owner_person_id: null,
            is_company_account: 1,
            status: "archived"
          }
        ]
      ])
    });

    const errors = validateDocumentMasterData({
      document: document(),
      lines: [line()],
      masterData: snapshot
    });

    expect(errors.map((error) => error.message)).toContain(documentRuleMessages.accountActive);
  });

  it("requires petty cash accounts to belong to the selected person", () => {
    const errors = validateDocumentMasterData({
      document: document({ documentType: "petty_cash_reimbursement", categoryId: "cat_expense_person" }),
      lines: [line({ accountId: "acct_petty_bob", personId: "person_ops" })],
      masterData: masterData()
    });

    expect(errors.map((error) => error.message)).toContain(documentRuleMessages.pettyCashAccount);
  });

  it("rejects loan settlement when original document is not approved loan_out", () => {
    const errors = validateDocumentMasterData({
      document: document({
        documentType: "loan_repayment",
        borrowerPersonId: "person_bob",
        originalDocumentId: "doc_income",
        categoryId: null
      }),
      lines: [line({ borrowerPersonId: "person_bob" })],
      masterData: masterData(),
      originalDocument: {
        id: "doc_income",
        documentType: "project_income",
        status: "approved",
        borrowerPersonId: null
      },
      originalLines: [line()]
    });

    expect(errors.map((error) => error.message)).toContain(documentRuleMessages.originalMustBeApprovedLoanOut);
  });

  it("rejects loan settlement borrower mismatches", () => {
    const errors = validateDocumentMasterData({
      document: document({
        documentType: "loan_repayment",
        borrowerPersonId: "person_bob",
        originalDocumentId: "doc_loan",
        categoryId: null
      }),
      lines: [line({ borrowerPersonId: "person_bob" })],
      masterData: masterData(),
      originalDocument: {
        id: "doc_loan",
        documentType: "loan_out",
        status: "approved",
        borrowerPersonId: "person_ops"
      },
      originalLines: [line({ borrowerPersonId: "person_ops", currencyCode: "AED" })]
    });

    expect(errors.map((error) => error.message)).toContain(documentRuleMessages.loanBorrowerMatch);
  });

  it("rejects loan settlement currency mismatches", () => {
    const errors = validateDocumentMasterData({
      document: document({
        documentType: "loan_writeoff",
        borrowerPersonId: "person_bob",
        originalDocumentId: "doc_loan",
        categoryId: "cat_loss"
      }),
      lines: [line({ accountId: null, borrowerPersonId: "person_bob", currencyCode: "USDT" })],
      masterData: masterData(),
      originalDocument: {
        id: "doc_loan",
        documentType: "loan_out",
        status: "approved",
        borrowerPersonId: "person_bob"
      },
      originalLines: [line({ borrowerPersonId: "person_bob", currencyCode: "AED" })]
    });

    expect(errors.map((error) => error.message)).toContain(documentRuleMessages.loanCurrencyMatch);
  });

  it("does not require original historical master data to stay active for reversal", () => {
    const errors = validateDocumentMasterData({
      document: document({ actionType: "reversal", originalDocumentId: "doc_original" }),
      lines: [],
      masterData: masterData({
        accounts: new Map(),
        categories: new Map(),
        merchants: new Map(),
        projects: new Map()
      }),
      originalDocument: {
        id: "doc_original",
        documentType: "project_income",
        status: "approved",
        borrowerPersonId: null
      },
      originalLines: []
    });

    expect(errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the domain test to verify RED**

Run:

```bash
npm test -- tests/domain/documentRules.test.ts
```

Expected: fail because `src/domain/documentRules.ts` does not exist.

- [ ] **Step 3: Implement the rule module**

Create `src/domain/documentRules.ts` with these exported types and functions:

```ts
import type { ActionType, DocumentStatus, DocumentType } from "./types";

export const documentRuleMessages = {
  unsupportedDocumentType: "单据类型暂不支持创建或审核",
  lineRequired: "单据必须至少有一条明细",
  singleLineRequired: "当前单据类型必须只有一条明细",
  originalRequired: "必须选择原单据",
  originalMustBeApprovedLoanOut: "借款还款或核销必须关联已审核借款发放单",
  loanBorrowerMatch: "借款人必须与原借款单一致",
  loanCurrencyMatch: "还款或核销币种必须与原借款单一致",
  projectRequired: "必须选择项目",
  merchantRequired: "项目收入必须选择商户",
  categoryRequired: "必须选择科目",
  accountRequired: "必须选择账户",
  counterpartyAccountRequired: "必须选择对方账户",
  personRequired: "必须选择人员",
  borrowerRequired: "必须选择借款人",
  currencyRequired: "必须选择币种",
  amountRequired: "金额必须大于 0",
  usdtCostRequired: "必须填写 USDT 成本",
  projectActive: "项目必须是启用状态",
  merchantActive: "商户必须是启用状态",
  merchantProject: "商户必须属于所选项目",
  accountActive: "账户必须是启用状态",
  companyAccount: "账户必须是公司账户",
  pettyCashAccount: "备用金账户必须属于所选人员",
  sameCurrency: "币种必须与账户币种一致",
  transferSameAccount: "转出账户和转入账户不能相同",
  currencyEnabled: "币种必须是启用状态",
  personEnabled: "人员必须是启用状态",
  categoryEnabled: "科目必须是启用状态",
  categoryType: "科目类型不适用于当前单据类型",
  categoryDirection: "科目方向不适用于当前单据类型",
  categoryRequiresMerchant: "该科目要求选择商户",
  categoryRequiresPerson: "该科目要求选择人员",
  categoryRequiresBorrower: "该科目要求选择借款人",
  reversalTypeMatch: "冲正单据类型必须与原单据一致",
  reversalOriginalApproved: "冲正必须关联已审核原单据"
} as const;

export interface DocumentRuleViolation {
  field: string;
  message: string;
}

export interface DocumentRuleDocument {
  id?: string;
  documentType: DocumentType;
  actionType: ActionType;
  operatorPersonId?: string | null;
  projectId?: string | null;
  merchantId?: string | null;
  categoryId?: string | null;
  originalDocumentId?: string | null;
  borrowerPersonId?: string | null;
  summary?: string | null;
  businessDate?: string;
  period?: string;
}

export interface DocumentRuleLine {
  accountId?: string | null;
  counterpartyAccountId?: string | null;
  personId?: string | null;
  borrowerPersonId?: string | null;
  currencyCode?: string | null;
  amountMinor?: number | null;
  usdtAmountMinor?: number | null;
}

export interface DocumentRuleOriginalDocument {
  id: string;
  documentType: DocumentType;
  status: DocumentStatus;
  borrowerPersonId?: string | null;
}

export interface DocumentMasterDataSnapshot {
  people: Map<string, { id: string; is_enabled: number }>;
  projects: Map<string, { id: string; status: string }>;
  merchants: Map<string, { id: string; project_id: string; status: string }>;
  accounts: Map<
    string,
    {
      id: string;
      account_type: string;
      currency_code: string;
      owner_person_id: string | null;
      is_company_account: number;
      status: string;
    }
  >;
  categories: Map<
    string,
    {
      id: string;
      category_type: string;
      direction: string;
      affects_expense_report: number;
      requires_merchant: number;
      requires_person: number;
      requires_borrower: number;
      is_enabled: number;
    }
  >;
  currencies: Map<string, { code: string; is_enabled: number }>;
}

export interface ValidateDocumentStructureInput {
  stage: "draft" | "submit" | "approve";
  document: DocumentRuleDocument;
  lines: DocumentRuleLine[];
}

export interface ValidateDocumentMasterDataInput {
  document: DocumentRuleDocument;
  lines: DocumentRuleLine[];
  masterData: DocumentMasterDataSnapshot;
  originalDocument?: DocumentRuleOriginalDocument | null;
  originalLines?: DocumentRuleLine[];
}
```

Implement the module with this behavior:

- `validateDocumentStructure(input)` returns an array and never throws.
- `validateDocumentMasterData(input)` returns an array and never throws.
- `assertNoDocumentRuleViolations(violations)` throws `new Error(violations[0].message)` when the array is not empty.
- `isOriginalRequiredForDocument(documentType, actionType)` returns true for `actionType === "reversal"` and for normal `loan_repayment` or `loan_writeoff`.
- `requiredHeaderFieldsFor(documentType, actionType)` returns frontend-compatible field names.
- `requiredLineFieldsFor(documentType, actionType)` returns line field names.
- `documentType === "manual_adjustment"` always returns `unsupportedDocumentType`.
- `actionType === "reversal"` requires `originalDocumentId` and allows zero new lines.
- Submit and approve require at least one line for non-reversal documents.
- `exchange`, `account_transfer`, `petty_cash_issue`, `petty_cash_return`, `petty_cash_reimbursement`, `loan_repayment`, and `loan_writeoff` require exactly one line.
- `loan_writeoff` does not require `accountId`.
- Category checks:
  - project income requires `category_type = "income"` and `direction = "in"`.
  - exchange requires `category_type = "exchange"`.
  - petty cash reimbursement requires `affects_expense_report = 1` and `direction = "out"`.
  - loan out requires `category_type = "loan"`.
  - loan writeoff requires `category_type` equal to `"expense"` or `"loss"` and `direction = "out"`.
- Account checks:
  - company-account documents require `is_company_account = 1`.
  - petty cash account roles require `account_type = "petty_cash"` and matching `owner_person_id`.
  - every line currency must match the primary account currency when the line has `accountId`.
  - account transfer source and destination must differ.
- Currency checks require enabled currency records.
- Loan repayment and loan writeoff require `originalDocument.documentType === "loan_out"` and `originalDocument.status === "approved"`.
- Loan repayment and loan writeoff require the borrower to match the original loan borrower.
- Loan repayment and loan writeoff require the settlement currency to exist in the original loan lines.
- Reversal requires approved original document and matching document type, but it does not inspect original account/category/project active status.

- [ ] **Step 4: Run the domain test to verify GREEN**

Run:

```bash
npm test -- tests/domain/documentRules.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 1**

```bash
git add src/domain/documentRules.ts tests/domain/documentRules.test.ts
git commit -m "feat: add document entry rule engine"
```

---

### Task 2: Master Data Batch Lookups

**Files:**
- Modify: `src/repositories/masterDataRepository.ts`
- Modify: `tests/api/masterDataRepository.test.ts`

- [ ] **Step 1: Write failing repository tests**

Append to `tests/api/masterDataRepository.test.ts`:

```ts
it("loads people by ids without filtering enabled status", async () => {
  let capturedSql = "";
  const repo = new MasterDataRepository(
    mockDb({
      rows: [{ id: "person_disabled", name: "Disabled", alias: null, roles_json: "[]", is_enabled: 0 }],
      onSql: (sql) => (capturedSql = sql)
    })
  );

  await expect(repo.getPeopleByIds(["person_disabled"])).resolves.toEqual([
    { id: "person_disabled", name: "Disabled", alias: null, roles_json: "[]", is_enabled: 0 }
  ]);
  expect(normalizeSql(capturedSql)).toContain("from people");
  expect(normalizeSql(capturedSql)).not.toContain("where is_enabled = 1");
});

it("loads accounts by ids without filtering active status", async () => {
  let capturedSql = "";
  const repo = new MasterDataRepository(
    mockDb({
      rows: [
        {
          id: "acct_archived",
          name: "Old AED",
          account_type: "currency_reserve",
          currency_code: "AED",
          owner_person_id: null,
          is_company_account: 1,
          allow_negative: 0,
          status: "archived"
        }
      ],
      onSql: (sql) => (capturedSql = sql)
    })
  );

  await expect(repo.getAccountsByIds(["acct_archived"])).resolves.toHaveLength(1);
  expect(normalizeSql(capturedSql)).toContain("from accounts");
  expect(normalizeSql(capturedSql)).not.toContain("where status = 'active'");
});

it("returns empty arrays without querying for empty batch lookup inputs", async () => {
  let prepareCount = 0;
  const repo = new MasterDataRepository(mockDb({ onSql: () => (prepareCount += 1) }));

  await expect(repo.getPeopleByIds([])).resolves.toEqual([]);
  await expect(repo.getProjectsByIds([])).resolves.toEqual([]);
  await expect(repo.getMerchantsByIds([])).resolves.toEqual([]);
  await expect(repo.getAccountsByIds([])).resolves.toEqual([]);
  await expect(repo.getCategoriesByIds([])).resolves.toEqual([]);
  await expect(repo.getCurrenciesByCodes([])).resolves.toEqual([]);
  expect(prepareCount).toBe(0);
});
```

- [ ] **Step 2: Run the repository tests to verify RED**

Run:

```bash
npm test -- tests/api/masterDataRepository.test.ts
```

Expected: fail because the new methods do not exist.

- [ ] **Step 3: Add batch lookup methods**

In `src/repositories/masterDataRepository.ts`, add this helper near the bottom of the file:

```ts
function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function bindMarks(values: string[]) {
  return values.map(() => "?").join(", ");
}
```

Add these methods to `MasterDataRepository`:

```ts
getPeopleByIds(ids: string[]): Promise<PersonOptionRow[]> {
  const values = uniqueValues(ids);
  if (values.length === 0) return Promise.resolve([]);
  return all<PersonOptionRow>(
    this.db
      .prepare(`
        SELECT id, name, alias, roles_json, is_enabled
        FROM people
        WHERE id IN (${bindMarks(values)})
        ORDER BY name, id
      `)
      .bind(...values)
  );
}

getProjectsByIds(ids: string[]): Promise<ProjectOptionRow[]> {
  const values = uniqueValues(ids);
  if (values.length === 0) return Promise.resolve([]);
  return all<ProjectOptionRow>(
    this.db
      .prepare(`
        SELECT id, code, name, owner_person_id, status
        FROM projects
        WHERE id IN (${bindMarks(values)})
        ORDER BY code, name, id
      `)
      .bind(...values)
  );
}

getMerchantsByIds(ids: string[]): Promise<MerchantOptionRow[]> {
  const values = uniqueValues(ids);
  if (values.length === 0) return Promise.resolve([]);
  return all<MerchantOptionRow>(
    this.db
      .prepare(`
        SELECT id, code, name, project_id, merchant_type, status
        FROM merchants
        WHERE id IN (${bindMarks(values)})
        ORDER BY project_id, code, name, id
      `)
      .bind(...values)
  );
}

getAccountsByIds(ids: string[]): Promise<AccountOptionRow[]> {
  const values = uniqueValues(ids);
  if (values.length === 0) return Promise.resolve([]);
  return all<AccountOptionRow>(
    this.db
      .prepare(`
        SELECT
          id, name, account_type, currency_code, owner_person_id,
          is_company_account, allow_negative, status
        FROM accounts
        WHERE id IN (${bindMarks(values)})
        ORDER BY is_company_account DESC, account_type, name, id
      `)
      .bind(...values)
  );
}

getCategoriesByIds(ids: string[]): Promise<CategoryOptionRow[]> {
  const values = uniqueValues(ids);
  if (values.length === 0) return Promise.resolve([]);
  return all<CategoryOptionRow>(
    this.db
      .prepare(`
        SELECT
          id, name, parent_id, category_type, direction,
          affects_expense_report, affects_project_report,
          requires_merchant, requires_person, requires_borrower, is_enabled
        FROM categories
        WHERE id IN (${bindMarks(values)})
        ORDER BY category_type, name, id
      `)
      .bind(...values)
  );
}

getCurrenciesByCodes(codes: string[]): Promise<CurrencyRow[]> {
  const values = uniqueValues(codes).map((code) => code.toUpperCase());
  if (values.length === 0) return Promise.resolve([]);
  return all<CurrencyRow>(
    this.db
      .prepare(`
        SELECT code, name, minor_units, is_enabled
        FROM currencies
        WHERE code IN (${bindMarks(values)})
        ORDER BY code
      `)
      .bind(...values)
  );
}
```

- [ ] **Step 4: Run the repository tests to verify GREEN**

Run:

```bash
npm test -- tests/api/masterDataRepository.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit Task 2**

```bash
git add src/repositories/masterDataRepository.ts tests/api/masterDataRepository.test.ts
git commit -m "feat: add master data batch lookups"
```

---

### Task 3: Service Validation Gates

**Files:**
- Modify: `src/services/documentService.ts`
- Modify: `src/api/documents.ts`
- Modify: `tests/api/documentService.test.ts`

- [ ] **Step 1: Write failing service tests**

Extend the mocks in `tests/api/documentService.test.ts` with a master-data mock:

```ts
type MasterDataRepoMock = {
  getPeopleByIds: ReturnType<typeof vi.fn>;
  getProjectsByIds: ReturnType<typeof vi.fn>;
  getMerchantsByIds: ReturnType<typeof vi.fn>;
  getAccountsByIds: ReturnType<typeof vi.fn>;
  getCategoriesByIds: ReturnType<typeof vi.fn>;
  getCurrenciesByCodes: ReturnType<typeof vi.fn>;
};
```

Update `createMocks()` so it returns `masterData` and constructs the service with three arguments:

```ts
const masterData = {
  getPeopleByIds: vi.fn(async () => [
    { id: "creator_1", name: "Creator", alias: null, roles_json: "[]", is_enabled: 1 },
    { id: "submitter_1", name: "Submitter", alias: null, roles_json: "[]", is_enabled: 1 },
    { id: "reviewer_1", name: "Reviewer", alias: null, roles_json: "[]", is_enabled: 1 },
    { id: "person_bob", name: "Bob", alias: null, roles_json: "[]", is_enabled: 1 }
  ]),
  getProjectsByIds: vi.fn(async () => [
    { id: "proj_1", code: "P1", name: "Project", owner_person_id: null, status: "active" }
  ]),
  getMerchantsByIds: vi.fn(async () => [
    {
      id: "merchant_1",
      code: "M1",
      name: "Merchant",
      project_id: "proj_1",
      merchant_type: "site",
      status: "active"
    }
  ]),
  getAccountsByIds: vi.fn(async () => [
    {
      id: "acct_usdt",
      name: "USDT Wallet",
      account_type: "usdt_wallet",
      currency_code: "USDT",
      owner_person_id: null,
      is_company_account: 1,
      allow_negative: 0,
      status: "active"
    },
    {
      id: "acct_aed_reserve",
      name: "AED Reserve",
      account_type: "currency_reserve",
      currency_code: "AED",
      owner_person_id: null,
      is_company_account: 1,
      allow_negative: 0,
      status: "active"
    },
    {
      id: "acct_petty_bob",
      name: "Bob AED Petty",
      account_type: "petty_cash",
      currency_code: "AED",
      owner_person_id: "person_bob",
      is_company_account: 0,
      allow_negative: 1,
      status: "active"
    }
  ]),
  getCategoriesByIds: vi.fn(async () => [
    {
      id: "cat_income",
      name: "Income",
      parent_id: null,
      category_type: "income",
      direction: "in",
      affects_expense_report: 0,
      affects_project_report: 1,
      requires_merchant: 1,
      requires_person: 0,
      requires_borrower: 0,
      is_enabled: 1
    },
    {
      id: "cat_bad_debt",
      name: "Bad Debt",
      parent_id: null,
      category_type: "loss",
      direction: "out",
      affects_expense_report: 1,
      affects_project_report: 0,
      requires_merchant: 0,
      requires_person: 0,
      requires_borrower: 1,
      is_enabled: 1
    }
  ]),
  getCurrenciesByCodes: vi.fn(async () => [
    { code: "USDT", name: "Tether", minor_units: 2, is_enabled: 1 },
    { code: "AED", name: "Dirham", minor_units: 2, is_enabled: 1 }
  ])
} satisfies MasterDataRepoMock;

return { repo, audit, masterData, service: new DocumentService(repo, audit, masterData) };
```

Add these tests:

```ts
it("keeps header-only draft creation flexible", async () => {
  const { repo, masterData, service } = createMocks();

  await service.createDraft({
    documentType: "project_income",
    businessDate: "2026-04-24",
    period: "2026-04",
    summary: "Header draft",
    createdBy: "creator_1"
  });

  expect(repo.createDraft).toHaveBeenCalled();
  expect(masterData.getAccountsByIds).not.toHaveBeenCalled();
});

it("rejects draft creation when provided exchange lines are structurally invalid", async () => {
  const { repo, service } = createMocks();

  await expect(
    service.createDraft({
      documentType: "exchange",
      businessDate: "2026-04-24",
      period: "2026-04",
      categoryId: "cat_exchange",
      summary: "Exchange",
      createdBy: "creator_1",
      lines: [{ accountId: "acct_aed_reserve", currencyCode: "AED", amountMinor: 10000 }]
    })
  ).rejects.toThrow("必须选择对方账户");

  expect(repo.createDraftWithLines).not.toHaveBeenCalled();
});

it("rejects submit when a draft is incomplete", async () => {
  const { repo, service } = createMocks({
    getDocument: vi.fn(async () => documentRow({ status: "draft", merchant_id: null })),
    getDocumentLines: vi.fn(async () => [lineRow()])
  });

  await expect(service.submit("doc_1", "submitter_1")).rejects.toThrow("项目收入必须选择商户");

  expect(repo.markSubmitted).not.toHaveBeenCalled();
});

it("rejects submit when referenced account is archived", async () => {
  const { repo, masterData, service } = createMocks({
    getDocument: vi.fn(async () =>
      documentRow({
        status: "draft",
        operator_person_id: "person_bob",
        project_id: "proj_1",
        merchant_id: "merchant_1",
        category_id: "cat_income"
      })
    ),
    getDocumentLines: vi.fn(async () => [lineRow()])
  });
  masterData.getAccountsByIds.mockResolvedValueOnce([
    {
      id: "acct_usdt",
      name: "Old USDT",
      account_type: "usdt_wallet",
      currency_code: "USDT",
      owner_person_id: null,
      is_company_account: 1,
      allow_negative: 0,
      status: "archived"
    }
  ]);

  await expect(service.submit("doc_1", "submitter_1")).rejects.toThrow("账户必须是启用状态");

  expect(repo.markSubmitted).not.toHaveBeenCalled();
});

it("rejects approve before posting when master data validation fails", async () => {
  const { repo, masterData, service } = createMocks({
    getDocument: vi.fn(async () =>
      documentRow({
        status: "pending",
        operator_person_id: "person_bob",
        project_id: "proj_1",
        merchant_id: "merchant_1",
        category_id: "cat_income"
      })
    ),
    getDocumentLines: vi.fn(async () => [lineRow()])
  });
  masterData.getMerchantsByIds.mockResolvedValueOnce([
    {
      id: "merchant_1",
      code: "M1",
      name: "Merchant",
      project_id: "proj_other",
      merchant_type: "site",
      status: "active"
    }
  ]);

  await expect(service.approve("doc_1", "reviewer_1")).rejects.toThrow("商户必须属于所选项目");

  expect(repo.approveWithPostings).not.toHaveBeenCalled();
});

it("approves reversal without checking historical master data active status", async () => {
  const { repo, masterData, service } = createMocks({
    getDocument: vi
      .fn()
      .mockResolvedValueOnce(
        documentRow({
          id: "doc_reversal",
          status: "pending",
          action_type: "reversal",
          original_document_id: "doc_original"
        })
      )
      .mockResolvedValueOnce(documentRow({ id: "doc_original", status: "approved" }))
  });
  masterData.getAccountsByIds.mockResolvedValueOnce([]);

  await service.approve("doc_reversal", "reviewer_1");

  expect(repo.approveWithPostings).toHaveBeenCalled();
});
```

- [ ] **Step 2: Run the service test to verify RED**

Run:

```bash
npm test -- tests/api/documentService.test.ts
```

Expected: fail because `DocumentService` does not accept the master-data dependency and does not call `documentRules`.

- [ ] **Step 3: Inject master data into DocumentService**

In `src/services/documentService.ts`, import:

```ts
import {
  assertNoDocumentRuleViolations,
  validateDocumentMasterData,
  validateDocumentStructure,
  type DocumentMasterDataSnapshot,
  type DocumentRuleLine
} from "../domain/documentRules";
import type { MasterDataRepository } from "../repositories/masterDataRepository";
```

Add the repository type:

```ts
type DocumentMasterDataRepository = Pick<
  MasterDataRepository,
  | "getPeopleByIds"
  | "getProjectsByIds"
  | "getMerchantsByIds"
  | "getAccountsByIds"
  | "getCategoriesByIds"
  | "getCurrenciesByCodes"
>;
```

Change the constructor:

```ts
  constructor(
    private readonly documents: DocumentWorkflowRepository,
    private readonly auditLogs: DocumentAuditRepository,
    private readonly masterData: DocumentMasterDataRepository
  ) {}
```

- [ ] **Step 4: Add service mapping helpers**

In `src/services/documentService.ts`, add helper functions after `nullableText`:

```ts
function documentForRules(document: DocumentDetailRow) {
  return {
    id: document.id,
    documentType: document.document_type,
    actionType: document.action_type,
    operatorPersonId: document.operator_person_id,
    projectId: document.project_id,
    merchantId: document.merchant_id,
    categoryId: document.category_id,
    originalDocumentId: document.original_document_id,
    summary: document.summary,
    businessDate: document.business_date,
    period: document.period
  };
}

function linesForRules(lines: DocumentLineRow[]): DocumentRuleLine[] {
  return lines.map((line) => ({
    accountId: line.account_id,
    counterpartyAccountId: line.counterparty_account_id,
    personId: line.person_id,
    borrowerPersonId: line.borrower_person_id,
    currencyCode: line.currency_code,
    amountMinor: line.amount_minor,
    usdtAmountMinor: line.usdt_amount_minor
  }));
}

function mapById<T extends { id: string }>(rows: T[]) {
  return new Map(rows.map((row) => [row.id, row]));
}

function mapCurrencies(rows: Array<{ code: string }>) {
  return new Map(rows.map((row) => [row.code, row]));
}

function uniqueTextValues(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value?.trim() ?? "").filter(Boolean))];
}
```

- [ ] **Step 5: Add validation orchestration**

Inside `DocumentService`, add:

```ts
  private validateDraftLineShape(input: CreateDraftRequest, lines: DocumentRuleLine[]) {
    assertNoDocumentRuleViolations(
      validateDocumentStructure({
        stage: "draft",
        document: {
          documentType: input.documentType,
          actionType: input.actionType ?? "normal",
          operatorPersonId: nullableText(input.operatorPersonId),
          projectId: nullableText(input.projectId),
          merchantId: nullableText(input.merchantId),
          categoryId: nullableText(input.categoryId),
          originalDocumentId: nullableText(input.originalDocumentId),
          summary: input.summary,
          businessDate: input.businessDate,
          period: input.period
        },
        lines
      })
    );
  }

  private async validatePersistedDocument(document: DocumentDetailRow, stage: "submit" | "approve") {
    const lines = await this.documents.getDocumentLines(document.id);
    const ruleDocument = documentForRules(document);
    const ruleLines = linesForRules(lines);

    assertNoDocumentRuleViolations(validateDocumentStructure({ stage, document: ruleDocument, lines: ruleLines }));

    const originalDocumentId = document.original_document_id?.trim() ?? "";
    const originalDocument = originalDocumentId ? await this.requireDocument(originalDocumentId) : null;
    const originalLines = originalDocument ? await this.documents.getDocumentLines(originalDocument.id) : [];
    const masterData = await this.loadMasterDataSnapshot(document, lines, originalDocument, originalLines);

    assertNoDocumentRuleViolations(
      validateDocumentMasterData({
        document: ruleDocument,
        lines: ruleLines,
        masterData,
        originalDocument: originalDocument
          ? {
              id: originalDocument.id,
              documentType: originalDocument.document_type,
              status: originalDocument.status,
              borrowerPersonId: firstBorrower(originalLines)
            }
          : null,
        originalLines: linesForRules(originalLines)
      })
    );

    return lines;
  }

  private async loadMasterDataSnapshot(
    document: DocumentDetailRow,
    lines: DocumentLineRow[],
    originalDocument: DocumentDetailRow | null,
    originalLines: DocumentLineRow[]
  ): Promise<DocumentMasterDataSnapshot> {
    const allLines = document.action_type === "reversal" ? [] : lines;
    const people = uniqueTextValues([
      document.operator_person_id,
      ...allLines.map((line) => line.person_id),
      ...allLines.map((line) => line.borrower_person_id)
    ]);
    const projects = uniqueTextValues([document.project_id]);
    const merchants = uniqueTextValues([document.merchant_id]);
    const accounts = uniqueTextValues([
      ...allLines.map((line) => line.account_id),
      ...allLines.map((line) => line.counterparty_account_id)
    ]);
    const categories = uniqueTextValues([document.category_id]);
    const currencies = uniqueTextValues([
      ...allLines.map((line) => line.currency_code),
      ...originalLines.map((line) => line.currency_code)
    ]);

    const [peopleRows, projectRows, merchantRows, accountRows, categoryRows, currencyRows] = await Promise.all([
      this.masterData.getPeopleByIds(people),
      this.masterData.getProjectsByIds(projects),
      this.masterData.getMerchantsByIds(merchants),
      this.masterData.getAccountsByIds(accounts),
      this.masterData.getCategoriesByIds(categories),
      this.masterData.getCurrenciesByCodes(currencies)
    ]);

    return {
      people: mapById(peopleRows),
      projects: mapById(projectRows),
      merchants: mapById(merchantRows),
      accounts: mapById(accountRows),
      categories: mapById(categoryRows),
      currencies: mapCurrencies(currencyRows)
    };
  }
```

The `originalDocument` parameter is used for loan and reversal validation. The loader must not add original document account, project, merchant, or category ids for reversal active-state validation.

- [ ] **Step 6: Wire create, submit, and approve**

In `createDraft`, after normalizing provided lines and before repository writes, call `validateDraftLineShape`:

```ts
    const normalizedLines =
      Array.isArray(input.lines) && input.lines.length > 0
        ? normalizeDocumentLines(input.lines, { documentType: input.documentType })
        : [];

    if (normalizedLines.length > 0) {
      this.validateDraftLineShape(input, normalizedLines);
    }
```

Then pass `normalizedLines` to `createDraftWithLines`.

In `submit`, call persisted validation before `markSubmitted`:

```ts
    await this.validatePersistedDocument(document, "submit");
```

In `approve`, call persisted validation after the period lock check and before reversal or posting effects:

```ts
    const validatedLines = await this.validatePersistedDocument(document, "approve");

    if (document.action_type === "reversal") {
      await this.approveReversal(document, reviewer, approvalPeriod);
      return;
    }

    const lines = validatedLines;
```

- [ ] **Step 7: Update API construction**

In `src/api/documents.ts`, import `MasterDataRepository` and construct the service with it:

```ts
function documentService(env: { DB: D1Database }) {
  return new DocumentService(
    documentRepository(env),
    new AuditLogRepository(env.DB),
    new MasterDataRepository(env.DB)
  );
}
```

- [ ] **Step 8: Run service tests to verify GREEN**

Run:

```bash
npm test -- tests/domain/documentRules.test.ts tests/api/masterDataRepository.test.ts tests/api/documentService.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit Task 3**

```bash
git add src/services/documentService.ts src/api/documents.ts tests/api/documentService.test.ts
git commit -m "feat: enforce document governance in service"
```

---

### Task 4: API Error Coverage

**Files:**
- Modify: `tests/api/documents.test.ts`

- [ ] **Step 1: Add API tests for governance errors**

Append to `tests/api/documents.test.ts`:

```ts
it("returns 400 when submit governance rejects an incomplete draft", async () => {
  const response = await submitDocument({
    request: new Request("https://ledger.test/api/documents/doc_1/submit", {
      method: "POST",
      body: JSON.stringify({ actor: "user_1" })
    }),
    env: mockEnv({
      firstResult: documentRow({ status: "draft", merchant_id: null }),
      allResultsQueue: [[lineRow()]]
    }),
    params: { id: "doc_1" }
  });

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: "项目收入必须选择商户" });
});

it("returns 400 when approve governance rejects master data relationships", async () => {
  const response = await approveDocument({
    request: new Request("https://ledger.test/api/documents/doc_1/approve", {
      method: "POST",
      body: JSON.stringify({ reviewer: "reviewer_1" })
    }),
    env: mockEnv({
      firstResults: [documentRow({ status: "pending", merchant_id: "merchant_1", project_id: "proj_1" }), null],
      allResultsQueue: [
        [lineRow()],
        [{ id: "user_1", name: "User", alias: null, roles_json: "[]", is_enabled: 1 }],
        [{ id: "proj_1", code: "P1", name: "Project", owner_person_id: null, status: "active" }],
        [
          {
            id: "merchant_1",
            code: "M1",
            name: "Merchant",
            project_id: "proj_other",
            merchant_type: "site",
            status: "active"
          }
        ],
        [
          {
            id: "acct_usdt",
            name: "USDT",
            account_type: "usdt_wallet",
            currency_code: "USDT",
            owner_person_id: null,
            is_company_account: 1,
            allow_negative: 0,
            status: "active"
          }
        ],
        [
          {
            id: "cat_income",
            name: "Income",
            parent_id: null,
            category_type: "income",
            direction: "in",
            affects_expense_report: 0,
            affects_project_report: 1,
            requires_merchant: 1,
            requires_person: 0,
            requires_borrower: 0,
            is_enabled: 1
          }
        ],
        [{ code: "USDT", name: "Tether", minor_units: 2, is_enabled: 1 }]
      ]
    }),
    params: { id: "doc_1" }
  });

  expect(response.status).toBe(400);
  await expect(response.json()).resolves.toEqual({ error: "商户必须属于所选项目" });
});
```

- [ ] **Step 2: Run API tests**

Run:

```bash
npm test -- tests/api/documents.test.ts
```

Expected: PASS after the queue order is aligned with the service validation reads.

- [ ] **Step 3: Commit Task 4**

```bash
git add tests/api/documents.test.ts
git commit -m "test: cover document governance API errors"
```

---

### Task 5: Frontend Derived Entry Rules

**Files:**
- Create: `src/app/pages/documents/documentEntryRules.ts`
- Create: `src/app/pages/documents/documentEntryRules.test.ts`
- Modify: `src/app/pages/documents/documentEntryModel.ts`
- Modify: `src/app/pages/documents/documentEntryModel.test.ts`

- [ ] **Step 1: Write failing frontend derived-state tests**

Create `src/app/pages/documents/documentEntryRules.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { deriveDocumentEntryState } from "./documentEntryRules";
import { createInitialDocumentForm } from "./documentEntryModel";
import type { DocumentEntryOptions } from "./documentEntryTypes";

const options: DocumentEntryOptions = {
  people: [
    { id: "person_ops", name: "Ops", alias: null, roles_json: "[]", is_enabled: 1 },
    { id: "person_bob", name: "Bob", alias: null, roles_json: "[]", is_enabled: 1 }
  ],
  projects: [{ id: "proj_1", code: "P1", name: "Project", owner_person_id: null, status: "active" }],
  merchants: [
    { id: "merchant_1", code: "M1", name: "Merchant", project_id: "proj_1", merchant_type: "site", status: "active" }
  ],
  accounts: [
    {
      id: "acct_company_aed",
      name: "AED Reserve",
      account_type: "currency_reserve",
      currency_code: "AED",
      owner_person_id: null,
      is_company_account: 1,
      allow_negative: 0,
      status: "active"
    },
    {
      id: "acct_usdt",
      name: "USDT Wallet",
      account_type: "usdt_wallet",
      currency_code: "USDT",
      owner_person_id: null,
      is_company_account: 1,
      allow_negative: 0,
      status: "active"
    },
    {
      id: "acct_petty_bob",
      name: "Bob AED Petty",
      account_type: "petty_cash",
      currency_code: "AED",
      owner_person_id: "person_bob",
      is_company_account: 0,
      allow_negative: 1,
      status: "active"
    }
  ],
  currencies: [
    { code: "AED", name: "Dirham", minor_units: 2, is_enabled: 1 },
    { code: "USDT", name: "Tether", minor_units: 2, is_enabled: 1 }
  ],
  categories: [
    {
      id: "cat_reimburse_person",
      name: "Staff Expense",
      parent_id: null,
      category_type: "expense",
      direction: "out",
      affects_expense_report: 1,
      affects_project_report: 0,
      requires_merchant: 0,
      requires_person: 1,
      requires_borrower: 0,
      is_enabled: 1
    },
    {
      id: "cat_reimburse_merchant",
      name: "Merchant Expense",
      parent_id: null,
      category_type: "expense",
      direction: "out",
      affects_expense_report: 1,
      affects_project_report: 1,
      requires_merchant: 1,
      requires_person: 0,
      requires_borrower: 0,
      is_enabled: 1
    }
  ]
};

describe("document entry derived rules", () => {
  it("adds required fields from category flags", () => {
    const form = {
      ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
      documentType: "petty_cash_reimbursement" as const,
      categoryId: "cat_reimburse_merchant"
    };

    const state = deriveDocumentEntryState(form, options, []);

    expect(state.visibleFields).toContain("projectId");
    expect(state.visibleFields).toContain("merchantId");
    expect(state.requiredFields).toContain("projectId");
    expect(state.requiredFields).toContain("merchantId");
  });

  it("filters merchant options by selected project", () => {
    const form = {
      ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
      projectId: "proj_1"
    };

    const state = deriveDocumentEntryState(form, options, []);

    expect(state.optionsByField.merchantId?.map((merchant) => merchant.id)).toEqual(["merchant_1"]);
  });

  it("filters petty cash accounts by selected person", () => {
    const form = {
      ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
      documentType: "petty_cash_reimbursement" as const,
      personId: "person_bob"
    };

    const state = deriveDocumentEntryState(form, options, []);

    expect(state.optionsByField.accountId?.map((account) => account.id)).toEqual(["acct_petty_bob"]);
  });

  it("reports residual merchant selections after project changes", () => {
    const form = {
      ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
      projectId: "",
      merchantId: "merchant_1"
    };

    const state = deriveDocumentEntryState(form, options, []);

    expect(state.validationErrors).toContain("商户必须属于所选项目");
  });

  it("disables currency when primary account is selected", () => {
    const form = {
      ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
      accountId: "acct_company_aed"
    };

    const state = deriveDocumentEntryState(form, options, []);

    expect(state.disabledFields).toContain("currencyCode");
  });
});
```

- [ ] **Step 2: Run frontend derived-state tests to verify RED**

Run:

```bash
npm test -- src/app/pages/documents/documentEntryRules.test.ts
```

Expected: fail because `documentEntryRules.ts` does not exist.

- [ ] **Step 3: Implement derived state module**

Create `src/app/pages/documents/documentEntryRules.ts`:

```ts
import type {
  AccountOption,
  CategoryOption,
  DocumentEntryForm,
  DocumentEntryOptions,
  DocumentFieldKey,
  MerchantOption,
  OriginalDocumentOption
} from "./documentEntryTypes";
import {
  accountCurrencyCode,
  categoryOptionsForDocumentType,
  companyAccounts,
  getVisibleFieldKeys,
  isOriginalDocumentFieldRequired,
  merchantOptionsForProject,
  pettyCashAccountsForPerson
} from "./documentEntryModel";

export interface DocumentEntryState {
  visibleFields: DocumentFieldKey[];
  requiredFields: DocumentFieldKey[];
  disabledFields: DocumentFieldKey[];
  optionsByField: {
    originalDocumentId?: OriginalDocumentOption[];
    operatorPersonId?: DocumentEntryOptions["people"];
    personId?: DocumentEntryOptions["people"];
    borrowerPersonId?: DocumentEntryOptions["people"];
    projectId?: DocumentEntryOptions["projects"];
    merchantId?: MerchantOption[];
    categoryId?: CategoryOption[];
    accountId?: AccountOption[];
    counterpartyAccountId?: AccountOption[];
    currencyCode?: DocumentEntryOptions["currencies"];
  };
  validationErrors: string[];
}

export function deriveDocumentEntryState(
  form: DocumentEntryForm,
  options: DocumentEntryOptions,
  originalDocuments: OriginalDocumentOption[]
): DocumentEntryState {
  const selectedCategory = options.categories.find((category) => category.id === form.categoryId);
  const visibleFields = dynamicVisibleFields(form, selectedCategory);
  const requiredFields = dynamicRequiredFields(form, visibleFields, selectedCategory);
  const selectedAccountCurrency = accountCurrencyCode(options, form.accountId);
  const companyAccountOptions = companyAccounts(options);
  const personPettyCashAccountOptions = pettyCashAccountsForPerson(options, form.personId);
  const accountOptions = primaryAccountOptions(form, options);
  const counterpartyAccountOptions = counterpartyOptions(form, companyAccountOptions, personPettyCashAccountOptions, selectedAccountCurrency);
  const merchantOptions = merchantOptionsForProject(options, form.projectId);

  const state: DocumentEntryState = {
    visibleFields,
    requiredFields,
    disabledFields: form.accountId ? ["currencyCode"] : [],
    optionsByField: {
      originalDocumentId: originalDocuments,
      operatorPersonId: options.people,
      personId: options.people,
      borrowerPersonId: options.people,
      projectId: options.projects,
      merchantId: merchantOptions,
      categoryId: categoryOptionsForDocumentType(options, form.documentType),
      accountId: accountOptions,
      counterpartyAccountId: counterpartyAccountOptions,
      currencyCode: options.currencies
    },
    validationErrors: []
  };

  state.validationErrors = residualSelectionErrors(form, state);
  return state;
}

function dynamicVisibleFields(form: DocumentEntryForm, selectedCategory: CategoryOption | undefined): DocumentFieldKey[] {
  const fields = new Set(getVisibleFieldKeys(form.documentType, form.actionType));
  if (form.documentType === "petty_cash_reimbursement" && selectedCategory?.requires_merchant) {
    fields.add("projectId");
    fields.add("merchantId");
  }
  if (form.documentType === "petty_cash_reimbursement" && selectedCategory?.requires_person) {
    fields.add("personId");
  }
  if (form.documentType === "petty_cash_reimbursement" && selectedCategory?.requires_borrower) {
    fields.add("borrowerPersonId");
  }
  return [...fields];
}

function dynamicRequiredFields(
  form: DocumentEntryForm,
  visibleFields: DocumentFieldKey[],
  selectedCategory: CategoryOption | undefined
): DocumentFieldKey[] {
  const required = new Set<DocumentFieldKey>();
  for (const field of visibleFields) {
    if (field === "originalDocumentId" && !isOriginalDocumentFieldRequired(form.documentType, form.actionType)) continue;
    if (field === "projectId" && form.documentType === "loan_writeoff") continue;
    if (field === "merchantId" && form.documentType !== "project_income" && !selectedCategory?.requires_merchant) continue;
    if (field === "operatorPersonId" && form.documentType === "petty_cash_reimbursement") continue;
    required.add(field);
  }
  return [...required];
}

function primaryAccountOptions(form: DocumentEntryForm, options: DocumentEntryOptions) {
  if (form.documentType === "petty_cash_return" || form.documentType === "petty_cash_reimbursement") {
    return pettyCashAccountsForPerson(options, form.personId);
  }
  return companyAccounts(options);
}

function accountsWithCurrency(accounts: AccountOption[], currencyCode: string) {
  if (!currencyCode) return accounts;
  return accounts.filter((account) => account.currency_code === currencyCode);
}

function counterpartyOptions(
  form: DocumentEntryForm,
  companyAccountOptions: AccountOption[],
  personPettyCashAccountOptions: AccountOption[],
  selectedAccountCurrency: string
) {
  if (form.documentType === "exchange") return accountsWithCurrency(companyAccountOptions, "USDT");
  if (form.documentType === "account_transfer") {
    return accountsWithCurrency(companyAccountOptions, selectedAccountCurrency).filter((account) => account.id !== form.accountId);
  }
  if (form.documentType === "petty_cash_issue") return accountsWithCurrency(personPettyCashAccountOptions, selectedAccountCurrency);
  if (form.documentType === "petty_cash_return") return accountsWithCurrency(companyAccountOptions, selectedAccountCurrency);
  return accountsWithCurrency(companyAccountOptions, selectedAccountCurrency);
}

function residualSelectionErrors(form: DocumentEntryForm, state: DocumentEntryState) {
  const errors: string[] = [];
  if (form.merchantId && !state.optionsByField.merchantId?.some((merchant) => merchant.id === form.merchantId)) {
    errors.push("商户必须属于所选项目");
  }
  if (form.accountId && !state.optionsByField.accountId?.some((account) => account.id === form.accountId)) {
    errors.push("账户不适用于当前单据类型");
  }
  if (
    form.counterpartyAccountId &&
    !state.optionsByField.counterpartyAccountId?.some((account) => account.id === form.counterpartyAccountId)
  ) {
    errors.push("对方账户不适用于当前单据类型");
  }
  if (form.categoryId && !state.optionsByField.categoryId?.some((category) => category.id === form.categoryId)) {
    errors.push("科目类型不适用于当前单据类型");
  }
  return errors;
}
```

- [ ] **Step 4: Delegate validation in documentEntryModel**

Update `validateDocumentForm` in `src/app/pages/documents/documentEntryModel.ts` to accept an optional derived state:

```ts
export function validateDocumentForm(
  form: DocumentEntryForm,
  options: DocumentEntryOptions,
  currentActorId: string,
  entryState?: { requiredFields: DocumentFieldKey[]; validationErrors: string[] }
): string[] {
  const errors: string[] = [];
  if (!currentActorId.trim()) errors.push("请选择当前操作人");
  if (options.people.length === 0) errors.push("请先到基础资料维护人员");
  if (options.currencies.length === 0) errors.push("请先到基础资料维护币种");
  if (isOriginalDocumentFieldRequired(form.documentType, form.actionType) && !form.originalDocumentId.trim()) {
    errors.push("请选择原单据");
  }

  const requiredFields = entryState?.requiredFields ?? getVisibleFieldKeys(form.documentType, form.actionType);
  for (const field of requiredFields) {
    if (field === "originalDocumentId") continue;
    if (!form[field].trim()) errors.push(`请选择或填写${fieldLabels[field]}`);
  }

  if (
    form.documentType === "account_transfer" &&
    form.accountId.trim() &&
    form.counterpartyAccountId.trim() &&
    form.accountId.trim() === form.counterpartyAccountId.trim()
  ) {
    errors.push("转出账户和转入账户不能相同");
  }
  const selectedAccountCurrency = accountCurrencyCode(options, form.accountId.trim());
  if (
    selectedAccountCurrency &&
    form.currencyCode.trim() &&
    selectedAccountCurrency.toUpperCase() !== form.currencyCode.trim().toUpperCase()
  ) {
    errors.push("币种必须与账户币种一致");
  }
  return [...errors, ...(entryState?.validationErrors ?? [])];
}
```

- [ ] **Step 5: Run frontend model tests**

Run:

```bash
npm test -- src/app/pages/documents/documentEntryRules.test.ts src/app/pages/documents/documentEntryModel.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit Task 5**

```bash
git add src/app/pages/documents/documentEntryRules.ts src/app/pages/documents/documentEntryRules.test.ts src/app/pages/documents/documentEntryModel.ts src/app/pages/documents/documentEntryModel.test.ts
git commit -m "feat: derive document entry field rules"
```

---

### Task 6: Frontend Wiring

**Files:**
- Modify: `src/app/pages/documents/DocumentTypeFields.tsx`
- Modify: `src/app/pages/DocumentsPage.tsx`
- Modify: `src/app/pages/documents/documentEntryModel.test.ts`

- [ ] **Step 1: Update field component props**

In `src/app/pages/documents/DocumentTypeFields.tsx`, import `DocumentEntryState`:

```ts
import type { DocumentEntryState } from "./documentEntryRules";
```

Update props:

```ts
interface DocumentTypeFieldsProps {
  form: DocumentEntryForm;
  setForm: Dispatch<SetStateAction<DocumentEntryForm>>;
  entryState: DocumentEntryState;
  originalDocuments: OriginalDocumentOption[];
}
```

Use `const fields = entryState.visibleFields;` and replace local option calculations with `entryState.optionsByField`.

- [ ] **Step 2: Centralize dependent field clearing**

In `DocumentTypeFields.tsx`, update the field handlers:

```ts
function updateProject(value: string) {
  setForm((current) => ({ ...current, projectId: value, merchantId: "" }));
}

function updatePerson(value: string) {
  setForm((current) => ({ ...current, personId: value, accountId: "", counterpartyAccountId: "" }));
}

function updateCategory(value: string) {
  setForm((current) => ({
    ...current,
    categoryId: value,
    merchantId: "",
    borrowerPersonId: current.documentType === "petty_cash_reimbursement" ? "" : current.borrowerPersonId
  }));
}

function updateAccount(key: "accountId" | "counterpartyAccountId", value: string) {
  setForm((current) => ({
    ...current,
    [key]: value,
    currencyCode:
      key === "accountId" && value
        ? entryState.optionsByField.accountId?.find((account) => account.id === value)?.currency_code ?? current.currencyCode
        : current.currencyCode,
    counterpartyAccountId: key === "accountId" ? "" : value
  }));
}
```

- [ ] **Step 3: Render derived required and disabled states**

In every `SelectField`, set:

```tsx
required={entryState.requiredFields.includes("fieldName" as DocumentFieldKey)}
disabled={entryState.disabledFields.includes("fieldName" as DocumentFieldKey)}
```

Use concrete field names in the actual component, for example:

```tsx
required={entryState.requiredFields.includes("merchantId")}
disabled={entryState.disabledFields.includes("merchantId") || !form.projectId}
```

Use `entryState.optionsByField.accountId ?? []`, `entryState.optionsByField.counterpartyAccountId ?? []`, and `entryState.optionsByField.currencyCode ?? []` for option lists.

- [ ] **Step 4: Compute derived state in DocumentsPage**

In `src/app/pages/DocumentsPage.tsx`, import:

```ts
import { deriveDocumentEntryState } from "./documents/documentEntryRules";
```

Add:

```ts
const entryState = useMemo(
  () => deriveDocumentEntryState(form, entryOptions, originalDocuments),
  [entryOptions, form, originalDocuments]
);
```

Pass it to validation and field rendering:

```ts
const validationErrors = validateDocumentForm(form, entryOptions, currentActorId, entryState);
```

```tsx
<DocumentTypeFields
  form={form}
  setForm={setForm}
  entryState={entryState}
  originalDocuments={originalDocuments}
/>
```

- [ ] **Step 5: Show derived errors below original document errors**

In `DocumentsPage.tsx`, below `originalDocumentsError`, render:

```tsx
{entryState.validationErrors.length > 0 ? (
  <div className="notice error wide-field">{entryState.validationErrors.join("；")}</div>
) : null}
```

- [ ] **Step 6: Run frontend tests and type check**

Run:

```bash
npm test -- src/app/pages/documents/documentEntryRules.test.ts src/app/pages/documents/documentEntryModel.test.ts src/app/pages/DocumentsPage.test.ts
npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 7: Commit Task 6**

```bash
git add src/app/pages/documents/DocumentTypeFields.tsx src/app/pages/DocumentsPage.tsx src/app/pages/documents/documentEntryModel.test.ts
git commit -m "feat: wire derived document entry rules"
```

---

### Task 7: Full Verification and Browser Smoke

**Files:**
- Modify only if verification exposes a concrete defect.

- [ ] **Step 1: Run focused backend tests**

Run:

```bash
npm test -- tests/domain/documentRules.test.ts tests/api/masterDataRepository.test.ts tests/api/documentService.test.ts tests/api/documents.test.ts
```

Expected: PASS.

- [ ] **Step 2: Run focused frontend tests**

Run:

```bash
npm test -- src/app/pages/documents/documentEntryRules.test.ts src/app/pages/documents/documentEntryModel.test.ts src/app/pages/DocumentsPage.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run full validation**

Run:

```bash
npm test
npx tsc --noEmit
npm run build
```

Expected: all commands pass.

- [ ] **Step 4: Start or reuse local dev server**

If no dev server is already running on `8787`, run:

```bash
npm run cf:dev -- --port 8787
```

Expected: local app is reachable at `http://localhost:8787/`.

- [ ] **Step 5: Browser smoke**

Using the in-app browser at `http://localhost:8787/`, verify:

- 单据录入页 loads without console errors.
- 当前操作人 only shows people from master data options.
- 项目收入 requires project, merchant, category, account, currency, amount, and summary.
- Changing project clears merchant.
- 备用金报销 category flags change visible and required fields.
- Selecting a person filters petty cash accounts to that person.
- Selecting an account locks currency to the account currency.
- Submit of an incomplete draft returns a clear backend error.
- Approval of a document with mismatched merchant/project returns a clear backend error.

- [ ] **Step 6: Commit verification fixes**

If Step 1 through Step 5 required fixes, commit them:

```bash
git add <changed-files>
git commit -m "fix: harden document entry governance"
```

If no files changed, do not create a commit.

---

## Final Acceptance

The implementation is complete when:

- Header-only drafts still save.
- Drafts with provided lines reject line structures that do not match the selected document type.
- Incomplete drafts cannot submit.
- Submit rejects archived projects, merchants, accounts, disabled people, disabled currencies, and disabled categories.
- Submit rejects mismatched merchant/project, account/currency, petty-cash/person, and category/type relationships.
- Approve repeats the same governance checks before posting, FIFO, loan, and reversal effects.
- Reversal still approves from historical original entries without requiring original master data to remain active.
- Loan writeoff remains accountless.
- Frontend document fields, required state, disabled state, and options come from `deriveDocumentEntryState`.
- Existing document payload shape remains compatible with `/api/documents`.
- `npm test`, `npx tsc --noEmit`, and `npm run build` pass.
