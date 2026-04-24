# Loan Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Complete the formal loan lifecycle so loan out, repayment, writeoff, aging, allocation history, and safe reversal remain traceable from approved source documents.

**Architecture:** Keep `loan_entries` as the signed aggregate borrower balance ledger. Add `loan_items` as loan principal batches created by approved `loan_out` documents and `loan_allocations` as signed reductions or restorations against those batches. Approval remains one guarded D1 batch that writes account entries, loan entries, loan item updates, allocation rows, audit, and document status together.

**Tech Stack:** Cloudflare Workers, D1 SQLite, TypeScript, Vite, Vitest, React.

---

## Design Source

Use the approved formal-system spec as the business source:

- `docs/superpowers/specs/2026-04-24-management-ledger-formal-system-design.md`
- Section `7.7 借款支出单`
- Section `7.8 借款收回单`
- Section `7.9 借款核销单`
- Section `9.4 借款报表`
- Phase list item `4. 借款闭环`

This plan intentionally preserves the current source-document workflow. It does not introduce a separate loan CRUD module. A loan exists because an approved `loan_out` document created one or more `loan_items`.

## Scope

In scope:

- `loan_out` creates loan items with original amount, remaining amount, original USDT cost, and remaining USDT cost.
- `loan_repayment` reduces existing loan items by borrower, currency, and optional linked loan source document.
- `loan_writeoff` reduces existing loan items and records expense/loss reporting data through allocations and document metadata.
- If no linked loan source document is supplied, repayment and writeoff consume oldest open loan items first.
- Reversal of loan documents also restores or closes `loan_items` safely, using the same conservative rule as FIFO reversal: reject if affected loan items have later allocation movements.
- Loan balance, open loan aging, loan allocation detail, and loan writeoff reports are available through the API and report page.
- Approval batch guards prevent stale loan item writes.
- A partial unique index prevents more than one approved reversal per original document.

Out of scope:

- Attachment upload and file storage.
- Role permission enforcement beyond existing actor/reviewer fields.
- UI lookup selectors for people/accounts/projects.
- Complex manual override for unsafe loan reversals.
- Export to Excel/PDF.

## Data Rules

- Positive `loan_entries.amount_minor` increases borrower receivable.
- Negative `loan_entries.amount_minor` decreases borrower receivable.
- `loan_items.remaining_amount_minor` is the open principal amount for an approved `loan_out` line.
- `loan_allocations.amount_minor` is signed:
  - positive for repayment, writeoff, and loan-out reversal reductions.
  - negative for repayment/writeoff reversal restorations.
- `loan_allocations.usdt_cost_minor` uses the same sign as `amount_minor`.
- For USDT loans, `usdt_cost_minor` equals `amount_minor`.
- For non-USDT `loan_out`, `usdt_amount_minor` is required because management reports use USDT cost.
- `loan_writeoff` has no account entry because no cash moves.
- `loan_writeoff` must have `category_id`; `project_id` is optional and used when the loss belongs to a project.
- Normal `loan_repayment` or `loan_writeoff` may set `original_document_id` to target one loan-out document. For `action_type = reversal`, `original_document_id` keeps its current meaning: the document being reversed.

## File Structure

Create:

- `src/domain/loanEffects.ts` - pure planner for loan item creation and loan reduction allocation.
- `src/domain/loanReversal.ts` - pure planner for safe reversal of loan item effects.
- `tests/domain/loanEffects.test.ts` - tests for loan creation and repayment/writeoff allocation.
- `tests/domain/loanReversal.test.ts` - tests for safe loan item reversal.
- `migrations/0005_loan_closure.sql` - schema for `loan_items`, `loan_allocations`, indexes, and approved reversal uniqueness.

Modify:

- `src/domain/posting.ts` - support `loan_writeoff`, loan entry USDT cost, and loan-specific validation.
- `src/domain/reversalPosting.ts` - preserve and negate `usdtCostMinor` on loan entries.
- `src/repositories/documentRepository.ts` - read/write loan item effects inside guarded approval batches.
- `src/services/documentService.ts` - plan loan effects during approval and safe loan reversal.
- `src/repositories/reportRepository.ts` - add loan aging, allocation detail, and writeoff report queries.
- `src/api/reports.ts` and `src/worker/router.ts` - expose new report endpoints.
- `src/app/pages/ReportsPage.tsx` - show the first loan closure report tables.
- Existing tests under `tests/domain`, `tests/api`, and `src/app/pages`.

---

## Task 1: Add Loan Domain Effects

**Files:**

- Create: `src/domain/loanEffects.ts`
- Create: `tests/domain/loanEffects.test.ts`

- [ ] **Step 1: Write failing domain tests**

Create `tests/domain/loanEffects.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  planLoanOutEffects,
  planLoanReductionEffects,
  type OpenLoanItem
} from "../../src/domain/loanEffects";

const openLoanItems: OpenLoanItem[] = [
  {
    id: "loan_item_old",
    sourceDocumentId: "doc_old_loan",
    borrowerPersonId: "person_borrower",
    currencyCode: "AED",
    remainingAmountMinor: 100000,
    remainingUsdtCostMinor: 27000,
    loanDate: "2026-04-01",
    createdAt: "2026-04-01T10:00:00.000Z"
  },
  {
    id: "loan_item_new",
    sourceDocumentId: "doc_new_loan",
    borrowerPersonId: "person_borrower",
    currencyCode: "AED",
    remainingAmountMinor: 50000,
    remainingUsdtCostMinor: 14000,
    loanDate: "2026-04-03",
    createdAt: "2026-04-03T10:00:00.000Z"
  }
];

describe("loanEffects", () => {
  it("creates one loan item per loan-out line with explicit USDT cost", () => {
    expect(
      planLoanOutEffects({
        documentId: "doc_loan",
        borrowerPersonId: "person_borrower",
        loanDate: "2026-04-25",
        lines: [
          { lineId: "line_1", currencyCode: "AED", amountMinor: 367000, usdtCostMinor: 100000 }
        ]
      })
    ).toEqual({
      loanItemCreations: [
        {
          clientLoanItemId: "doc_loan:loan:1",
          sourceDocumentId: "doc_loan",
          sourceLineId: "line_1",
          borrowerPersonId: "person_borrower",
          currencyCode: "AED",
          originalAmountMinor: 367000,
          remainingAmountMinor: 367000,
          originalUsdtCostMinor: 100000,
          remainingUsdtCostMinor: 100000,
          loanDate: "2026-04-25"
        }
      ],
      loanItemUpdates: [],
      loanAllocations: []
    });
  });

  it("defaults USDT loan cost to principal amount", () => {
    const result = planLoanOutEffects({
      documentId: "doc_loan",
      borrowerPersonId: "person_borrower",
      loanDate: "2026-04-25",
      lines: [{ lineId: "line_1", currencyCode: "USDT", amountMinor: 50000, usdtCostMinor: null }]
    });

    expect(result.loanItemCreations[0].originalUsdtCostMinor).toBe(50000);
    expect(result.loanItemCreations[0].remainingUsdtCostMinor).toBe(50000);
  });

  it("requires explicit USDT cost for non-USDT loan out", () => {
    expect(() =>
      planLoanOutEffects({
        documentId: "doc_loan",
        borrowerPersonId: "person_borrower",
        loanDate: "2026-04-25",
        lines: [{ lineId: "line_1", currencyCode: "AED", amountMinor: 100000, usdtCostMinor: null }]
      })
    ).toThrow("line usdtCostMinor is required for non-USDT loan_out");
  });

  it("allocates repayment to oldest open loan items first", () => {
    expect(
      planLoanReductionEffects({
        documentId: "doc_repay",
        borrowerPersonId: "person_borrower",
        currencyCode: "AED",
        amountMinor: 120000,
        reductionDate: "2026-04-25",
        allocationType: "repayment",
        openLoanItems
      })
    ).toEqual({
      loanItemCreations: [],
      loanItemUpdates: [
        {
          loanItemId: "loan_item_old",
          amountDeltaMinor: -100000,
          usdtCostDeltaMinor: -27000,
          expectedRemainingAmountMinor: 100000,
          expectedRemainingUsdtCostMinor: 27000
        },
        {
          loanItemId: "loan_item_new",
          amountDeltaMinor: -20000,
          usdtCostDeltaMinor: -5600,
          expectedRemainingAmountMinor: 50000,
          expectedRemainingUsdtCostMinor: 14000
        }
      ],
      loanAllocations: [
        {
          loanItemId: "loan_item_old",
          allocationType: "repayment",
          amountMinor: 100000,
          usdtCostMinor: 27000,
          allocationDate: "2026-04-25"
        },
        {
          loanItemId: "loan_item_new",
          allocationType: "repayment",
          amountMinor: 20000,
          usdtCostMinor: 5600,
          allocationDate: "2026-04-25"
        }
      ]
    });
  });

  it("targets one loan-out document when targetSourceDocumentId is supplied", () => {
    const result = planLoanReductionEffects({
      documentId: "doc_repay",
      borrowerPersonId: "person_borrower",
      currencyCode: "AED",
      amountMinor: 30000,
      reductionDate: "2026-04-25",
      allocationType: "repayment",
      targetSourceDocumentId: "doc_new_loan",
      openLoanItems
    });

    expect(result.loanAllocations.map((allocation) => allocation.loanItemId)).toEqual(["loan_item_new"]);
  });

  it("plans writeoff allocations with writeoff type", () => {
    const result = planLoanReductionEffects({
      documentId: "doc_writeoff",
      borrowerPersonId: "person_borrower",
      currencyCode: "AED",
      amountMinor: 25000,
      reductionDate: "2026-04-25",
      allocationType: "writeoff",
      openLoanItems
    });

    expect(result.loanAllocations).toEqual([
      {
        loanItemId: "loan_item_old",
        allocationType: "writeoff",
        amountMinor: 25000,
        usdtCostMinor: 6750,
        allocationDate: "2026-04-25"
      }
    ]);
  });

  it("throws when loan balance is insufficient", () => {
    expect(() =>
      planLoanReductionEffects({
        documentId: "doc_repay",
        borrowerPersonId: "person_borrower",
        currencyCode: "AED",
        amountMinor: 200000,
        reductionDate: "2026-04-25",
        allocationType: "repayment",
        openLoanItems
      })
    ).toThrow("Insufficient loan item balance");
  });
});
```

- [ ] **Step 2: Run tests and verify the expected failure**

Run:

```bash
npm run test -- tests/domain/loanEffects.test.ts
```

Expected: FAIL because `src/domain/loanEffects.ts` does not exist.

- [ ] **Step 3: Add loan effect types and planner**

Create `src/domain/loanEffects.ts`:

```ts
export type LoanAllocationType = "repayment" | "writeoff" | "reversal";

export interface LoanOutLineInput {
  lineId: string;
  currencyCode: string;
  amountMinor: number;
  usdtCostMinor: number | null | undefined;
}

export interface LoanItemCreationEffect {
  clientLoanItemId: string;
  sourceDocumentId: string;
  sourceLineId: string;
  borrowerPersonId: string;
  currencyCode: string;
  originalAmountMinor: number;
  remainingAmountMinor: number;
  originalUsdtCostMinor: number;
  remainingUsdtCostMinor: number;
  loanDate: string;
}

export interface LoanItemUpdateEffect {
  loanItemId: string;
  amountDeltaMinor: number;
  usdtCostDeltaMinor: number;
  expectedRemainingAmountMinor: number;
  expectedRemainingUsdtCostMinor: number;
}

export interface LoanAllocationEffect {
  loanItemId: string;
  allocationType: LoanAllocationType;
  amountMinor: number;
  usdtCostMinor: number;
  allocationDate: string;
}

export interface LoanPostingEffects {
  loanItemCreations: LoanItemCreationEffect[];
  loanItemUpdates: LoanItemUpdateEffect[];
  loanAllocations: LoanAllocationEffect[];
}

export interface OpenLoanItem {
  id: string;
  sourceDocumentId: string;
  borrowerPersonId: string;
  currencyCode: string;
  remainingAmountMinor: number;
  remainingUsdtCostMinor: number;
  loanDate: string;
  createdAt: string;
}

export function emptyLoanPostingEffects(): LoanPostingEffects {
  return { loanItemCreations: [], loanItemUpdates: [], loanAllocations: [] };
}

export function planLoanOutEffects(input: {
  documentId: string;
  borrowerPersonId: string;
  loanDate: string;
  lines: LoanOutLineInput[];
}): LoanPostingEffects {
  const documentId = requireNonEmpty(input.documentId, "documentId");
  const borrowerPersonId = requireNonEmpty(input.borrowerPersonId, "borrowerPersonId");
  const loanDate = requireNonEmpty(input.loanDate, "loanDate");
  if (input.lines.length === 0) throw new Error("loan_out lines are required");

  return {
    loanItemCreations: input.lines.map((line, index) => {
      const sourceLineId = requireNonEmpty(line.lineId, "lineId");
      const currencyCode = requireNonEmpty(line.currencyCode, "line currencyCode");
      const amountMinor = requirePositiveSafeInteger(line.amountMinor, "line amountMinor");
      const usdtCostMinor = costForLoanOutLine(currencyCode, amountMinor, line.usdtCostMinor);

      return {
        clientLoanItemId: `${documentId}:loan:${index + 1}`,
        sourceDocumentId: documentId,
        sourceLineId,
        borrowerPersonId,
        currencyCode,
        originalAmountMinor: amountMinor,
        remainingAmountMinor: amountMinor,
        originalUsdtCostMinor: usdtCostMinor,
        remainingUsdtCostMinor: usdtCostMinor,
        loanDate
      };
    }),
    loanItemUpdates: [],
    loanAllocations: []
  };
}

export function planLoanReductionEffects(input: {
  documentId: string;
  borrowerPersonId: string;
  currencyCode: string;
  amountMinor: number;
  reductionDate: string;
  allocationType: Exclude<LoanAllocationType, "reversal">;
  openLoanItems: OpenLoanItem[];
  targetSourceDocumentId?: string | null;
}): LoanPostingEffects {
  requireNonEmpty(input.documentId, "documentId");
  const borrowerPersonId = requireNonEmpty(input.borrowerPersonId, "borrowerPersonId");
  const currencyCode = requireNonEmpty(input.currencyCode, "currencyCode");
  const reductionDate = requireNonEmpty(input.reductionDate, "reductionDate");
  const amountMinor = requirePositiveSafeInteger(input.amountMinor, "amountMinor");
  const allocationType = input.allocationType;
  if (allocationType !== "repayment" && allocationType !== "writeoff") {
    throw new Error("allocationType must be repayment or writeoff");
  }

  const targetSourceDocumentId = input.targetSourceDocumentId?.trim() || null;
  const orderedItems = input.openLoanItems
    .filter((item) => item.borrowerPersonId === borrowerPersonId)
    .filter((item) => item.currencyCode === currencyCode)
    .filter((item) => (targetSourceDocumentId ? item.sourceDocumentId === targetSourceDocumentId : true))
    .filter((item) => item.remainingAmountMinor > 0)
    .sort((a, b) => a.loanDate.localeCompare(b.loanDate) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));

  let remaining = amountMinor;
  const loanItemUpdates: LoanItemUpdateEffect[] = [];
  const loanAllocations: LoanAllocationEffect[] = [];

  for (const item of orderedItems) {
    validateOpenLoanItem(item);
    if (remaining === 0) break;

    const allocatedAmountMinor = Math.min(remaining, item.remainingAmountMinor);
    const allocatedUsdtCostMinor = proportionalCost(
      allocatedAmountMinor,
      item.remainingAmountMinor,
      item.remainingUsdtCostMinor
    );

    loanItemUpdates.push({
      loanItemId: item.id,
      amountDeltaMinor: -allocatedAmountMinor,
      usdtCostDeltaMinor: -allocatedUsdtCostMinor,
      expectedRemainingAmountMinor: item.remainingAmountMinor,
      expectedRemainingUsdtCostMinor: item.remainingUsdtCostMinor
    });
    loanAllocations.push({
      loanItemId: item.id,
      allocationType,
      amountMinor: allocatedAmountMinor,
      usdtCostMinor: allocatedUsdtCostMinor,
      allocationDate: reductionDate
    });

    remaining -= allocatedAmountMinor;
  }

  if (remaining > 0) throw new Error("Insufficient loan item balance");

  return { loanItemCreations: [], loanItemUpdates, loanAllocations };
}

export function totalLoanAllocationUsdtCost(effects: LoanPostingEffects): number {
  return effects.loanAllocations.reduce((sum, allocation) => sum + allocation.usdtCostMinor, 0);
}

function costForLoanOutLine(currencyCode: string, amountMinor: number, usdtCostMinor: number | null | undefined): number {
  if (currencyCode === "USDT" && usdtCostMinor == null) return amountMinor;
  if (usdtCostMinor == null) throw new Error("line usdtCostMinor is required for non-USDT loan_out");
  return requirePositiveSafeInteger(usdtCostMinor, "line usdtCostMinor");
}

function validateOpenLoanItem(item: OpenLoanItem) {
  requireNonEmpty(item.id, "loanItemId");
  requireNonEmpty(item.sourceDocumentId, "sourceDocumentId");
  requireNonEmpty(item.borrowerPersonId, "borrowerPersonId");
  requireNonEmpty(item.currencyCode, "currencyCode");
  requireNonEmpty(item.loanDate, "loanDate");
  requireNonEmpty(item.createdAt, "createdAt");
  requireNonNegativeSafeInteger(item.remainingAmountMinor, "remainingAmountMinor");
  requireNonNegativeSafeInteger(item.remainingUsdtCostMinor, "remainingUsdtCostMinor");
}

function proportionalCost(amountMinor: number, remainingAmountMinor: number, remainingUsdtCostMinor: number): number {
  if (amountMinor === remainingAmountMinor) return remainingUsdtCostMinor;
  return Math.round((amountMinor / remainingAmountMinor) * remainingUsdtCostMinor);
}

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} must be non-empty`);
  return trimmed;
}

function requirePositiveSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) throw new Error(`${label} must be a positive safe integer`);
  return value;
}

function requireNonNegativeSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} must be a non-negative safe integer`);
  return value;
}
```

- [ ] **Step 4: Run domain tests**

Run:

```bash
npm run test -- tests/domain/loanEffects.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

Run:

```bash
git add src/domain/loanEffects.ts tests/domain/loanEffects.test.ts
git commit -m "feat: plan loan item effects"
```

---

## Task 2: Add Loan Closure Schema And Repository Writes

**Files:**

- Create: `migrations/0005_loan_closure.sql`
- Modify: `src/repositories/documentRepository.ts`
- Modify: `tests/api/documentRepository.test.ts`

- [ ] **Step 1: Write repository tests first**

Add tests to `tests/api/documentRepository.test.ts` for these behaviors:

```ts
it("batches loan item creations during guarded approval", async () => {
  const db = mockDb();
  const repo = new DocumentRepository(db);

  await repo.approveWithPostings({
    documentId: "doc_loan",
    period: "2026-04",
    reviewer: "reviewer",
    accountEntries: [],
    loanEntries: [],
    loanItemCreations: [
      {
        clientLoanItemId: "doc_loan:loan:1",
        sourceDocumentId: "doc_loan",
        sourceLineId: "line_1",
        borrowerPersonId: "person_borrower",
        currencyCode: "AED",
        originalAmountMinor: 367000,
        remainingAmountMinor: 367000,
        originalUsdtCostMinor: 100000,
        remainingUsdtCostMinor: 100000,
        loanDate: "2026-04-25"
      }
    ],
    loanItemUpdates: [],
    loanAllocations: [],
    auditLogStatement: preparedStatement("INSERT INTO audit_logs VALUES (?)")
  });

  const sql = db.batchCalls[0][0].sql.replace(/\s+/g, " ").toLowerCase();
  expect(sql).toContain("insert into loan_items");
  expect(sql).toContain("where exists");
});

it("guards loan item updates by expected remaining balances", async () => {
  const db = mockDb();
  const repo = new DocumentRepository(db);

  await repo.approveWithPostings({
    documentId: "doc_repay",
    period: "2026-04",
    reviewer: "reviewer",
    accountEntries: [],
    loanEntries: [],
    loanItemCreations: [],
    loanItemUpdates: [
      {
        loanItemId: "loan_item_1",
        amountDeltaMinor: -10000,
        usdtCostDeltaMinor: -2700,
        expectedRemainingAmountMinor: 10000,
        expectedRemainingUsdtCostMinor: 2700
      }
    ],
    loanAllocations: [
      {
        loanItemId: "loan_item_1",
        allocationType: "repayment",
        amountMinor: 10000,
        usdtCostMinor: 2700,
        allocationDate: "2026-04-25"
      }
    ],
    auditLogStatement: preparedStatement("INSERT INTO audit_logs VALUES (?)")
  });

  const updateSql = db.batchCalls[0].map((statement) => statement.sql.toLowerCase()).find((sql) => sql.includes("update loan_items"));
  expect(updateSql).toContain("remaining_amount_minor = ?");
  expect(updateSql).toContain("remaining_usdt_cost_minor = ?");
});

it("lists open loan items by borrower and currency ordered for FIFO repayment", async () => {
  const db = mockDbWithRows([{ id: "loan_item_1" }]);
  const repo = new DocumentRepository(db);

  await repo.listOpenLoanItems({
    borrowerPersonId: "person_borrower",
    currencyCode: "AED",
    targetSourceDocumentId: null
  });

  const sql = db.prepareCalls[0].sql.replace(/\s+/g, " ").toLowerCase();
  expect(sql).toContain("from loan_items");
  expect(sql).toContain("borrower_person_id = ?");
  expect(sql).toContain("currency_code = ?");
  expect(sql).toContain("remaining_amount_minor > 0");
  expect(sql).toContain("order by loan_date, created_at, id");
});
```

Use the existing `mockDb` helper in `tests/api/documentRepository.test.ts`. Capture batch statements with `onBatch: (statements) => (batchCalls = statements)` and capture SQL text with `onSql: (value) => (sql = value)`.

- [ ] **Step 2: Run tests and verify the expected failure**

Run:

```bash
npm run test -- tests/api/documentRepository.test.ts
```

Expected: FAIL because the repository does not support loan item effects.

- [ ] **Step 3: Add migration**

Create `migrations/0005_loan_closure.sql`:

```sql
CREATE TABLE IF NOT EXISTS loan_items (
  id TEXT PRIMARY KEY,
  source_document_id TEXT NOT NULL,
  source_line_id TEXT NOT NULL,
  borrower_person_id TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  original_amount_minor INTEGER NOT NULL,
  remaining_amount_minor INTEGER NOT NULL,
  original_usdt_cost_minor INTEGER NOT NULL,
  remaining_usdt_cost_minor INTEGER NOT NULL,
  loan_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_document_id) REFERENCES documents(id),
  FOREIGN KEY (source_line_id) REFERENCES document_lines(id),
  FOREIGN KEY (borrower_person_id) REFERENCES people(id),
  FOREIGN KEY (currency_code) REFERENCES currencies(code)
);

CREATE TABLE IF NOT EXISTS loan_allocations (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  loan_item_id TEXT NOT NULL,
  allocation_type TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  usdt_cost_minor INTEGER NOT NULL,
  allocation_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id),
  FOREIGN KEY (loan_item_id) REFERENCES loan_items(id)
);

CREATE INDEX IF NOT EXISTS idx_loan_items_open_fifo
  ON loan_items(borrower_person_id, currency_code, status, loan_date, created_at, id);

CREATE INDEX IF NOT EXISTS idx_loan_items_source_document
  ON loan_items(source_document_id);

CREATE INDEX IF NOT EXISTS idx_loan_allocations_document
  ON loan_allocations(document_id);

CREATE INDEX IF NOT EXISTS idx_loan_allocations_item_created
  ON loan_allocations(loan_item_id, created_at, id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_one_approved_reversal_per_original
  ON documents(original_document_id)
  WHERE action_type = 'reversal' AND status = 'approved' AND original_document_id IS NOT NULL;
```

- [ ] **Step 4: Extend repository types**

In `src/repositories/documentRepository.ts`, import loan effect types:

```ts
import type {
  LoanAllocationEffect,
  LoanItemCreationEffect,
  LoanItemUpdateEffect
} from "../domain/loanEffects";
```

Extend `ApproveDocumentWithPostingsInput`:

```ts
  loanItemCreations?: LoanItemCreationEffect[];
  loanItemUpdates?: LoanItemUpdateEffect[];
  loanAllocations?: LoanAllocationEffect[];
```

Add row interfaces:

```ts
export interface OpenLoanItemRow {
  id: string;
  source_document_id: string;
  borrower_person_id: string;
  currency_code: string;
  remaining_amount_minor: number;
  remaining_usdt_cost_minor: number;
  loan_date: string;
  created_at: string;
}

export interface LoanAllocationRow {
  id: string;
  document_id: string;
  loan_item_id: string;
  allocation_type: string;
  amount_minor: number;
  usdt_cost_minor: number;
  allocation_date: string;
  created_at: string;
}
```

- [ ] **Step 5: Add repository read methods**

Add these methods to `DocumentRepository`:

```ts
listOpenLoanItems(input: {
  borrowerPersonId: string;
  currencyCode: string;
  targetSourceDocumentId?: string | null;
}): Promise<OpenLoanItemRow[]> {
  const targetSourceDocumentId = input.targetSourceDocumentId?.trim() || null;
  const sourceFilter = targetSourceDocumentId ? "AND source_document_id = ?" : "";
  const bindings = targetSourceDocumentId
    ? [input.borrowerPersonId, input.currencyCode, targetSourceDocumentId]
    : [input.borrowerPersonId, input.currencyCode];

  return all<OpenLoanItemRow>(
    this.db
      .prepare(`
        SELECT
          id, source_document_id, borrower_person_id, currency_code,
          remaining_amount_minor, remaining_usdt_cost_minor, loan_date, created_at
        FROM loan_items
        WHERE borrower_person_id = ?
          AND currency_code = ?
          AND status IN ('open', 'partial')
          AND remaining_amount_minor > 0
          ${sourceFilter}
        ORDER BY loan_date, created_at, id
      `)
      .bind(...bindings)
  );
}
```

- [ ] **Step 6: Add guarded write helpers**

Add private helpers in `DocumentRepository`:

```ts
private prepareConditionalLoanItemCreation(
  documentId: string,
  period: string,
  creation: LoanItemCreationEffect,
  loanItemId: string,
  reversalOriginalDocumentId: string | null = null
): D1PreparedStatement {
  return this.db
    .prepare(
      `INSERT INTO loan_items (
         id, source_document_id, source_line_id, borrower_person_id, currency_code,
         original_amount_minor, remaining_amount_minor, original_usdt_cost_minor,
         remaining_usdt_cost_minor, loan_date, status, created_at
       )
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE ${this.approvalGuardSql(reversalOriginalDocumentId)}`
    )
    .bind(
      loanItemId,
      creation.sourceDocumentId,
      creation.sourceLineId,
      creation.borrowerPersonId,
      creation.currencyCode,
      creation.originalAmountMinor,
      creation.remainingAmountMinor,
      creation.originalUsdtCostMinor,
      creation.remainingUsdtCostMinor,
      creation.loanDate,
      this.loanItemStatus(creation.remainingAmountMinor),
      nowIso(),
      ...this.approvalGuardBindings(documentId, period, reversalOriginalDocumentId)
    );
}

private prepareConditionalLoanItemUpdate(
  documentId: string,
  period: string,
  update: LoanItemUpdateEffect,
  reversalOriginalDocumentId: string | null = null
): D1PreparedStatement {
  return this.db
    .prepare(
      `UPDATE loan_items
       SET remaining_amount_minor = remaining_amount_minor + ?,
           remaining_usdt_cost_minor = remaining_usdt_cost_minor + ?,
           status = CASE WHEN remaining_amount_minor + ? = 0 THEN 'closed' ELSE 'open' END
       WHERE id = ?
         AND remaining_amount_minor = ?
         AND remaining_usdt_cost_minor = ?
         AND remaining_amount_minor + ? >= 0
         AND remaining_usdt_cost_minor + ? >= 0
         AND ${this.approvalGuardSql(reversalOriginalDocumentId)}`
    )
    .bind(
      update.amountDeltaMinor,
      update.usdtCostDeltaMinor,
      update.amountDeltaMinor,
      update.loanItemId,
      update.expectedRemainingAmountMinor,
      update.expectedRemainingUsdtCostMinor,
      update.amountDeltaMinor,
      update.usdtCostDeltaMinor,
      ...this.approvalGuardBindings(documentId, period, reversalOriginalDocumentId)
    );
}

private prepareConditionalLoanAllocation(
  documentId: string,
  period: string,
  allocation: LoanAllocationEffect,
  reversalOriginalDocumentId: string | null = null
): D1PreparedStatement {
  return this.db
    .prepare(
      `INSERT INTO loan_allocations (
         id, document_id, loan_item_id, allocation_type,
         amount_minor, usdt_cost_minor, allocation_date, created_at
       )
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
       WHERE ${this.approvalGuardSql(reversalOriginalDocumentId)}`
    )
    .bind(
      newId("loan_alloc"),
      documentId,
      allocation.loanItemId,
      allocation.allocationType,
      allocation.amountMinor,
      allocation.usdtCostMinor,
      allocation.allocationDate,
      nowIso(),
      ...this.approvalGuardBindings(documentId, period, reversalOriginalDocumentId)
    );
}

private loanItemStatus(remainingAmountMinor: number): "open" | "closed" {
  return remainingAmountMinor === 0 ? "closed" : "open";
}
```

- [ ] **Step 7: Wire loan effects into `approveWithPostings`**

Inside `approveWithPostings`, create ids for loan item creation effects:

```ts
const createdLoanItemIds = new Map<string, string>();
for (const loanItemCreation of input.loanItemCreations ?? []) {
  createdLoanItemIds.set(loanItemCreation.clientLoanItemId, newId("loan_item"));
}
```

Add statements after loan entries and before audit:

```ts
for (const loanItemCreation of input.loanItemCreations ?? []) {
  const loanItemId = createdLoanItemIds.get(loanItemCreation.clientLoanItemId);
  if (!loanItemId) throw new Error("Loan item creation id was not prepared");
  addStatement(
    this.prepareConditionalLoanItemCreation(input.documentId, input.period, loanItemCreation, loanItemId, reversalOriginalDocumentId),
    "write"
  );
}

for (const loanItemUpdate of input.loanItemUpdates ?? []) {
  addStatement(
    this.prepareConditionalLoanItemUpdate(input.documentId, input.period, loanItemUpdate, reversalOriginalDocumentId),
    "loan_item_update"
  );
}

for (const loanAllocation of input.loanAllocations ?? []) {
  addStatement(
    this.prepareConditionalLoanAllocation(input.documentId, input.period, loanAllocation, reversalOriginalDocumentId),
    "write"
  );
}
```

Extend `ApprovalStatementRole` with `"loan_item_update"` and check its `changes` count exactly like lot updates:

```ts
if (statementRoles[index] === "loan_item_update" && results[index]?.meta?.changes === 0) {
  throw new Error("Loan item balance changed before approval could be posted");
}
```

- [ ] **Step 8: Run repository tests**

Run:

```bash
npm run test -- tests/api/documentRepository.test.ts
```

Expected: PASS.

- [ ] **Step 9: Run local migration**

Run:

```bash
npm run db:migrate:local
```

Expected: migration `0005_loan_closure.sql` applies successfully.

- [ ] **Step 10: Commit**

Run:

```bash
git add migrations/0005_loan_closure.sql src/repositories/documentRepository.ts tests/api/documentRepository.test.ts
git commit -m "feat: persist loan closure effects"
```

---

## Task 3: Support Loan Writeoff And Loan Costs In Posting

**Files:**

- Modify: `src/domain/posting.ts`
- Modify: `src/domain/reversalPosting.ts`
- Modify: `tests/domain/posting.test.ts`
- Modify: `tests/domain/reversalPosting.test.ts`

- [ ] **Step 1: Add posting tests**

Add tests to `tests/domain/posting.test.ts`:

```ts
it("creates a loan-only entry for loan writeoff", () => {
  const entries = entriesForApprovedDocument({
    id: "doc_writeoff",
    documentType: "loan_writeoff",
    actionType: "normal",
    businessDate: "2026-04-25",
    borrowerPersonId: "person_1",
    lines: [{ accountId: "", currencyCode: "AED", amountMinor: 10000 }]
  });

  expect(entries.accountEntries).toEqual([]);
  expect(entries.loanEntries).toEqual([
    {
      borrowerPersonId: "person_1",
      currencyCode: "AED",
      amountMinor: -10000,
      usdtCostMinor: null,
      entryDate: "2026-04-25"
    }
  ]);
});

it("records USDT cost on loan out entries", () => {
  const entries = entriesForApprovedDocument({
    id: "doc_loan",
    documentType: "loan_out",
    actionType: "normal",
    businessDate: "2026-04-25",
    borrowerPersonId: "person_1",
    lines: [{ accountId: "acct_aed", currencyCode: "AED", amountMinor: 367000, usdtAmountMinor: 100000 }]
  });

  expect(entries.loanEntries).toEqual([
    {
      borrowerPersonId: "person_1",
      currencyCode: "AED",
      amountMinor: 367000,
      usdtCostMinor: 100000,
      entryDate: "2026-04-25"
    }
  ]);
});
```

Add a reversal posting test to `tests/domain/reversalPosting.test.ts`:

```ts
it("negates original loan entry amount and USDT cost", () => {
  expect(
    entriesForReversalDocument({
      reversalDate: "2026-04-26",
      originalAccountEntries: [],
      originalLoanEntries: [
        { borrowerPersonId: "person_1", currencyCode: "AED", amountMinor: 367000, usdtCostMinor: 100000 }
      ]
    })
  ).toEqual({
    accountEntries: [],
    loanEntries: [
      {
        borrowerPersonId: "person_1",
        currencyCode: "AED",
        amountMinor: -367000,
        usdtCostMinor: -100000,
        entryDate: "2026-04-26"
      }
    ]
  });
});
```

- [ ] **Step 2: Run tests and verify expected failures**

Run:

```bash
npm run test -- tests/domain/posting.test.ts tests/domain/reversalPosting.test.ts
```

Expected: FAIL because `loan_writeoff` is unsupported and `usdtCostMinor` is missing.

- [ ] **Step 3: Extend loan entry types**

In `src/domain/posting.ts`, update `PostingResult`:

```ts
loanEntries: Array<{
  borrowerPersonId: string;
  currencyCode: string;
  amountMinor: number;
  usdtCostMinor: number | null;
  entryDate: string;
}>;
```

Include `loan_writeoff` in supported document types and borrower validation:

```ts
document.documentType !== "loan_writeoff"
```

```ts
if (document.documentType === "loan_out" || document.documentType === "loan_repayment" || document.documentType === "loan_writeoff") {
  loanBorrowerPersonId = document.borrowerPersonId?.trim() ?? "";
  if (!loanBorrowerPersonId) throw new Error(`borrowerPersonId is required for ${document.documentType}`);
}
```

- [ ] **Step 4: Add `loan_writeoff` posting branch**

In the line loop, require `accountId` only for document types that move cash:

```ts
const accountId = document.documentType === "loan_writeoff" ? "" : line.accountId.trim();
if (document.documentType !== "loan_writeoff" && !accountId) {
  throw new Error("line accountId is required");
}
```

Add:

```ts
if (document.documentType === "loan_writeoff") {
  loanEntries.push({
    borrowerPersonId: loanBorrowerPersonId,
    currencyCode,
    amountMinor: -line.amountMinor,
    usdtCostMinor: null,
    entryDate: document.businessDate
  });
}
```

Update existing loan entry pushes:

```ts
loanEntries.push({
  borrowerPersonId: loanBorrowerPersonId,
  currencyCode,
  amountMinor: loanAmountMinor,
  usdtCostMinor: document.documentType === "loan_out" ? loanOutUsdtCost(currencyCode, line.amountMinor, line.usdtAmountMinor) : null,
  entryDate: document.businessDate
});
```

Add helper:

```ts
function loanOutUsdtCost(currencyCode: string, amountMinor: number, usdtAmountMinor: number | null | undefined): number {
  if (currencyCode === "USDT" && usdtAmountMinor == null) return amountMinor;
  return requirePositiveSafeInteger(usdtAmountMinor, "line usdtAmountMinor for non-USDT loan_out");
}
```

- [ ] **Step 5: Extend reversal posting**

In `src/domain/reversalPosting.ts`, add `usdtCostMinor: number | null` to loan entry interfaces and return:

```ts
usdtCostMinor: entry.usdtCostMinor == null ? null : -entry.usdtCostMinor
```

- [ ] **Step 6: Run domain tests**

Run:

```bash
npm run test -- tests/domain/posting.test.ts tests/domain/reversalPosting.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/domain/posting.ts src/domain/reversalPosting.ts tests/domain/posting.test.ts tests/domain/reversalPosting.test.ts
git commit -m "feat: post loan writeoffs"
```

---

## Task 4: Integrate Loan Effects In Approval Service

**Files:**

- Modify: `src/services/documentService.ts`
- Modify: `src/repositories/documentRepository.ts`
- Modify: `tests/api/documentService.test.ts`
- Modify: `tests/api/documentRepository.test.ts`

- [ ] **Step 1: Write service tests**

Add tests to `tests/api/documentService.test.ts`:

```ts
it("creates loan items when approving loan out", async () => {
  const documents = {
    getDocument: vi.fn(async () => documentRow({ status: "pending", document_type: "loan_out", business_date: "2026-04-25" })),
    isPeriodLocked: vi.fn(async () => null),
    getDocumentLines: vi.fn(async () => [
      lineRow({
        id: "line_1",
        account_id: "acct_aed",
        borrower_person_id: "person_borrower",
        currency_code: "AED",
        amount_minor: 367000,
        usdt_amount_minor: 100000
      })
    ]),
    approveWithPostings: vi.fn(async () => undefined),
    listOpenLoanItems: vi.fn()
  };
  const audit = mockAudit();
  const service = new DocumentService(documents as never, audit);

  await service.approve("doc_1", "reviewer");

  expect(documents.approveWithPostings).toHaveBeenCalledWith(
    expect.objectContaining({
      loanItemCreations: [
        expect.objectContaining({
          sourceLineId: "line_1",
          borrowerPersonId: "person_borrower",
          currencyCode: "AED",
          originalAmountMinor: 367000,
          originalUsdtCostMinor: 100000
        })
      ]
    })
  );
});

it("allocates loan repayment to open loan items", async () => {
  const documents = {
    getDocument: vi.fn(async () => documentRow({ status: "pending", document_type: "loan_repayment", business_date: "2026-04-25" })),
    isPeriodLocked: vi.fn(async () => null),
    getDocumentLines: vi.fn(async () => [
      lineRow({
        account_id: "acct_aed",
        borrower_person_id: "person_borrower",
        currency_code: "AED",
        amount_minor: 100000
      })
    ]),
    listOpenLoanItems: vi.fn(async () => [
      {
        id: "loan_item_1",
        source_document_id: "doc_loan",
        borrower_person_id: "person_borrower",
        currency_code: "AED",
        remaining_amount_minor: 100000,
        remaining_usdt_cost_minor: 27000,
        loan_date: "2026-04-01",
        created_at: "2026-04-01T10:00:00.000Z"
      }
    ]),
    approveWithPostings: vi.fn(async () => undefined)
  };
  const service = new DocumentService(documents as never, mockAudit());

  await service.approve("doc_repay", "reviewer");

  expect(documents.approveWithPostings).toHaveBeenCalledWith(
    expect.objectContaining({
      loanItemUpdates: [
        expect.objectContaining({
          loanItemId: "loan_item_1",
          amountDeltaMinor: -100000,
          usdtCostDeltaMinor: -27000
        })
      ],
      loanAllocations: [
        expect.objectContaining({
          loanItemId: "loan_item_1",
          allocationType: "repayment",
          amountMinor: 100000,
          usdtCostMinor: 27000
        })
      ],
      loanEntries: [
        expect.objectContaining({
          amountMinor: -100000,
          usdtCostMinor: -27000
        })
      ]
    })
  );
});

it("requires category for loan writeoff approval", async () => {
  const documents = {
    getDocument: vi.fn(async () => documentRow({ status: "pending", document_type: "loan_writeoff", category_id: null })),
    isPeriodLocked: vi.fn(async () => null),
    getDocumentLines: vi.fn(async () => [lineRow({ borrower_person_id: "person_borrower", currency_code: "AED", amount_minor: 10000 })])
  };
  const service = new DocumentService(documents as never, mockAudit());

  await expect(service.approve("doc_writeoff", "reviewer")).rejects.toThrow("categoryId is required for loan_writeoff");
});
```

- [ ] **Step 2: Run tests and verify expected failures**

Run:

```bash
npm run test -- tests/api/documentService.test.ts
```

Expected: FAIL because service approval does not plan loan item effects.

- [ ] **Step 3: Extend repository pick type**

In `src/services/documentService.ts`, add `"listOpenLoanItems"` to `DocumentWorkflowRepository`.

- [ ] **Step 4: Add helper functions**

Add helpers near existing service helpers:

```ts
function borrowerForLoanDocument(documentType: DocumentType, lines: DocumentLineRow[]) {
  if (documentType !== "loan_out" && documentType !== "loan_repayment" && documentType !== "loan_writeoff") return undefined;
  const borrowers = uniqueText(lines.map((line) => line.borrower_person_id ?? ""));
  if (borrowers.length === 0) throw new Error(`borrowerPersonId is required for ${documentType}`);
  if (borrowers.length > 1) throw new Error(`${documentType} requires one borrower`);
  return borrowers[0];
}

function assertSingleLineLoanReduction(documentType: DocumentType, lines: DocumentLineRow[]) {
  if (documentType !== "loan_repayment" && documentType !== "loan_writeoff") return;
  if (lines.length !== 1) throw new Error(`${documentType} requires exactly one line`);
}

function requireWriteoffCategory(document: DocumentDetailRow) {
  if (document.document_type === "loan_writeoff" && !document.category_id?.trim()) {
    throw new Error("categoryId is required for loan_writeoff");
  }
}
```

- [ ] **Step 5: Add loan planning method**

Import:

```ts
import {
  emptyLoanPostingEffects,
  planLoanOutEffects,
  planLoanReductionEffects,
  totalLoanAllocationUsdtCost
} from "../domain/loanEffects";
```

Add method in `DocumentService`:

```ts
private async planLoanPostingEffects(document: DocumentDetailRow, lines: DocumentLineRow[]) {
  const borrowerPersonId = borrowerForLoanDocument(document.document_type, lines);
  if (!borrowerPersonId) return emptyLoanPostingEffects();

  if (document.document_type === "loan_out") {
    return planLoanOutEffects({
      documentId: document.id,
      borrowerPersonId,
      loanDate: document.business_date,
      lines: lines.map((line) => ({
        lineId: line.id,
        currencyCode: line.currency_code,
        amountMinor: line.amount_minor,
        usdtCostMinor: line.usdt_amount_minor
      }))
    });
  }

  if (document.document_type === "loan_repayment" || document.document_type === "loan_writeoff") {
    assertSingleLineLoanReduction(document.document_type, lines);
    requireWriteoffCategory(document);
    const line = requireFirstLine(lines, document.document_type);
    const currencyCode = requireLineText(line.currency_code, "line currencyCode", document.document_type);
    const openLoanItems = await this.documents.listOpenLoanItems({
      borrowerPersonId,
      currencyCode,
      targetSourceDocumentId: document.original_document_id
    });

    return planLoanReductionEffects({
      documentId: document.id,
      borrowerPersonId,
      currencyCode,
      amountMinor: requirePositiveSafeInteger(line.amount_minor, "line amountMinor", document.document_type),
      reductionDate: document.business_date,
      allocationType: document.document_type === "loan_repayment" ? "repayment" : "writeoff",
      targetSourceDocumentId: document.original_document_id,
      openLoanItems: openLoanItems.map((item) => ({
        id: item.id,
        sourceDocumentId: item.source_document_id,
        borrowerPersonId: item.borrower_person_id,
        currencyCode: item.currency_code,
        remainingAmountMinor: item.remaining_amount_minor,
        remainingUsdtCostMinor: item.remaining_usdt_cost_minor,
        loanDate: item.loan_date,
        createdAt: item.created_at
      }))
    });
  }

  return emptyLoanPostingEffects();
}
```

- [ ] **Step 6: Attach allocated USDT cost to repayment/writeoff loan entries**

Add helper:

```ts
function attachLoanAllocationCost(
  documentType: DocumentType,
  loanEntries: Array<{ borrowerPersonId: string; currencyCode: string; amountMinor: number; usdtCostMinor: number | null; entryDate: string }>,
  allocatedUsdtCostMinor: number
) {
  if (documentType !== "loan_repayment" && documentType !== "loan_writeoff") return loanEntries;
  if (loanEntries.length !== 1) throw new Error(`${documentType} requires exactly one loan entry`);
  const sign = loanEntries[0].amountMinor < 0 ? -1 : 1;
  return [{ ...loanEntries[0], usdtCostMinor: sign * allocatedUsdtCostMinor }];
}
```

In `approve`, call loan planner after posting and before `approveWithPostings`:

```ts
const loanEffects = await this.planLoanPostingEffects(document, lines);
const loanEntries = attachLoanAllocationCost(
  document.document_type,
  posting.loanEntries,
  totalLoanAllocationUsdtCost(loanEffects)
);
```

Pass:

```ts
loanEntries,
loanItemCreations: loanEffects.loanItemCreations,
loanItemUpdates: loanEffects.loanItemUpdates,
loanAllocations: loanEffects.loanAllocations,
```

- [ ] **Step 7: Update repository loan entry insert for USDT cost**

Change loan entry insert SQL in `src/repositories/documentRepository.ts` to include `usdt_cost_minor`:

```ts
`INSERT INTO loan_entries (id, document_id, borrower_person_id, currency_code, amount_minor, usdt_cost_minor, entry_date, created_at)
 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
```

Bind `entry.usdtCostMinor ?? null`.

Make the same change in conditional loan entry writes.

- [ ] **Step 8: Run service and repository tests**

Run:

```bash
npm run test -- tests/api/documentService.test.ts tests/api/documentRepository.test.ts tests/domain/posting.test.ts
```

Expected: PASS.

- [ ] **Step 9: Commit**

Run:

```bash
git add src/services/documentService.ts src/repositories/documentRepository.ts tests/api/documentService.test.ts tests/api/documentRepository.test.ts
git commit -m "feat: approve loan closure documents"
```

---

## Task 5: Add Safe Loan Reversal Restoration

**Files:**

- Create: `src/domain/loanReversal.ts`
- Create: `tests/domain/loanReversal.test.ts`
- Modify: `src/repositories/documentRepository.ts`
- Modify: `src/services/documentService.ts`
- Modify: `tests/api/documentService.test.ts`

- [ ] **Step 1: Write loan reversal domain tests**

Create `tests/domain/loanReversal.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { planSafeLoanReversalEffects } from "../../src/domain/loanReversal";

describe("loanReversal", () => {
  it("closes loan items created by a reversed loan_out when they were not reduced", () => {
    expect(
      planSafeLoanReversalEffects({
        reversalDocumentId: "doc_reversal",
        originalDocumentId: "doc_loan",
        originalDocumentType: "loan_out",
        reversalDate: "2026-04-26",
        createdLoanItems: [
          {
            id: "loan_item_1",
            originalAmountMinor: 100000,
            remainingAmountMinor: 100000,
            originalUsdtCostMinor: 27000,
            remainingUsdtCostMinor: 27000
          }
        ],
        originalAllocations: [],
        laterAllocationLoanItemIds: []
      })
    ).toEqual({
      loanItemCreations: [],
      loanItemUpdates: [
        {
          loanItemId: "loan_item_1",
          amountDeltaMinor: -100000,
          usdtCostDeltaMinor: -27000,
          expectedRemainingAmountMinor: 100000,
          expectedRemainingUsdtCostMinor: 27000
        }
      ],
      loanAllocations: [
        {
          loanItemId: "loan_item_1",
          allocationType: "reversal",
          amountMinor: 100000,
          usdtCostMinor: 27000,
          allocationDate: "2026-04-26"
        }
      ]
    });
  });

  it("restores loan items allocated by a reversed repayment", () => {
    expect(
      planSafeLoanReversalEffects({
        reversalDocumentId: "doc_reversal",
        originalDocumentId: "doc_repay",
        originalDocumentType: "loan_repayment",
        reversalDate: "2026-04-26",
        createdLoanItems: [],
        originalAllocations: [
          {
            loanItemId: "loan_item_1",
            allocationType: "repayment",
            amountMinor: 40000,
            usdtCostMinor: 10800
          }
        ],
        affectedLoanItems: [
          {
            id: "loan_item_1",
            originalAmountMinor: 100000,
            remainingAmountMinor: 60000,
            originalUsdtCostMinor: 27000,
            remainingUsdtCostMinor: 16200
          }
        ],
        laterAllocationLoanItemIds: []
      })
    ).toEqual({
      loanItemCreations: [],
      loanItemUpdates: [
        {
          loanItemId: "loan_item_1",
          amountDeltaMinor: 40000,
          usdtCostDeltaMinor: 10800,
          expectedRemainingAmountMinor: 60000,
          expectedRemainingUsdtCostMinor: 16200
        }
      ],
      loanAllocations: [
        {
          loanItemId: "loan_item_1",
          allocationType: "reversal",
          amountMinor: -40000,
          usdtCostMinor: -10800,
          allocationDate: "2026-04-26"
        }
      ]
    });
  });

  it("rejects reversal when affected loan items have later allocations", () => {
    expect(() =>
      planSafeLoanReversalEffects({
        reversalDocumentId: "doc_reversal",
        originalDocumentId: "doc_repay",
        originalDocumentType: "loan_repayment",
        reversalDate: "2026-04-26",
        createdLoanItems: [],
        originalAllocations: [
          { loanItemId: "loan_item_1", allocationType: "repayment", amountMinor: 40000, usdtCostMinor: 10800 }
        ],
        affectedLoanItems: [
          {
            id: "loan_item_1",
            originalAmountMinor: 100000,
            remainingAmountMinor: 60000,
            originalUsdtCostMinor: 27000,
            remainingUsdtCostMinor: 16200
          }
        ],
        laterAllocationLoanItemIds: ["loan_item_1"]
      })
    ).toThrow("Complex loan reversal requires manual review: affected loan items have later allocations");
  });
});
```

- [ ] **Step 2: Run tests and verify expected failure**

Run:

```bash
npm run test -- tests/domain/loanReversal.test.ts
```

Expected: FAIL because `src/domain/loanReversal.ts` does not exist.

- [ ] **Step 3: Implement loan reversal planner**

Create `src/domain/loanReversal.ts`:

```ts
import { emptyLoanPostingEffects, type LoanPostingEffects } from "./loanEffects";
import type { DocumentType } from "./types";

interface LoanItemSnapshot {
  id: string;
  originalAmountMinor: number;
  remainingAmountMinor: number;
  originalUsdtCostMinor: number;
  remainingUsdtCostMinor: number;
}

interface LoanAllocationSnapshot {
  loanItemId: string;
  allocationType: string;
  amountMinor: number;
  usdtCostMinor: number;
}

export function planSafeLoanReversalEffects(input: {
  reversalDocumentId: string;
  originalDocumentId: string;
  originalDocumentType: DocumentType;
  reversalDate: string;
  createdLoanItems?: LoanItemSnapshot[];
  affectedLoanItems?: LoanItemSnapshot[];
  originalAllocations?: LoanAllocationSnapshot[];
  laterAllocationLoanItemIds: string[];
}): LoanPostingEffects {
  requireNonEmpty(input.reversalDocumentId, "reversalDocumentId");
  requireNonEmpty(input.originalDocumentId, "originalDocumentId");
  const reversalDate = requireNonEmpty(input.reversalDate, "reversalDate");
  const laterIds = new Set(input.laterAllocationLoanItemIds);
  if (laterIds.size > 0) {
    throw new Error("Complex loan reversal requires manual review: affected loan items have later allocations");
  }

  if (input.originalDocumentType === "loan_out") {
    return reverseLoanOut(input.createdLoanItems ?? [], reversalDate);
  }

  if (input.originalDocumentType === "loan_repayment" || input.originalDocumentType === "loan_writeoff") {
    return reverseLoanReduction(input.originalAllocations ?? [], input.affectedLoanItems ?? [], reversalDate);
  }

  return emptyLoanPostingEffects();
}

function reverseLoanOut(createdLoanItems: LoanItemSnapshot[], reversalDate: string): LoanPostingEffects {
  if (createdLoanItems.length === 0) return emptyLoanPostingEffects();

  return {
    loanItemCreations: [],
    loanItemUpdates: createdLoanItems.map((item) => {
      assertFullyRemaining(item);
      return {
        loanItemId: item.id,
        amountDeltaMinor: -item.remainingAmountMinor,
        usdtCostDeltaMinor: -item.remainingUsdtCostMinor,
        expectedRemainingAmountMinor: item.remainingAmountMinor,
        expectedRemainingUsdtCostMinor: item.remainingUsdtCostMinor
      };
    }),
    loanAllocations: createdLoanItems.map((item) => ({
      loanItemId: item.id,
      allocationType: "reversal",
      amountMinor: item.remainingAmountMinor,
      usdtCostMinor: item.remainingUsdtCostMinor,
      allocationDate: reversalDate
    }))
  };
}

function reverseLoanReduction(
  allocations: LoanAllocationSnapshot[],
  affectedLoanItems: LoanItemSnapshot[],
  reversalDate: string
): LoanPostingEffects {
  const itemsById = new Map(affectedLoanItems.map((item) => [item.id, item]));

  return {
    loanItemCreations: [],
    loanItemUpdates: allocations.map((allocation) => {
      const item = itemsById.get(allocation.loanItemId);
      if (!item) throw new Error("Affected loan item snapshot is required for loan reversal");
      return {
        loanItemId: allocation.loanItemId,
        amountDeltaMinor: allocation.amountMinor,
        usdtCostDeltaMinor: allocation.usdtCostMinor,
        expectedRemainingAmountMinor: item.remainingAmountMinor,
        expectedRemainingUsdtCostMinor: item.remainingUsdtCostMinor
      };
    }),
    loanAllocations: allocations.map((allocation) => ({
      loanItemId: allocation.loanItemId,
      allocationType: "reversal",
      amountMinor: -allocation.amountMinor,
      usdtCostMinor: -allocation.usdtCostMinor,
      allocationDate: reversalDate
    }))
  };
}

function assertFullyRemaining(item: LoanItemSnapshot) {
  if (item.remainingAmountMinor !== item.originalAmountMinor || item.remainingUsdtCostMinor !== item.originalUsdtCostMinor) {
    throw new Error("Complex loan reversal requires manual review: loan item has been reduced");
  }
}

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} must be non-empty`);
  return trimmed;
}
```

- [ ] **Step 4: Add repository read methods for reversal**

In `DocumentRepository`, add methods:

```ts
listLoanItemsCreatedByDocument(documentId: string): Promise<LoanItemReversalRow[]> {
  return all<LoanItemReversalRow>(
    this.db
      .prepare(`
        SELECT
          id, original_amount_minor, remaining_amount_minor,
          original_usdt_cost_minor, remaining_usdt_cost_minor
        FROM loan_items
        WHERE source_document_id = ?
        ORDER BY created_at, id
      `)
      .bind(documentId)
  );
}

listLoanAllocationsForDocument(documentId: string): Promise<LoanAllocationReversalRow[]> {
  return all<LoanAllocationReversalRow>(
    this.db
      .prepare(`
        SELECT loan_item_id, allocation_type, amount_minor, usdt_cost_minor, created_at
        FROM loan_allocations
        WHERE document_id = ?
        ORDER BY created_at, id
      `)
      .bind(documentId)
  );
}

listLoanItemsByIds(ids: string[]): Promise<LoanItemReversalRow[]> {
  if (ids.length === 0) return Promise.resolve([]);
  const placeholders = ids.map(() => "?").join(", ");
  return all<LoanItemReversalRow>(
    this.db
      .prepare(`
        SELECT
          id, original_amount_minor, remaining_amount_minor,
          original_usdt_cost_minor, remaining_usdt_cost_minor
        FROM loan_items
        WHERE id IN (${placeholders})
        ORDER BY created_at, id
      `)
      .bind(...ids)
  );
}

listLaterLoanAllocationItemIds(input: {
  loanItemIds: string[];
  originalDocumentId: string;
}): Promise<Array<{ loan_item_id: string }>> {
  if (input.loanItemIds.length === 0) return Promise.resolve([]);
  const placeholders = input.loanItemIds.map(() => "?").join(", ");
  return all<{ loan_item_id: string }>(
    this.db
      .prepare(`
        SELECT DISTINCT loan_item_id
        FROM loan_allocations
        WHERE loan_item_id IN (${placeholders})
          AND document_id <> ?
          AND created_at >= (
            SELECT COALESCE(MAX(created_at), '')
            FROM loan_allocations
            WHERE document_id = ?
          )
        ORDER BY loan_item_id
      `)
      .bind(...input.loanItemIds, input.originalDocumentId, input.originalDocumentId)
  );
}
```

Add row interfaces with the selected columns.

- [ ] **Step 5: Wire safe loan reversal into service**

Import:

```ts
import { planSafeLoanReversalEffects } from "../domain/loanReversal";
```

Add required repository methods to `DocumentWorkflowRepository`.

Add private method:

```ts
private async planLoanReversalEffects(reversalDocumentId: string, original: DocumentDetailRow, reversalDate: string) {
  if (original.document_type !== "loan_out" && original.document_type !== "loan_repayment" && original.document_type !== "loan_writeoff") {
    return emptyLoanPostingEffects();
  }

  const [createdLoanItems, originalAllocations] = await Promise.all([
    this.documents.listLoanItemsCreatedByDocument(original.id),
    this.documents.listLoanAllocationsForDocument(original.id)
  ]);

  const allocationLoanItemIds = originalAllocations.map((allocation) => allocation.loan_item_id);
  const createdLoanItemIds = createdLoanItems.map((item) => item.id);
  const loanItemIds = uniqueText([...allocationLoanItemIds, ...createdLoanItemIds]);
  const [affectedLoanItems, laterAllocationLoanItemIds] = await Promise.all([
    this.documents.listLoanItemsByIds(loanItemIds),
    this.documents.listLaterLoanAllocationItemIds({ loanItemIds, originalDocumentId: original.id })
  ]);

  return planSafeLoanReversalEffects({
    reversalDocumentId,
    originalDocumentId: original.id,
    originalDocumentType: original.document_type,
    reversalDate,
    createdLoanItems: createdLoanItems.map(mapLoanItemReversalRow),
    affectedLoanItems: affectedLoanItems.map(mapLoanItemReversalRow),
    originalAllocations: originalAllocations.map((allocation) => ({
      loanItemId: allocation.loan_item_id,
      allocationType: allocation.allocation_type,
      amountMinor: allocation.amount_minor,
      usdtCostMinor: allocation.usdt_cost_minor
    })),
    laterAllocationLoanItemIds: laterAllocationLoanItemIds.map((row) => row.loan_item_id)
  });
}
```

In `approveReversal`, combine FIFO and loan reversal effects:

```ts
const fifoEffects = await this.planFifoReversalEffects(document.id, original, document.business_date);
const loanEffects = await this.planLoanReversalEffects(document.id, original, document.business_date);
```

Pass loan effects to `approveWithPostings`.

- [ ] **Step 6: Run tests**

Run:

```bash
npm run test -- tests/domain/loanReversal.test.ts tests/api/documentService.test.ts tests/api/documentRepository.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/domain/loanReversal.ts tests/domain/loanReversal.test.ts src/repositories/documentRepository.ts src/services/documentService.ts tests/api/documentService.test.ts tests/api/documentRepository.test.ts
git commit -m "feat: restore loan items on safe reversal"
```

---

## Task 6: Add Loan Closure Reports And UI

**Files:**

- Modify: `src/repositories/reportRepository.ts`
- Modify: `src/api/reports.ts`
- Modify: `src/worker/router.ts`
- Modify: `src/app/pages/ReportsPage.tsx`
- Modify: `tests/api/reportRepository.test.ts`
- Modify: `tests/api/reports.test.ts`

- [ ] **Step 1: Add report repository tests**

Add tests to `tests/api/reportRepository.test.ts`:

```ts
it("returns open loan items for aging ordered by oldest loan date", async () => {
  const rows = [
    {
      loan_item_id: "loan_item_1",
      source_document_id: "doc_loan",
      borrower_person_id: "person_1",
      currency_code: "AED",
      remaining_amount_minor: 100000,
      remaining_usdt_cost_minor: 27000,
      loan_date: "2026-04-01",
      age_days: 24
    }
  ];
  let sql = "";
  const repo = new ReportRepository(mockDb(rows, (value) => (sql = value)));

  await expect(repo.loanAging()).resolves.toEqual(rows);

  const normalized = normalizeSql(sql);
  expect(normalized).toContain("from loan_items li");
  expect(normalized).toContain("li.remaining_amount_minor > 0");
  expect(normalized).toContain("order by li.loan_date, li.created_at, li.id");
});

it("returns loan allocation detail", async () => {
  const rows = [{ allocation_id: "loan_alloc_1", document_id: "doc_repay", loan_item_id: "loan_item_1" }];
  let sql = "";
  const repo = new ReportRepository(mockDb(rows, (value) => (sql = value)));

  await expect(repo.loanAllocations()).resolves.toEqual(rows);

  const normalized = normalizeSql(sql);
  expect(normalized).toContain("from loan_allocations la");
  expect(normalized).toContain("join loan_items li on li.id = la.loan_item_id");
  expect(normalized).toContain("join documents d on d.id = la.document_id");
  expect(normalized).toContain("where d.status = 'approved'");
});

it("returns loan writeoff report rows", async () => {
  const rows = [{ document_id: "doc_writeoff", borrower_person_id: "person_1", usdt_cost_minor: 27000 }];
  let sql = "";
  const repo = new ReportRepository(mockDb(rows, (value) => (sql = value)));

  await expect(repo.loanWriteoffs()).resolves.toEqual(rows);

  const normalized = normalizeSql(sql);
  expect(normalized).toContain("la.allocation_type = 'writeoff'");
  expect(normalized).toContain("d.document_type = 'loan_writeoff'");
});
```

- [ ] **Step 2: Run tests and verify expected failures**

Run:

```bash
npm run test -- tests/api/reportRepository.test.ts tests/api/reports.test.ts
```

Expected: FAIL because report methods and routes are missing.

- [ ] **Step 3: Add report methods**

In `src/repositories/reportRepository.ts`, add interfaces and methods:

```ts
export interface LoanAgingRow {
  loan_item_id: string;
  source_document_id: string;
  borrower_person_id: string;
  currency_code: string;
  remaining_amount_minor: number;
  remaining_usdt_cost_minor: number;
  loan_date: string;
  age_days: number;
}

export interface LoanAllocationDetailRow {
  allocation_id: string;
  document_id: string;
  loan_item_id: string;
  allocation_type: string;
  borrower_person_id: string;
  currency_code: string;
  amount_minor: number;
  usdt_cost_minor: number;
  allocation_date: string;
}

export interface LoanWriteoffRow {
  document_id: string;
  borrower_person_id: string;
  project_id: string | null;
  category_id: string | null;
  currency_code: string;
  amount_minor: number;
  usdt_cost_minor: number;
  allocation_date: string;
}
```

Add methods:

```ts
loanAging(): Promise<LoanAgingRow[]> {
  return all<LoanAgingRow>(
    this.db.prepare(`
      SELECT
        li.id AS loan_item_id,
        li.source_document_id AS source_document_id,
        li.borrower_person_id AS borrower_person_id,
        li.currency_code AS currency_code,
        li.remaining_amount_minor AS remaining_amount_minor,
        li.remaining_usdt_cost_minor AS remaining_usdt_cost_minor,
        li.loan_date AS loan_date,
        CAST(julianday('now') - julianday(li.loan_date) AS INTEGER) AS age_days
      FROM loan_items li
      JOIN documents d ON d.id = li.source_document_id
      WHERE d.status = 'approved'
        AND li.remaining_amount_minor > 0
      ORDER BY li.loan_date, li.created_at, li.id
    `)
  );
}

loanAllocations(): Promise<LoanAllocationDetailRow[]> {
  return all<LoanAllocationDetailRow>(
    this.db.prepare(`
      SELECT
        la.id AS allocation_id,
        la.document_id AS document_id,
        la.loan_item_id AS loan_item_id,
        la.allocation_type AS allocation_type,
        li.borrower_person_id AS borrower_person_id,
        li.currency_code AS currency_code,
        la.amount_minor AS amount_minor,
        la.usdt_cost_minor AS usdt_cost_minor,
        la.allocation_date AS allocation_date
      FROM loan_allocations la
      JOIN loan_items li ON li.id = la.loan_item_id
      JOIN documents d ON d.id = la.document_id
      WHERE d.status = 'approved'
      ORDER BY la.allocation_date DESC, la.created_at DESC
    `)
  );
}

loanWriteoffs(): Promise<LoanWriteoffRow[]> {
  return all<LoanWriteoffRow>(
    this.db.prepare(`
      SELECT
        d.id AS document_id,
        li.borrower_person_id AS borrower_person_id,
        d.project_id AS project_id,
        d.category_id AS category_id,
        li.currency_code AS currency_code,
        SUM(la.amount_minor) AS amount_minor,
        SUM(la.usdt_cost_minor) AS usdt_cost_minor,
        la.allocation_date AS allocation_date
      FROM loan_allocations la
      JOIN loan_items li ON li.id = la.loan_item_id
      JOIN documents d ON d.id = la.document_id
      WHERE d.status = 'approved'
        AND d.document_type = 'loan_writeoff'
        AND la.allocation_type = 'writeoff'
      GROUP BY d.id, li.borrower_person_id, d.project_id, d.category_id, li.currency_code, la.allocation_date
      ORDER BY la.allocation_date DESC, d.id
    `)
  );
}
```

- [ ] **Step 4: Add API handlers and routes**

In `src/api/reports.ts`:

```ts
export const loanAging: Handler = async ({ env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.loanAging() });
};

export const loanAllocations: Handler = async ({ env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.loanAllocations() });
};

export const loanWriteoffs: Handler = async ({ env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.loanWriteoffs() });
};
```

In `src/worker/router.ts`, add:

```ts
defineRoute("GET", "/api/reports/loan-aging", loanAging),
defineRoute("GET", "/api/reports/loan-allocations", loanAllocations),
defineRoute("GET", "/api/reports/loan-writeoffs", loanWriteoffs),
```

- [ ] **Step 5: Update report page**

In `src/app/pages/ReportsPage.tsx`, add state arrays for `loanAging`, `loanAllocations`, and `loanWriteoffs`, fetch the three endpoints, then add three compact tables:

```tsx
<section className="panel">
  <div className="panel-header">
    <h2>借款账龄</h2>
    <div className="status-slot">{reports.loanAging.length} 条</div>
  </div>
  <div className="table-wrap">
    <table>
      <thead>
        <tr>
          <th>借款项ID</th>
          <th>借款人ID</th>
          <th>币种</th>
          <th>借款日期</th>
          <th className="number-cell">剩余金额</th>
          <th className="number-cell">剩余USDT成本</th>
          <th className="number-cell">账龄天数</th>
        </tr>
      </thead>
      <tbody>
        {reports.loanAging.length > 0 ? reports.loanAging.map((row) => (
          <tr key={row.loan_item_id}>
            <td className="mono">{row.loan_item_id}</td>
            <td className="mono">{row.borrower_person_id}</td>
            <td className="mono">{row.currency_code}</td>
            <td className="mono">{row.loan_date}</td>
            <td className="number-cell">{formatMinor(row.remaining_amount_minor)}</td>
            <td className="number-cell">{formatMinor(row.remaining_usdt_cost_minor)}</td>
            <td className="number-cell">{formatMinor(row.age_days)}</td>
          </tr>
        )) : <DataStateRow colSpan={7} label={rowLabel} />}
      </tbody>
    </table>
  </div>
</section>
```

Use the same table pattern for allocation detail and writeoff rows. Keep labels short so the existing layout remains usable.

- [ ] **Step 6: Run API and UI tests**

Run:

```bash
npm run test -- tests/api/reportRepository.test.ts tests/api/reports.test.ts src/app/pages/DocumentsPage.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

Run:

```bash
git add src/repositories/reportRepository.ts src/api/reports.ts src/worker/router.ts src/app/pages/ReportsPage.tsx tests/api/reportRepository.test.ts tests/api/reports.test.ts
git commit -m "feat: report loan closure details"
```

---

## Task 7: Add API Coverage And Local Smoke Data

**Files:**

- Modify: `tests/api/documents.test.ts`
- Optionally create: `scripts/smoke-loan-closure.mjs`

- [ ] **Step 1: Add API approval tests**

Add route-level tests to `tests/api/documents.test.ts`:

```ts
it("approves loan writeoff through the API", async () => {
  const env = mockEnv({
    firstResultsQueue: [
      documentRow({ id: "doc_writeoff", status: "pending", document_type: "loan_writeoff", category_id: "cat_loss" }),
      null
    ],
    allResultsQueue: [
      [lineRow({ borrower_person_id: "person_borrower", currency_code: "AED", amount_minor: 10000 })],
      [
        {
          id: "loan_item_1",
          source_document_id: "doc_loan",
          borrower_person_id: "person_borrower",
          currency_code: "AED",
          remaining_amount_minor: 10000,
          remaining_usdt_cost_minor: 2700,
          loan_date: "2026-04-01",
          created_at: "2026-04-01T10:00:00.000Z"
        }
      ]
    ]
  });

  const response = await routeRequest("/api/documents/doc_writeoff/approve", {
    method: "POST",
    body: JSON.stringify({ reviewer: "reviewer" })
  }, env);

  expect(response.status).toBe(200);
  expect(env.DB.batch).toHaveBeenCalled();
  const allSql = env.DB.batch.mock.calls[0][0].map((statement) => statement.sql.toLowerCase()).join("\n");
  expect(allSql).toContain("insert into loan_allocations");
  expect(allSql).toContain("update loan_items");
});
```

Use the existing `mockEnv`, `documentRow`, and `lineRow` helpers in `tests/api/documents.test.ts`. Capture batch statements with `onBatch: (statements) => (batchCalls = statements)`.

- [ ] **Step 2: Run focused API tests**

Run:

```bash
npm run test -- tests/api/documents.test.ts
```

Expected: PASS.

- [ ] **Step 3: Run full verification**

Run:

```bash
npm run test
npm run build
npx tsc --noEmit
npm run db:migrate:local
git diff --check
```

Expected:

- all tests pass.
- build succeeds.
- typecheck succeeds.
- D1 local migrations apply or report no migrations to apply.
- no whitespace errors.

- [ ] **Step 4: Optional local API smoke**

If a dev server is running at `http://127.0.0.1:8787`, create a loan-out, repayment, writeoff, and reversal flow through API calls:

```bash
node scripts/smoke-loan-closure.mjs
```

Expected smoke result:

- loan-out approval creates one `loan_items` row.
- repayment approval creates one positive `account_entries` row, one negative `loan_entries` row, one `loan_allocations` repayment row, and decreases `loan_items.remaining_amount_minor`.
- writeoff approval creates no `account_entries` row, one negative `loan_entries` row, one `loan_allocations` writeoff row, and decreases `loan_items.remaining_amount_minor`.
- reversal of a repayment restores the loan item when no later allocation exists.
- reversal is rejected when a later allocation exists.

- [ ] **Step 5: Commit**

Run:

```bash
git add tests/api/documents.test.ts scripts/smoke-loan-closure.mjs
git commit -m "test: cover loan closure api"
```

If no smoke script is committed, use:

```bash
git add tests/api/documents.test.ts
git commit -m "test: cover loan closure api"
```

---

## Final Verification

Run:

```bash
npm run test
npm run build
npx tsc --noEmit
npm run db:migrate:local
git diff --check
git status --short
```

Expected:

- Vitest reports all test files passing.
- Vite build exits with code 0.
- TypeScript exits with code 0.
- Wrangler D1 local migrations apply cleanly or report no migrations to apply.
- `git diff --check` exits with code 0.
- `git status --short` is empty after the final commit.

## Self-Review Checklist

- Spec coverage: covers loan out, repayment, writeoff, loan aging, allocation detail, writeoff report, and safe loan reversal.
- Data consistency: `loan_entries` aggregate balance and `loan_items` remaining balance are updated in the same guarded approval batch.
- Reversal consistency: source-derived reversal entries remain intact and loan item effects are restored only when safe.
- Report boundary: reports read approved source results only and do not store editable report rows.
- Known remaining work: role enforcement, attachments, export, and manual override for unsafe loan reversal belong to later formal-system phases.
