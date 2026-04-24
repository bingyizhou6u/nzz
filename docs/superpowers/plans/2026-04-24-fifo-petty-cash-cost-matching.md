# FIFO And Petty Cash Cost Matching Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the second formal-system increment: exchange lots, FIFO lot movement, petty-cash reimbursement cost matching, and pending-cost matching for negative petty-cash balances.

**Architecture:** Keep the existing Cloudflare Worker + D1 + React architecture. Reuse approved documents as the only source of truth, and extend the approval posting path so account entries, lot writes, pending-cost writes, approval status, and audit logs remain guarded in the same D1 batch. Keep all reporting read-only.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, Cloudflare Workers, Cloudflare D1, Wrangler.

---

## Scope Check

This plan implements the formal-system phase described in the spec as:

```text
换汇批次、FIFO、备用金负数和待匹配成本
```

Included in this phase:

1. `exchange` approval:
   - Decrease the USDT source account.
   - Increase the received-currency reserve account.
   - Create one non-USDT lot with USDT cost.
2. `petty_cash_issue` approval:
   - Decrease company reserve account.
   - Increase staff petty-cash account.
   - Move lots from company account to staff account by FIFO.
   - If the staff has open pending costs, match the newly issued lot cost to the oldest pending costs first.
3. `petty_cash_reimbursement` approval:
   - Decrease staff petty-cash account by actual expense date.
   - Consume staff lots by FIFO.
   - Allow unmatched amount and create `pending_cost_matches`.
4. Reports:
   - Lot balances.
   - FIFO movements.
   - Pending cost matches.
5. UI:
   - Add the extra line fields needed to create exchange and petty-cash documents from the current document page.
   - Add read-only report tables for lots and FIFO movements.

Excluded from this phase:

1. `petty_cash_return`.
2. `account_transfer`.
3. FIFO reversal/restoration for reversal documents.
4. Complex reversal where a consumed lot has later downstream consumption.
5. Expense detail tables and project net-income cost completeness.
6. Role permissions, Cloudflare Access mapping, attachments, export, and backups.

These exclusions are deliberate because they need separate reviewable plans.

## Line Semantics For This Phase

The existing document line shape is reused. Each supported document uses one main line:

| Document type | `accountId` | `counterpartyAccountId` | `personId` | `currencyCode` | `amountMinor` | `usdtAmountMinor` |
| --- | --- | --- | --- | --- | --- | --- |
| `exchange` | received account | USDT source account | null | received currency | received amount | USDT source amount / lot cost |
| `petty_cash_issue` | company reserve account | staff petty-cash account | staff person | issue currency | issued amount | null |
| `petty_cash_reimbursement` | staff petty-cash account | null | staff person | expense currency | reimbursed amount | null |

The existing `project_income`, `loan_out`, and `loan_repayment` semantics must keep working.

## File Structure

Create or modify these files:

- Create: `src/domain/fifoEffects.ts`
  - Build pure FIFO write effects for lot creation, lot movement, pending-cost creation, and pending-cost matching.
- Modify: `src/domain/fifo.ts`
  - Keep allocation behavior stable and add tests for proportional cost rounding across partial consumption.
- Modify: `src/domain/posting.ts`
  - Add account-entry posting rules for `exchange`, `petty_cash_issue`, and `petty_cash_reimbursement`.
- Modify: `src/repositories/documentRepository.ts`
  - Add lot reads, pending-cost reads, and atomic approval writes for lot updates, lot inserts, lot movements, and pending-cost writes.
- Modify: `src/repositories/reportRepository.ts`
  - Add read-only lot balance and FIFO movement reports.
- Modify: `src/api/reports.ts`
  - Add report handlers for lots and movements.
- Modify: `src/worker/router.ts`
  - Add routes for the new reports.
- Modify: `src/services/documentService.ts`
  - Orchestrate exchange/petty-cash approval effects before the atomic approval batch.
- Modify: `src/app/pages/DocumentsPage.tsx`
  - Add line fields for counterparty account, person, and USDT cost.
- Modify: `src/app/pages/DocumentsPage.test.ts`
  - Cover the new UI payload helper behavior.
- Modify: `src/app/pages/ReportsPage.tsx`
  - Add lot balance, FIFO movement, and pending-cost tables.
- Modify: `src/app/styles.css`
  - Reuse existing table styles; add only compact styles needed for new report sections.
- Create: `migrations/0003_fifo_petty_cash_indexes.sql`
  - Add indexes for lot lookup, movement lookup, and pending-cost matching.
- Test: `tests/domain/fifoEffects.test.ts`
- Test: `tests/domain/posting.test.ts`
- Test: `tests/api/documentRepository.test.ts`
- Test: `tests/api/documentService.test.ts`
- Test: `tests/api/reports.test.ts`
- Test: `src/app/pages/DocumentsPage.test.ts`

## Task 1: Domain Posting Rules For Exchange And Petty Cash

**Files:**
- Modify: `src/domain/posting.ts`
- Test: `tests/domain/posting.test.ts`

- [ ] **Step 1: Add failing posting tests**

Append these tests to `tests/domain/posting.test.ts`:

```ts
it("posts exchange as USDT out and received currency in", () => {
  expect(
    entriesForApprovedDocument({
      id: "doc_fx",
      documentType: "exchange",
      actionType: "normal",
      businessDate: "2026-04-24",
      lines: [
        {
          accountId: "acct_aed_reserve",
          counterpartyAccountId: "acct_usdt_main",
          currencyCode: "AED",
          amountMinor: 367000,
          usdtAmountMinor: 100000
        }
      ]
    })
  ).toEqual({
    accountEntries: [
      { accountId: "acct_usdt_main", currencyCode: "USDT", amountMinor: -100000, entryDate: "2026-04-24" },
      { accountId: "acct_aed_reserve", currencyCode: "AED", amountMinor: 367000, entryDate: "2026-04-24" }
    ],
    loanEntries: []
  });
});

it("posts petty cash issue as reserve out and staff petty cash in", () => {
  expect(
    entriesForApprovedDocument({
      id: "doc_issue",
      documentType: "petty_cash_issue",
      actionType: "normal",
      businessDate: "2026-04-24",
      lines: [
        {
          accountId: "acct_aed_reserve",
          counterpartyAccountId: "acct_petty_bob",
          personId: "person_bob",
          currencyCode: "AED",
          amountMinor: 200000
        }
      ]
    })
  ).toEqual({
    accountEntries: [
      { accountId: "acct_aed_reserve", currencyCode: "AED", amountMinor: -200000, entryDate: "2026-04-24" },
      { accountId: "acct_petty_bob", currencyCode: "AED", amountMinor: 200000, entryDate: "2026-04-24" }
    ],
    loanEntries: []
  });
});

it("posts petty cash reimbursement as staff petty cash out", () => {
  expect(
    entriesForApprovedDocument({
      id: "doc_reim",
      documentType: "petty_cash_reimbursement",
      actionType: "normal",
      businessDate: "2026-04-24",
      lines: [
        {
          accountId: "acct_petty_bob",
          personId: "person_bob",
          currencyCode: "AED",
          amountMinor: 215000
        }
      ]
    })
  ).toEqual({
    accountEntries: [
      { accountId: "acct_petty_bob", currencyCode: "AED", amountMinor: -215000, entryDate: "2026-04-24" }
    ],
    loanEntries: []
  });
});

it("requires exchange source account and USDT cost", () => {
  expect(() =>
    entriesForApprovedDocument({
      id: "doc_fx",
      documentType: "exchange",
      actionType: "normal",
      businessDate: "2026-04-24",
      lines: [{ accountId: "acct_aed", currencyCode: "AED", amountMinor: 1000 }]
    })
  ).toThrow("line counterpartyAccountId is required for exchange");

  expect(() =>
    entriesForApprovedDocument({
      id: "doc_fx",
      documentType: "exchange",
      actionType: "normal",
      businessDate: "2026-04-24",
      lines: [{ accountId: "acct_aed", counterpartyAccountId: "acct_usdt", currencyCode: "AED", amountMinor: 1000 }]
    })
  ).toThrow("line usdtAmountMinor is required for exchange");
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- tests/domain/posting.test.ts
```

Expected: FAIL because `PostingLine` does not yet support `counterpartyAccountId`, `personId`, or `usdtAmountMinor`, and the new document types are unsupported.

- [ ] **Step 3: Extend posting line and rules**

Modify `src/domain/posting.ts` so `PostingLine` includes optional fields:

```ts
interface PostingLine {
  accountId: string;
  counterpartyAccountId?: string | null;
  personId?: string | null;
  currencyCode: string;
  amountMinor: number;
  usdtAmountMinor?: number | null;
}
```

Allow `exchange`, `petty_cash_issue`, and `petty_cash_reimbursement` in the supported-document guard.

Add helper functions in the same file:

```ts
function requireOptionalText(value: string | null | undefined, label: string) {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) throw new Error(`${label} is required`);
  return trimmed;
}

function requirePositiveSafeInteger(value: number | null | undefined, label: string) {
  if (!Number.isSafeInteger(value) || (value ?? 0) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value as number;
}
```

Add branches inside the existing per-line loop:

```ts
if (document.documentType === "exchange") {
  const sourceAccountId = requireOptionalText(line.counterpartyAccountId, "line counterpartyAccountId for exchange");
  const usdtAmountMinor = requirePositiveSafeInteger(line.usdtAmountMinor, "line usdtAmountMinor for exchange");
  accountEntries.push({ accountId: sourceAccountId, currencyCode: "USDT", amountMinor: -usdtAmountMinor, entryDate: document.businessDate });
  accountEntries.push({ accountId, currencyCode, amountMinor: line.amountMinor, entryDate: document.businessDate });
}

if (document.documentType === "petty_cash_issue") {
  const pettyCashAccountId = requireOptionalText(line.counterpartyAccountId, "line counterpartyAccountId for petty_cash_issue");
  requireOptionalText(line.personId, "line personId for petty_cash_issue");
  accountEntries.push({ accountId, currencyCode, amountMinor: -line.amountMinor, entryDate: document.businessDate });
  accountEntries.push({ accountId: pettyCashAccountId, currencyCode, amountMinor: line.amountMinor, entryDate: document.businessDate });
}

if (document.documentType === "petty_cash_reimbursement") {
  requireOptionalText(line.personId, "line personId for petty_cash_reimbursement");
  accountEntries.push({ accountId, currencyCode, amountMinor: -line.amountMinor, entryDate: document.businessDate });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npm run test -- tests/domain/posting.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/posting.ts tests/domain/posting.test.ts
git commit -m "feat: post exchange and petty cash documents"
```

## Task 2: FIFO Effect Planning Domain

**Files:**
- Create: `src/domain/fifoEffects.ts`
- Test: `tests/domain/fifoEffects.test.ts`

- [ ] **Step 1: Write failing FIFO effect tests**

Create `tests/domain/fifoEffects.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  planExchangeLotCreation,
  planPettyCashIssueEffects,
  planPettyCashReimbursementEffects
} from "../../src/domain/fifoEffects";
import type { Lot } from "../../src/domain/types";

const reserveLots: Lot[] = [
  { id: "lot_a", currencyCode: "AED", remainingAmountMinor: 150000, remainingUsdtCostMinor: 41000, lotDate: "2026-04-20" },
  { id: "lot_b", currencyCode: "AED", remainingAmountMinor: 100000, remainingUsdtCostMinor: 27300, lotDate: "2026-04-21" }
];

describe("fifoEffects", () => {
  it("plans exchange lot creation from received amount and USDT cost", () => {
    expect(
      planExchangeLotCreation({
        documentId: "doc_fx",
        accountId: "acct_aed_reserve",
        currencyCode: "AED",
        amountMinor: 367000,
        usdtCostMinor: 100000,
        lotDate: "2026-04-24"
      })
    ).toEqual({
      lotCreations: [
        {
          currencyCode: "AED",
          originalAmountMinor: 367000,
          remainingAmountMinor: 367000,
          originalUsdtCostMinor: 100000,
          remainingUsdtCostMinor: 100000,
          sourceDocumentId: "doc_fx",
          currentAccountId: "acct_aed_reserve",
          currentPersonId: null,
          lotDate: "2026-04-24"
        }
      ],
      lotUpdates: [],
      lotMovements: [],
      pendingCostCreations: [],
      pendingCostUpdates: []
    });
  });

  it("plans petty cash issue by moving reserve lots to staff lots", () => {
    const result = planPettyCashIssueEffects({
      documentId: "doc_issue",
      fromAccountId: "acct_aed_reserve",
      toAccountId: "acct_petty_bob",
      personId: "person_bob",
      currencyCode: "AED",
      amountMinor: 200000,
      businessDate: "2026-04-24",
      sourceLots: reserveLots,
      openPendingMatches: []
    });

    expect(result.lotUpdates).toEqual([
      { lotId: "lot_a", amountDeltaMinor: -150000, usdtCostDeltaMinor: -41000 },
      { lotId: "lot_b", amountDeltaMinor: -50000, usdtCostDeltaMinor: -13650 }
    ]);
    expect(result.lotCreations).toEqual([
      {
        currencyCode: "AED",
        originalAmountMinor: 150000,
        remainingAmountMinor: 150000,
        originalUsdtCostMinor: 41000,
        remainingUsdtCostMinor: 41000,
        sourceDocumentId: "doc_issue",
        currentAccountId: "acct_petty_bob",
        currentPersonId: "person_bob",
        lotDate: "2026-04-24"
      },
      {
        currencyCode: "AED",
        originalAmountMinor: 50000,
        remainingAmountMinor: 50000,
        originalUsdtCostMinor: 13650,
        remainingUsdtCostMinor: 13650,
        sourceDocumentId: "doc_issue",
        currentAccountId: "acct_petty_bob",
        currentPersonId: "person_bob",
        lotDate: "2026-04-24"
      }
    ]);
    expect(result.pendingCostUpdates).toEqual([]);
  });

  it("matches newly issued petty cash against oldest pending costs first", () => {
    const result = planPettyCashIssueEffects({
      documentId: "doc_issue",
      fromAccountId: "acct_aed_reserve",
      toAccountId: "acct_petty_bob",
      personId: "person_bob",
      currencyCode: "AED",
      amountMinor: 200000,
      businessDate: "2026-04-24",
      sourceLots: reserveLots,
      openPendingMatches: [
        { id: "pending_old", remainingAmountMinor: 120000, expenseDate: "2026-04-22", createdAt: "2026-04-22T10:00:00.000Z" },
        { id: "pending_new", remainingAmountMinor: 100000, expenseDate: "2026-04-23", createdAt: "2026-04-23T10:00:00.000Z" }
      ]
    });

    expect(result.pendingCostUpdates).toEqual([
      { pendingCostMatchId: "pending_old", amountDeltaMinor: -120000 },
      { pendingCostMatchId: "pending_new", amountDeltaMinor: -80000 }
    ]);
    expect(result.lotCreations.map((lot) => lot.remainingAmountMinor)).toEqual([0, 0]);
    expect(result.lotCreations.map((lot) => lot.remainingUsdtCostMinor)).toEqual([0, 0]);
  });

  it("plans petty cash reimbursement with FIFO consumption and pending cost for unmatched amount", () => {
    const result = planPettyCashReimbursementEffects({
      documentId: "doc_reim",
      accountId: "acct_petty_bob",
      personId: "person_bob",
      currencyCode: "AED",
      amountMinor: 300000,
      expenseDate: "2026-04-24",
      sourceLots: reserveLots
    });

    expect(result.lotUpdates).toEqual([
      { lotId: "lot_a", amountDeltaMinor: -150000, usdtCostDeltaMinor: -41000 },
      { lotId: "lot_b", amountDeltaMinor: -100000, usdtCostDeltaMinor: -27300 }
    ]);
    expect(result.pendingCostCreations).toEqual([
      {
        documentId: "doc_reim",
        personId: "person_bob",
        accountId: "acct_petty_bob",
        currencyCode: "AED",
        amountMinor: 50000,
        remainingAmountMinor: 50000,
        expenseDate: "2026-04-24"
      }
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- tests/domain/fifoEffects.test.ts
```

Expected: FAIL because `src/domain/fifoEffects.ts` does not exist.

- [ ] **Step 3: Add FIFO effect types and planners**

Create `src/domain/fifoEffects.ts` with these exported interfaces and functions:

```ts
import { allocateFifo } from "./fifo";
import type { Lot } from "./types";

export interface LotCreationEffect {
  currencyCode: string;
  originalAmountMinor: number;
  remainingAmountMinor: number;
  originalUsdtCostMinor: number;
  remainingUsdtCostMinor: number;
  sourceDocumentId: string;
  currentAccountId: string;
  currentPersonId: string | null;
  lotDate: string;
}

export interface LotUpdateEffect {
  lotId: string;
  amountDeltaMinor: number;
  usdtCostDeltaMinor: number;
}

export interface LotMovementEffect {
  lotId: string;
  movementType: string;
  fromAccountId: string | null;
  toAccountId: string | null;
  fromPersonId: string | null;
  toPersonId: string | null;
  amountMinor: number;
  usdtCostMinor: number;
  movementDate: string;
}

export interface PendingCostCreationEffect {
  documentId: string;
  personId: string;
  accountId: string;
  currencyCode: string;
  amountMinor: number;
  remainingAmountMinor: number;
  expenseDate: string;
}

export interface PendingCostUpdateEffect {
  pendingCostMatchId: string;
  amountDeltaMinor: number;
}

export interface OpenPendingCostMatch {
  id: string;
  remainingAmountMinor: number;
  expenseDate: string;
  createdAt: string;
}

export interface FifoPostingEffects {
  lotCreations: LotCreationEffect[];
  lotUpdates: LotUpdateEffect[];
  lotMovements: LotMovementEffect[];
  pendingCostCreations: PendingCostCreationEffect[];
  pendingCostUpdates: PendingCostUpdateEffect[];
}
```

Implement the planners so they:

1. Sort pending matches by `expenseDate`, then `createdAt`, then `id`.
2. Use `allocateFifo(..., { allowUnmatched: true })` for petty-cash reimbursement.
3. Use `allocateFifo(...)` without `allowUnmatched` for petty-cash issue.
4. Create lot movement effects with movement types:
   - `exchange_in`
   - `petty_cash_issue`
   - `petty_cash_reimbursement`
   - `pending_cost_match`
5. Reduce newly issued staff lots before they become available when pending costs exist.

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npm run test -- tests/domain/fifoEffects.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/fifoEffects.ts tests/domain/fifoEffects.test.ts
git commit -m "feat: plan fifo posting effects"
```

## Task 3: Repository Support For Lots And Pending Costs

**Files:**
- Modify: `src/repositories/documentRepository.ts`
- Test: `tests/api/documentRepository.test.ts`

- [ ] **Step 1: Add failing repository tests**

Append tests to `tests/api/documentRepository.test.ts` that assert:

1. `listOpenLotsForAccount` selects open lots by account, person, currency, and orders by `lot_date, id`.
2. `listOpenPendingCostMatches` selects open pending matches by account, person, currency, and orders by `expense_date, created_at, id`.
3. `approveWithPostings` adds conditional statements for:
   - lot creation
   - lot update with non-negative remaining amount/cost guard
   - lot movement insert
   - pending cost creation
   - pending cost update with status recalculation

Use this test shape for the batch assertion:

```ts
it("approves with lot and pending cost writes in the guarded batch", async () => {
  const batchCalls: CapturedStatement[][] = [];
  const repo = new DocumentRepository(mockDb({ onBatch: (statements) => batchCalls.push(statements) }));

  await repo.approveWithPostings({
    documentId: "doc_1",
    period: "2026-04",
    reviewer: "reviewer_1",
    reviewedAt: "2026-04-24T11:00:00.000Z",
    accountEntries: [],
    loanEntries: [],
    lotCreations: [
      {
        currencyCode: "AED",
        originalAmountMinor: 1000,
        remainingAmountMinor: 1000,
        originalUsdtCostMinor: 272,
        remainingUsdtCostMinor: 272,
        sourceDocumentId: "doc_1",
        currentAccountId: "acct_aed",
        currentPersonId: null,
        lotDate: "2026-04-24"
      }
    ],
    lotUpdates: [{ lotId: "lot_1", amountDeltaMinor: -1000, usdtCostDeltaMinor: -272 }],
    lotMovements: [
      {
        lotId: "lot_1",
        movementType: "petty_cash_reimbursement",
        fromAccountId: "acct_petty",
        toAccountId: null,
        fromPersonId: "person_1",
        toPersonId: null,
        amountMinor: 1000,
        usdtCostMinor: 272,
        movementDate: "2026-04-24"
      }
    ],
    pendingCostCreations: [
      {
        documentId: "doc_1",
        personId: "person_1",
        accountId: "acct_petty",
        currencyCode: "AED",
        amountMinor: 500,
        remainingAmountMinor: 500,
        expenseDate: "2026-04-24"
      }
    ],
    pendingCostUpdates: [{ pendingCostMatchId: "pending_1", amountDeltaMinor: -500 }],
    auditLogStatement: {} as D1PreparedStatement
  });

  const normalizedSql = batchCalls[0].map((statement) => statement.sql.replace(/\s+/g, " ").toLowerCase()).join("\\n");
  expect(normalizedSql).toContain("insert into lots");
  expect(normalizedSql).toContain("update lots");
  expect(normalizedSql).toContain("insert into lot_movements");
  expect(normalizedSql).toContain("insert into pending_cost_matches");
  expect(normalizedSql).toContain("update pending_cost_matches");
  expect(normalizedSql).toContain("not exists (select 1 from period_locks where period = ?)");
});
```

- [ ] **Step 2: Run repository tests to verify failure**

Run:

```bash
npm run test -- tests/api/documentRepository.test.ts
```

Expected: FAIL because the repository methods and input fields do not exist.

- [ ] **Step 3: Extend repository input types**

In `src/repositories/documentRepository.ts`, import the effect types:

```ts
import type {
  LotCreationEffect,
  LotMovementEffect,
  LotUpdateEffect,
  OpenPendingCostMatch,
  PendingCostCreationEffect,
  PendingCostUpdateEffect
} from "../domain/fifoEffects";
```

Add to `ApproveDocumentWithPostingsInput`:

```ts
  lotCreations?: LotCreationEffect[];
  lotUpdates?: LotUpdateEffect[];
  lotMovements?: LotMovementEffect[];
  pendingCostCreations?: PendingCostCreationEffect[];
  pendingCostUpdates?: PendingCostUpdateEffect[];
```

Add row interfaces:

```ts
export interface LotRow {
  id: string;
  currency_code: string;
  remaining_amount_minor: number;
  remaining_usdt_cost_minor: number;
  lot_date: string;
}

export interface PendingCostMatchRow {
  id: string;
  remaining_amount_minor: number;
  expense_date: string;
  created_at: string;
}
```

- [ ] **Step 4: Add read methods**

Add these methods to `DocumentRepository`:

```ts
listOpenLotsForAccount(input: {
  accountId: string;
  personId?: string | null;
  currencyCode: string;
}): Promise<LotRow[]> {
  return all<LotRow>(
    this.db
      .prepare(`
        SELECT id, currency_code, remaining_amount_minor, remaining_usdt_cost_minor, lot_date
        FROM lots
        WHERE current_account_id = ?
          AND currency_code = ?
          AND status = 'open'
          AND remaining_amount_minor > 0
          AND ((? IS NULL AND current_person_id IS NULL) OR current_person_id = ?)
        ORDER BY lot_date, id
      `)
      .bind(input.accountId, input.currencyCode, input.personId ?? null, input.personId ?? null)
  );
}

listOpenPendingCostMatches(input: {
  accountId: string;
  personId: string;
  currencyCode: string;
}): Promise<PendingCostMatchRow[]> {
  return all<PendingCostMatchRow>(
    this.db
      .prepare(`
        SELECT id, remaining_amount_minor, expense_date, created_at
        FROM pending_cost_matches
        WHERE account_id = ?
          AND person_id = ?
          AND currency_code = ?
          AND status IN ('open', 'partial')
          AND remaining_amount_minor > 0
        ORDER BY expense_date, created_at, id
      `)
      .bind(input.accountId, input.personId, input.currencyCode)
  );
}
```

- [ ] **Step 5: Add guarded write statement builders**

Add private builders:

```ts
private approvalGuardSql() {
  return `EXISTS (
    SELECT 1 FROM documents
    WHERE id = ?
      AND status = 'pending'
      AND NOT EXISTS (SELECT 1 FROM period_locks WHERE period = ?)
  )`;
}
```

Use this condition in account-entry, loan-entry, lot, movement, pending-cost, audit, and final update writes.

Add builders that bind `documentId` and `period` as the last condition bindings for every conditional write.

- [ ] **Step 6: Verify lot update conflicts are detected**

After `this.db.batch`, inspect results for all lot update statements and the final approval update:

```ts
if (lotUpdateResult?.meta?.changes === 0) {
  throw new Error("Lot balance changed before approval could be posted");
}

if (approvalResult?.meta?.changes === 0) {
  throw new Error("Document is not pending or period is locked");
}
```

The exact implementation can track statement roles in a parallel array:

```ts
const statementRoles: Array<"write" | "lot_update" | "approval"> = [];
const statements: D1PreparedStatement[] = [];
```

- [ ] **Step 7: Run repository tests**

Run:

```bash
npm run test -- tests/api/documentRepository.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/repositories/documentRepository.ts tests/api/documentRepository.test.ts
git commit -m "feat: persist fifo posting effects"
```

## Task 4: Approval Service FIFO Orchestration

**Files:**
- Modify: `src/services/documentService.ts`
- Test: `tests/api/documentService.test.ts`

- [ ] **Step 1: Add failing service tests**

Append tests to `tests/api/documentService.test.ts`:

```ts
it("approves exchange documents with lot creation effects", async () => {
  const { repo, service } = createMocks({
    getDocument: vi.fn(async () => documentRow({ status: "pending", document_type: "exchange" })),
    getDocumentLines: vi.fn(async () => [
      lineRow({
        account_id: "acct_aed_reserve",
        counterparty_account_id: "acct_usdt_main",
        currency_code: "AED",
        amount_minor: 367000,
        usdt_amount_minor: 100000
      })
    ])
  });

  await service.approve("doc_1", "reviewer_1");

  expect(repo.approveWithPostings).toHaveBeenCalledWith(
    expect.objectContaining({
      lotCreations: [
        expect.objectContaining({
          currencyCode: "AED",
          originalAmountMinor: 367000,
          remainingAmountMinor: 367000,
          originalUsdtCostMinor: 100000,
          remainingUsdtCostMinor: 100000,
          currentAccountId: "acct_aed_reserve",
          currentPersonId: null,
          lotDate: "2026-04-24"
        })
      ]
    })
  );
});

it("approves petty cash reimbursement with FIFO consumption and pending costs", async () => {
  const { repo, service } = createMocks({
    getDocument: vi.fn(async () => documentRow({ status: "pending", document_type: "petty_cash_reimbursement" })),
    getDocumentLines: vi.fn(async () => [
      lineRow({
        account_id: "acct_petty_bob",
        person_id: "person_bob",
        currency_code: "AED",
        amount_minor: 300000
      })
    ]),
    listOpenLotsForAccount: vi.fn(async () => [
      { id: "lot_1", currency_code: "AED", remaining_amount_minor: 100000, remaining_usdt_cost_minor: 27200, lot_date: "2026-04-20" }
    ])
  });

  await service.approve("doc_1", "reviewer_1");

  expect(repo.listOpenLotsForAccount).toHaveBeenCalledWith({
    accountId: "acct_petty_bob",
    personId: "person_bob",
    currencyCode: "AED"
  });
  expect(repo.approveWithPostings).toHaveBeenCalledWith(
    expect.objectContaining({
      pendingCostCreations: [
        {
          documentId: "doc_1",
          personId: "person_bob",
          accountId: "acct_petty_bob",
          currencyCode: "AED",
          amountMinor: 200000,
          remainingAmountMinor: 200000,
          expenseDate: "2026-04-24"
        }
      ]
    })
  );
});
```

- [ ] **Step 2: Run service tests to verify failure**

Run:

```bash
npm run test -- tests/api/documentService.test.ts
```

Expected: FAIL because the service does not yet read lots or generate FIFO effects.

- [ ] **Step 3: Extend service repository type**

Add `listOpenLotsForAccount` and `listOpenPendingCostMatches` to `DocumentWorkflowRepository`.

Map repository rows to domain lots:

```ts
function toDomainLots(rows: Array<{ id: string; currency_code: string; remaining_amount_minor: number; remaining_usdt_cost_minor: number; lot_date: string }>) {
  return rows.map((row) => ({
    id: row.id,
    currencyCode: row.currency_code,
    remainingAmountMinor: row.remaining_amount_minor,
    remainingUsdtCostMinor: row.remaining_usdt_cost_minor,
    lotDate: row.lot_date
  }));
}
```

- [ ] **Step 4: Build FIFO effects before approval batch**

In `approve`, after computing `posting`, build `fifoEffects`:

```ts
const fifoEffects = await this.effectsForApprovedDocument(document, lines);
```

Add a private method:

```ts
private async effectsForApprovedDocument(document: DocumentDetailRow, lines: DocumentLineRow[]) {
  const empty = emptyFifoPostingEffects();
  const firstLine = lines[0];

  if (document.document_type === "exchange") {
    return planExchangeLotCreation({
      documentId: document.id,
      accountId: requireLineText(firstLine.account_id, "line accountId"),
      currencyCode: firstLine.currency_code,
      amountMinor: firstLine.amount_minor,
      usdtCostMinor: requireLineNumber(firstLine.usdt_amount_minor, "line usdtAmountMinor"),
      lotDate: document.business_date
    });
  }

  if (document.document_type === "petty_cash_issue") {
    const personId = requireLineText(firstLine.person_id, "line personId");
    const currencyCode = firstLine.currency_code;
    const sourceLots = await this.documents.listOpenLotsForAccount({
      accountId: requireLineText(firstLine.account_id, "line accountId"),
      personId: null,
      currencyCode
    });
    const openPendingMatches = await this.documents.listOpenPendingCostMatches({
      accountId: requireLineText(firstLine.counterparty_account_id, "line counterpartyAccountId"),
      personId,
      currencyCode
    });
    return planPettyCashIssueEffects({
      documentId: document.id,
      fromAccountId: requireLineText(firstLine.account_id, "line accountId"),
      toAccountId: requireLineText(firstLine.counterparty_account_id, "line counterpartyAccountId"),
      personId,
      currencyCode,
      amountMinor: firstLine.amount_minor,
      businessDate: document.business_date,
      sourceLots: toDomainLots(sourceLots),
      openPendingMatches: openPendingMatches.map((row) => ({
        id: row.id,
        remainingAmountMinor: row.remaining_amount_minor,
        expenseDate: row.expense_date,
        createdAt: row.created_at
      }))
    });
  }

  if (document.document_type === "petty_cash_reimbursement") {
    const personId = requireLineText(firstLine.person_id, "line personId");
    const sourceLots = await this.documents.listOpenLotsForAccount({
      accountId: requireLineText(firstLine.account_id, "line accountId"),
      personId,
      currencyCode: firstLine.currency_code
    });
    return planPettyCashReimbursementEffects({
      documentId: document.id,
      accountId: requireLineText(firstLine.account_id, "line accountId"),
      personId,
      currencyCode: firstLine.currency_code,
      amountMinor: firstLine.amount_minor,
      expenseDate: document.business_date,
      sourceLots: toDomainLots(sourceLots)
    });
  }

  return empty;
}
```

- [ ] **Step 5: Pass FIFO effects into `approveWithPostings`**

Spread the effect arrays into the approval input:

```ts
await this.documents.approveWithPostings({
  documentId: id,
  period: approvalPeriod,
  reviewer,
  accountEntries: posting.accountEntries,
  loanEntries: posting.loanEntries,
  lotCreations: fifoEffects.lotCreations,
  lotUpdates: fifoEffects.lotUpdates,
  lotMovements: fifoEffects.lotMovements,
  pendingCostCreations: fifoEffects.pendingCostCreations,
  pendingCostUpdates: fifoEffects.pendingCostUpdates,
  auditLogStatement
});
```

- [ ] **Step 6: Run service tests**

Run:

```bash
npm run test -- tests/api/documentService.test.ts tests/domain/fifoEffects.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/services/documentService.ts tests/api/documentService.test.ts
git commit -m "feat: orchestrate fifo approval effects"
```

## Task 5: FIFO Report APIs

**Files:**
- Modify: `src/repositories/reportRepository.ts`
- Modify: `src/api/reports.ts`
- Modify: `src/worker/router.ts`
- Test: `tests/api/reports.test.ts`
- Test: `tests/api/reportRepository.test.ts`

- [ ] **Step 1: Add failing report repository tests**

Add tests for:

```ts
repo.lotBalances()
repo.lotMovements()
repo.pendingCostMatches()
```

The SQL must:

1. Read `lots` where `remaining_amount_minor > 0`.
2. Order lots by `current_account_id, currency_code, lot_date, id`.
3. Read `lot_movements` ordered by `movement_date DESC, created_at DESC`.
4. Read `pending_cost_matches` where `remaining_amount_minor > 0`, ordered by `expense_date, created_at`.

- [ ] **Step 2: Add failing API route tests**

In `tests/api/reports.test.ts`, assert these endpoints:

```ts
GET /api/reports/lots
GET /api/reports/lot-movements
GET /api/reports/pending-costs
```

Each should return `{ data: [...] }`.

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
npm run test -- tests/api/reportRepository.test.ts tests/api/reports.test.ts
```

Expected: FAIL because the report methods and routes do not exist.

- [ ] **Step 4: Implement repository methods**

Add interfaces and methods to `src/repositories/reportRepository.ts`:

```ts
export interface LotBalanceRow {
  id: string;
  currency_code: string;
  remaining_amount_minor: number;
  remaining_usdt_cost_minor: number;
  source_document_id: string;
  current_account_id: string;
  current_person_id: string | null;
  lot_date: string;
  status: string;
}

export interface LotMovementRow {
  id: string;
  lot_id: string;
  document_id: string;
  movement_type: string;
  from_account_id: string | null;
  to_account_id: string | null;
  from_person_id: string | null;
  to_person_id: string | null;
  amount_minor: number;
  usdt_cost_minor: number;
  movement_date: string;
  created_at: string;
}

export interface PendingCostRow {
  id: string;
  document_id: string;
  person_id: string;
  account_id: string;
  currency_code: string;
  amount_minor: number;
  remaining_amount_minor: number;
  expense_date: string;
  status: string;
  created_at: string;
}
```

Add methods:

```ts
lotBalances(): Promise<LotBalanceRow[]> { ... }
lotMovements(): Promise<LotMovementRow[]> { ... }
pendingCostMatches(): Promise<PendingCostRow[]> { ... }
```

- [ ] **Step 5: Implement API handlers and routes**

In `src/api/reports.ts`, export:

```ts
export const lotBalances: Handler = async ({ env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.lotBalances() });
};

export const lotMovements: Handler = async ({ env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.lotMovements() });
};

export const pendingCostMatches: Handler = async ({ env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.pendingCostMatches() });
};
```

In `src/worker/router.ts`, add:

```ts
{ method: "GET", pattern: /^\/api\/reports\/lots$/, handler: reports.lotBalances },
{ method: "GET", pattern: /^\/api\/reports\/lot-movements$/, handler: reports.lotMovements },
{ method: "GET", pattern: /^\/api\/reports\/pending-costs$/, handler: reports.pendingCostMatches },
```

- [ ] **Step 6: Run report tests**

Run:

```bash
npm run test -- tests/api/reportRepository.test.ts tests/api/reports.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/repositories/reportRepository.ts src/api/reports.ts src/worker/router.ts tests/api/reportRepository.test.ts tests/api/reports.test.ts
git commit -m "feat: expose fifo reports"
```

## Task 6: Document UI Line Fields For FIFO Documents

**Files:**
- Modify: `src/app/pages/DocumentsPage.tsx`
- Modify: `src/app/pages/DocumentsPage.test.ts`

- [ ] **Step 1: Add failing UI helper tests**

Append to `src/app/pages/DocumentsPage.test.ts`:

```ts
it("builds an exchange payload with source account and USDT cost", () => {
  expect(
    buildDocumentPayload({
      documentType: "exchange",
      actionType: "normal",
      businessDate: "2026-04-24",
      period: "2026-04",
      originalDocumentId: "",
      summary: "FX",
      createdBy: "user_1",
      operatorPersonId: "",
      projectId: "",
      merchantId: "",
      categoryId: "cat_exchange",
      accountId: "acct_aed_reserve",
      counterpartyAccountId: "acct_usdt_main",
      personId: "",
      currencyCode: "AED",
      amountMajor: "3670.00",
      usdtAmountMajor: "1000.00",
      borrowerPersonId: ""
    })
  ).toEqual({
    documentType: "exchange",
    actionType: "normal",
    businessDate: "2026-04-24",
    period: "2026-04",
    summary: "FX",
    createdBy: "user_1",
    categoryId: "cat_exchange",
    lines: [
      {
        lineType: "main",
        accountId: "acct_aed_reserve",
        counterpartyAccountId: "acct_usdt_main",
        currencyCode: "AED",
        amountMinor: 367000,
        usdtAmountMinor: 100000
      }
    ]
  });
});

it("builds a petty cash payload with staff person", () => {
  expect(
    buildDocumentPayload({
      documentType: "petty_cash_reimbursement",
      actionType: "normal",
      businessDate: "2026-04-24",
      period: "2026-04",
      originalDocumentId: "",
      summary: "Expense",
      createdBy: "user_1",
      operatorPersonId: "",
      projectId: "proj_1",
      merchantId: "",
      categoryId: "cat_expense",
      accountId: "acct_petty_bob",
      counterpartyAccountId: "",
      personId: "person_bob",
      currencyCode: "AED",
      amountMajor: "2150",
      usdtAmountMajor: "",
      borrowerPersonId: ""
    })
  ).toEqual({
    documentType: "petty_cash_reimbursement",
    actionType: "normal",
    businessDate: "2026-04-24",
    period: "2026-04",
    summary: "Expense",
    createdBy: "user_1",
    projectId: "proj_1",
    categoryId: "cat_expense",
    lines: [
      {
        lineType: "main",
        accountId: "acct_petty_bob",
        personId: "person_bob",
        currencyCode: "AED",
        amountMinor: 215000
      }
    ]
  });
});
```

- [ ] **Step 2: Run UI tests to verify failure**

Run:

```bash
npm run test -- src/app/pages/DocumentsPage.test.ts
```

Expected: FAIL because `DocumentForm` and `buildDocumentPayload` do not support the new fields.

- [ ] **Step 3: Extend form state**

In `DocumentsPage.tsx`, add to `DocumentForm`:

```ts
counterpartyAccountId: string;
personId: string;
usdtAmountMajor: string;
```

Add empty defaults in `createInitialForm`.

- [ ] **Step 4: Extend `buildDocumentPayload`**

After creating the line object, add optional line fields:

```ts
const line = (payload.lines as Array<Record<string, unknown>>)[0];

const counterpartyAccountId = form.counterpartyAccountId.trim();
if (counterpartyAccountId) line.counterpartyAccountId = counterpartyAccountId;

const personId = form.personId.trim();
if (personId) line.personId = personId;

const usdtAmountMajor = form.usdtAmountMajor.trim();
if (usdtAmountMajor) line.usdtAmountMinor = amountMajorToMinor(usdtAmountMajor);
```

Keep existing borrower behavior unchanged.

- [ ] **Step 5: Add form inputs**

Add inputs near the current account fields:

```tsx
<label>
  对方账户ID
  <input
    value={form.counterpartyAccountId}
    onChange={(event) => setForm((current) => ({ ...current, counterpartyAccountId: event.target.value }))}
    maxLength={80}
  />
</label>

<label>
  人员ID
  <input
    value={form.personId}
    onChange={(event) => setForm((current) => ({ ...current, personId: event.target.value }))}
    maxLength={80}
  />
</label>

<label>
  USDT成本
  <input
    value={form.usdtAmountMajor}
    onChange={(event) => setForm((current) => ({ ...current, usdtAmountMajor: event.target.value }))}
    inputMode="decimal"
    maxLength={24}
  />
</label>
```

- [ ] **Step 6: Run UI tests**

Run:

```bash
npm run test -- src/app/pages/DocumentsPage.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/app/pages/DocumentsPage.tsx src/app/pages/DocumentsPage.test.ts
git commit -m "feat: add fifo document line fields"
```

## Task 7: Report UI For Lots And Pending Costs

**Files:**
- Modify: `src/app/pages/ReportsPage.tsx`
- Modify: `src/app/styles.css`

- [ ] **Step 1: Add report state and fetches**

Modify `ReportsState`:

```ts
interface LotBalance {
  id: string;
  currency_code: string;
  remaining_amount_minor: number;
  remaining_usdt_cost_minor: number;
  current_account_id: string;
  current_person_id: string | null;
  lot_date: string;
}

interface LotMovement {
  id: string;
  lot_id: string;
  document_id: string;
  movement_type: string;
  amount_minor: number;
  usdt_cost_minor: number;
  movement_date: string;
}

interface PendingCost {
  id: string;
  document_id: string;
  person_id: string;
  account_id: string;
  currency_code: string;
  remaining_amount_minor: number;
  expense_date: string;
  status: string;
}
```

Add `lotBalances`, `lotMovements`, and `pendingCosts` arrays to `ReportsState` and `emptyReports`.

Update `loadReports` to fetch:

```ts
getJson<ApiEnvelope<LotBalance[]>>("/api/reports/lots"),
getJson<ApiEnvelope<LotMovement[]>>("/api/reports/lot-movements"),
getJson<ApiEnvelope<PendingCost[]>>("/api/reports/pending-costs")
```

- [ ] **Step 2: Add report sections**

Add three `<section className="panel">` blocks:

1. `换汇批次 / 批次余额`
2. `FIFO 消耗明细`
3. `待匹配成本`

Each section must use the existing `.table-wrap` and table pattern. Use `DataStateRow` for empty states.

- [ ] **Step 3: Run build**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/pages/ReportsPage.tsx src/app/styles.css
git commit -m "feat: show fifo reports"
```

## Task 8: FIFO And Pending Cost Index Migration

**Files:**
- Create: `migrations/0003_fifo_petty_cash_indexes.sql`

- [ ] **Step 1: Add migration**

Create `migrations/0003_fifo_petty_cash_indexes.sql`:

```sql
CREATE INDEX IF NOT EXISTS idx_lots_account_person_currency_date ON lots(current_account_id, current_person_id, currency_code, status, lot_date);
CREATE INDEX IF NOT EXISTS idx_lot_movements_document_id ON lot_movements(document_id);
CREATE INDEX IF NOT EXISTS idx_lot_movements_lot_date ON lot_movements(lot_id, movement_date);
CREATE INDEX IF NOT EXISTS idx_pending_cost_matches_lookup ON pending_cost_matches(account_id, person_id, currency_code, status, expense_date, created_at);
```

- [ ] **Step 2: Run local migration**

Run:

```bash
npm run db:migrate:local
```

Expected: Wrangler applies `0003_fifo_petty_cash_indexes.sql` without SQL errors.

- [ ] **Step 3: Commit**

```bash
git add migrations/0003_fifo_petty_cash_indexes.sql
git commit -m "chore: index fifo and petty cash tables"
```

## Task 9: Final Verification

**Files:**
- Modify: `docs/deployment.md` only if local or deployment commands changed.

- [ ] **Step 1: Run full tests**

Run:

```bash
npm run test
```

Expected: all Vitest suites pass.

- [ ] **Step 2: Run production build**

Run:

```bash
npm run build
```

Expected: Vite build completes with exit code 0.

- [ ] **Step 3: Run local D1 migration**

Run:

```bash
npm run db:migrate:local
```

Expected: Wrangler reports migrations applied or already applied without SQL errors.

- [ ] **Step 4: Start local Worker for browser verification**

Run:

```bash
npm run cf:dev -- --port 8787
```

Expected: local Worker serves `http://localhost:8787`.

- [ ] **Step 5: Browser smoke test**

Open `http://localhost:8787` and verify:

1. Create and approve an `exchange` document:
   - `accountId = demo_acct_aed_reserve`
   - `counterpartyAccountId = demo_acct_usdt_main`
   - `currencyCode = AED`
   - `amountMajor = 3670`
   - `usdtAmountMajor = 1000`
   - Expected: account balances change by USDT `-100000` and AED `+367000`; a new AED lot appears.
2. Create and approve a `petty_cash_issue` document:
   - `accountId = demo_acct_aed_reserve`
   - `counterpartyAccountId = demo_acct_petty_bob`
   - `personId = demo_person_ops`
   - `currencyCode = AED`
   - `amountMajor = 2000`
   - Expected: AED reserve decreases, Bob petty cash increases, lots move to Bob.
3. Create and approve a `petty_cash_reimbursement` document:
   - `accountId = demo_acct_petty_bob`
   - `personId = demo_person_ops`
   - `currencyCode = AED`
   - `amountMajor = 2150`
   - Expected: Bob petty cash balance can become negative; pending cost appears when lots are insufficient.
4. Open report center and verify lot balances, FIFO movements, and pending-cost rows are visible.

- [ ] **Step 6: Commit verification-only docs if changed**

If `docs/deployment.md` changed:

```bash
git add docs/deployment.md
git commit -m "docs: update fifo verification notes"
```

## Implementation Notes

- Keep all approval writes conditional on both `documents.status = 'pending'` and the period not being locked.
- Do not let pending or draft documents affect reports.
- Do not update account balances directly; account balances remain derived from `account_entries`.
- Lot balances must be updated only through approval posting effects.
- Petty-cash negative balance is represented by account entries and pending costs, not by negative lot balances.
- FIFO lot allocation must use `lot_date, id` ordering.
- Pending-cost matching must use `expense_date, created_at, id` ordering.
- This phase intentionally does not implement reversal restoration for lots.

## Self-Review Notes

Spec coverage in this plan:

- Exchange lots: Tasks 1, 2, 3, 4, 5, 7, and 9.
- FIFO movement: Tasks 2, 3, 4, 5, 7, and 9.
- Petty-cash negative balance: Tasks 2, 3, 4, 5, 7, and 9.
- Pending-cost matching: Tasks 2, 3, 4, 5, 7, and 9.
- UI data entry for exchange and petty cash: Task 6.
- Local migration and verification: Tasks 8 and 9.

Intentionally excluded and planned separately:

- Reversal and complex FIFO restoration.
- Petty-cash returns.
- Account transfers.
- Full project expense cost completeness.
- Role permissions and high-risk batch adjustments.

Placeholder scan:

- No placeholder markers or open-ended implementation placeholders remain.

Type consistency:

- Repository effect names match `src/domain/fifoEffects.ts`.
- Report endpoint names match router paths.
- UI payload field names match existing `RawDocumentLine`.
