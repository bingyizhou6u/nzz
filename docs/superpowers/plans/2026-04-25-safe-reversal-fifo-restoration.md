# Safe Reversal And FIFO Restoration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement safe reversal approvals that negate the original approved document effects and restore FIFO lots only when the original lot effects have no downstream consumption.

**Architecture:** Reversal approval must derive account and loan entries from the approved original document, not from user-entered reversal lines. FIFO restoration is a conservative domain planner fed by repository snapshots: it restores original movements only when affected lots have no later movements and any lots created by the original document are still fully available. The final approval still writes account entries, loan entries, lot updates, lot movements, audit, and status in the existing guarded D1 batch.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, Cloudflare Workers, Cloudflare D1, Wrangler.

---

## Scope Check

This phase implements a safe subset of formal-system reversal behavior:

1. `project_income`, `loan_out`, and `loan_repayment` reversals:
   - Read approved original account and loan entries.
   - Insert opposite entries under the reversal document.
   - Do not trust reversal document line amounts for posting.
2. FIFO document reversals:
   - `exchange`
   - `account_transfer`
   - `petty_cash_issue`
   - `petty_cash_return`
   - `petty_cash_reimbursement`
3. FIFO reversals are allowed only when all affected lots are safe:
   - No later `lot_movements` exist for any lot affected by the original document.
   - Lots created by the original document are still fully remaining.
   - Original document did not create or match pending costs, except the zero-pending case.
4. Complex reversals are rejected with clear errors, leaving a later high-permission adjustment flow to handle them.

Excluded from this phase:

1. Transfer fees.
2. `loan_writeoff`.
3. `manual_adjustment`.
4. Reversing pending-cost matches that were already partially or fully matched by later petty-cash issues.
5. Reversing reimbursement documents that created pending costs.
6. Lock-accounting UX, role permissions, Cloudflare Access mapping, attachments, exports, and backups.

## Reversal Rules

| Original document type | Account/loan reversal | FIFO reversal in this phase |
| --- | --- | --- |
| `project_income` | Negate original account entries | No FIFO |
| `loan_out` | Negate original account and loan entries | No FIFO |
| `loan_repayment` | Negate original account and loan entries | No FIFO |
| `exchange` | Negate original account entries | Close the unconsumed exchange-created lot |
| `account_transfer` | Negate original account entries | Restore source lots and close target lots created by original transfer |
| `petty_cash_issue` | Negate original account entries | Restore reserve lots and close staff lots only when no pending-cost match happened |
| `petty_cash_return` | Negate original account entries | Restore staff lots and close returned reserve lots |
| `petty_cash_reimbursement` | Negate original account entries | Restore consumed staff lots only when no pending cost was created |

## File Structure

- Create: `src/domain/reversalPosting.ts`
  - Pure function for negating original account and loan entries.
- Create: `src/domain/fifoReversal.ts`
  - Pure safe FIFO reversal planner.
- Modify: `src/domain/fifoEffects.ts`
  - Add `fifo_reversal` to `LotMovementType`.
- Modify: `src/repositories/documentRepository.ts`
  - Add read methods needed to reconstruct original approved posting effects.
- Modify: `src/services/documentService.ts`
  - Route `action_type === "reversal"` through source-derived reversal approval.
- Test: `tests/domain/reversalPosting.test.ts`
- Test: `tests/domain/fifoReversal.test.ts`
- Test: `tests/api/documentRepository.test.ts`
- Test: `tests/api/documentService.test.ts`
- Test: `tests/api/documents.test.ts`

## Task 1: Source-Derived Reversal Posting

**Files:**
- Create: `src/domain/reversalPosting.ts`
- Test: `tests/domain/reversalPosting.test.ts`

- [ ] **Step 1: Write failing domain tests**

Create `tests/domain/reversalPosting.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { entriesForReversalDocument } from "../../src/domain/reversalPosting";

describe("entriesForReversalDocument", () => {
  it("negates original account entries using the reversal business date", () => {
    expect(
      entriesForReversalDocument({
        reversalDate: "2026-04-25",
        originalAccountEntries: [
          { accountId: "acct_aed_reserve", currencyCode: "AED", amountMinor: 367000 },
          { accountId: "acct_usdt_main", currencyCode: "USDT", amountMinor: -100000 }
        ],
        originalLoanEntries: []
      })
    ).toEqual({
      accountEntries: [
        { accountId: "acct_aed_reserve", currencyCode: "AED", amountMinor: -367000, entryDate: "2026-04-25" },
        { accountId: "acct_usdt_main", currencyCode: "USDT", amountMinor: 100000, entryDate: "2026-04-25" }
      ],
      loanEntries: []
    });
  });

  it("negates original loan entries using the reversal business date", () => {
    expect(
      entriesForReversalDocument({
        reversalDate: "2026-04-25",
        originalAccountEntries: [{ accountId: "acct_usdt_main", currencyCode: "USDT", amountMinor: -120000 }],
        originalLoanEntries: [{ borrowerPersonId: "person_borrower", currencyCode: "USDT", amountMinor: 120000 }]
      })
    ).toEqual({
      accountEntries: [
        { accountId: "acct_usdt_main", currencyCode: "USDT", amountMinor: 120000, entryDate: "2026-04-25" }
      ],
      loanEntries: [
        { borrowerPersonId: "person_borrower", currencyCode: "USDT", amountMinor: -120000, entryDate: "2026-04-25" }
      ]
    });
  });

  it("rejects reversals with no original posting effects", () => {
    expect(() =>
      entriesForReversalDocument({
        reversalDate: "2026-04-25",
        originalAccountEntries: [],
        originalLoanEntries: []
      })
    ).toThrow("Original document has no posting entries to reverse");
  });
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run test -- tests/domain/reversalPosting.test.ts
```

Expected: FAIL because `src/domain/reversalPosting.ts` does not exist.

- [ ] **Step 3: Implement reversal posting**

Create `src/domain/reversalPosting.ts`:

```ts
export interface OriginalAccountEntry {
  accountId: string;
  currencyCode: string;
  amountMinor: number;
}

export interface OriginalLoanEntry {
  borrowerPersonId: string;
  currencyCode: string;
  amountMinor: number;
}

export interface ReversalPostingInput {
  reversalDate: string;
  originalAccountEntries: OriginalAccountEntry[];
  originalLoanEntries: OriginalLoanEntry[];
}

export interface ReversalPostingResult {
  accountEntries: Array<{ accountId: string; currencyCode: string; amountMinor: number; entryDate: string }>;
  loanEntries: Array<{ borrowerPersonId: string; currencyCode: string; amountMinor: number; entryDate: string }>;
}

export function entriesForReversalDocument(input: ReversalPostingInput): ReversalPostingResult {
  const reversalDate = requireNonEmpty(input.reversalDate, "reversalDate");
  if (input.originalAccountEntries.length === 0 && input.originalLoanEntries.length === 0) {
    throw new Error("Original document has no posting entries to reverse");
  }

  return {
    accountEntries: input.originalAccountEntries.map((entry) => ({
      accountId: requireNonEmpty(entry.accountId, "accountId"),
      currencyCode: requireNonEmpty(entry.currencyCode, "currencyCode"),
      amountMinor: -requireSafeInteger(entry.amountMinor, "amountMinor"),
      entryDate: reversalDate
    })),
    loanEntries: input.originalLoanEntries.map((entry) => ({
      borrowerPersonId: requireNonEmpty(entry.borrowerPersonId, "borrowerPersonId"),
      currencyCode: requireNonEmpty(entry.currencyCode, "currencyCode"),
      amountMinor: -requireSafeInteger(entry.amountMinor, "amountMinor"),
      entryDate: reversalDate
    }))
  };
}

function requireNonEmpty(value: string, label: string): string {
  const trimmed = value.trim();
  if (!trimmed) throw new Error(`${label} must be non-empty`);
  return trimmed;
}

function requireSafeInteger(value: number, label: string): number {
  if (!Number.isSafeInteger(value)) throw new Error(`${label} must be a safe integer`);
  return value;
}
```

- [ ] **Step 4: Verify the test passes**

Run:

```bash
npm run test -- tests/domain/reversalPosting.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/reversalPosting.ts tests/domain/reversalPosting.test.ts
git commit -m "feat: derive reversal posting entries"
```

## Task 2: Safe FIFO Reversal Planner

**Files:**
- Create: `src/domain/fifoReversal.ts`
- Modify: `src/domain/fifoEffects.ts`
- Test: `tests/domain/fifoReversal.test.ts`

- [ ] **Step 1: Add `fifo_reversal` movement type**

Modify `src/domain/fifoEffects.ts`:

```ts
export type LotMovementType =
  | "exchange_in"
  | "account_transfer"
  | "petty_cash_issue"
  | "petty_cash_return"
  | "petty_cash_reimbursement"
  | "pending_cost_match"
  | "fifo_reversal";
```

- [ ] **Step 2: Write failing FIFO reversal tests**

Create `tests/domain/fifoReversal.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { planSafeFifoReversalEffects } from "../../src/domain/fifoReversal";

describe("planSafeFifoReversalEffects", () => {
  it("closes an unconsumed exchange-created lot", () => {
    expect(
      planSafeFifoReversalEffects({
        reversalDocumentId: "doc_rev",
        originalDocumentId: "doc_fx",
        originalDocumentType: "exchange",
        reversalDate: "2026-04-25",
        originalMovements: [
          {
            id: "move_fx",
            lotId: "lot_fx",
            movementType: "exchange_in",
            fromAccountId: null,
            toAccountId: "acct_aed_reserve",
            fromPersonId: null,
            toPersonId: null,
            amountMinor: 367000,
            usdtCostMinor: 100000,
            createdAt: "2026-04-24T10:00:00.000Z"
          }
        ],
        lots: [
          {
            id: "lot_fx",
            originalAmountMinor: 367000,
            remainingAmountMinor: 367000,
            originalUsdtCostMinor: 100000,
            remainingUsdtCostMinor: 100000,
            currentAccountId: "acct_aed_reserve",
            currentPersonId: null,
            sourceDocumentId: "doc_fx"
          }
        ],
        pendingCosts: [],
        laterMovementLotIds: []
      })
    ).toEqual({
      lotCreations: [],
      lotUpdates: [
        {
          lotId: "lot_fx",
          amountDeltaMinor: -367000,
          usdtCostDeltaMinor: -100000,
          expectedRemainingAmountMinor: 367000,
          expectedRemainingUsdtCostMinor: 100000
        }
      ],
      lotMovements: [
        {
          lotId: "lot_fx",
          movementType: "fifo_reversal",
          fromAccountId: "acct_aed_reserve",
          toAccountId: null,
          fromPersonId: null,
          toPersonId: null,
          amountMinor: 367000,
          usdtCostMinor: 100000,
          movementDate: "2026-04-25"
        }
      ],
      pendingCostCreations: [],
      pendingCostUpdates: []
    });
  });

  it("restores transfer source lots and closes target lots created by the original transfer", () => {
    const result = planSafeFifoReversalEffects({
      reversalDocumentId: "doc_rev",
      originalDocumentId: "doc_transfer",
      originalDocumentType: "account_transfer",
      reversalDate: "2026-04-25",
      originalMovements: [
        {
          id: "move_transfer",
          lotId: "lot_source",
          movementType: "account_transfer",
          fromAccountId: "acct_aed_reserve",
          toAccountId: "acct_aed_bank",
          fromPersonId: null,
          toPersonId: null,
          amountMinor: 50000,
          usdtCostMinor: 13650,
          createdAt: "2026-04-24T10:00:00.000Z"
        }
      ],
      lots: [
        {
          id: "lot_source",
          originalAmountMinor: 100000,
          remainingAmountMinor: 50000,
          originalUsdtCostMinor: 27300,
          remainingUsdtCostMinor: 13650,
          currentAccountId: "acct_aed_reserve",
          currentPersonId: null,
          sourceDocumentId: "doc_fx"
        },
        {
          id: "lot_created",
          originalAmountMinor: 50000,
          remainingAmountMinor: 50000,
          originalUsdtCostMinor: 13650,
          remainingUsdtCostMinor: 13650,
          currentAccountId: "acct_aed_bank",
          currentPersonId: null,
          sourceDocumentId: "doc_transfer"
        }
      ],
      pendingCosts: [],
      laterMovementLotIds: []
    });

    expect(result.lotUpdates).toEqual([
      {
        lotId: "lot_source",
        amountDeltaMinor: 50000,
        usdtCostDeltaMinor: 13650,
        expectedRemainingAmountMinor: 50000,
        expectedRemainingUsdtCostMinor: 13650
      },
      {
        lotId: "lot_created",
        amountDeltaMinor: -50000,
        usdtCostDeltaMinor: -13650,
        expectedRemainingAmountMinor: 50000,
        expectedRemainingUsdtCostMinor: 13650
      }
    ]);
    expect(result.lotMovements).toEqual([
      {
        lotId: "lot_source",
        movementType: "fifo_reversal",
        fromAccountId: "acct_aed_bank",
        toAccountId: "acct_aed_reserve",
        fromPersonId: null,
        toPersonId: null,
        amountMinor: 50000,
        usdtCostMinor: 13650,
        movementDate: "2026-04-25"
      }
    ]);
  });

  it("restores reimbursement-consumed staff lots when no pending cost was created", () => {
    expect(
      planSafeFifoReversalEffects({
        reversalDocumentId: "doc_rev",
        originalDocumentId: "doc_reim",
        originalDocumentType: "petty_cash_reimbursement",
        reversalDate: "2026-04-25",
        originalMovements: [
          {
            id: "move_reim",
            lotId: "staff_lot",
            movementType: "petty_cash_reimbursement",
            fromAccountId: "acct_petty_bob",
            toAccountId: null,
            fromPersonId: "person_bob",
            toPersonId: null,
            amountMinor: 80000,
            usdtCostMinor: 21840,
            createdAt: "2026-04-24T10:00:00.000Z"
          }
        ],
        lots: [
          {
            id: "staff_lot",
            originalAmountMinor: 90000,
            remainingAmountMinor: 10000,
            originalUsdtCostMinor: 24570,
            remainingUsdtCostMinor: 2730,
            currentAccountId: "acct_petty_bob",
            currentPersonId: "person_bob",
            sourceDocumentId: "doc_issue"
          }
        ],
        pendingCosts: [],
        laterMovementLotIds: []
      }).lotUpdates
    ).toEqual([
      {
        lotId: "staff_lot",
        amountDeltaMinor: 80000,
        usdtCostDeltaMinor: 21840,
        expectedRemainingAmountMinor: 10000,
        expectedRemainingUsdtCostMinor: 2730
      }
    ]);
  });

  it("rejects reversal when affected lots have later movements", () => {
    expect(() =>
      planSafeFifoReversalEffects({
        reversalDocumentId: "doc_rev",
        originalDocumentId: "doc_transfer",
        originalDocumentType: "account_transfer",
        reversalDate: "2026-04-25",
        originalMovements: [],
        lots: [],
        pendingCosts: [],
        laterMovementLotIds: ["lot_source"]
      })
    ).toThrow("Complex FIFO reversal requires manual review: affected lots have later movements");
  });

  it("rejects reversal when pending costs are involved", () => {
    expect(() =>
      planSafeFifoReversalEffects({
        reversalDocumentId: "doc_rev",
        originalDocumentId: "doc_reim",
        originalDocumentType: "petty_cash_reimbursement",
        reversalDate: "2026-04-25",
        originalMovements: [],
        lots: [],
        pendingCosts: [{ id: "pending_1", remainingAmountMinor: 1000 }],
        laterMovementLotIds: []
      })
    ).toThrow("Complex FIFO reversal requires manual review: pending costs are involved");
  });
});
```

- [ ] **Step 3: Run the failing FIFO reversal test**

Run:

```bash
npm run test -- tests/domain/fifoReversal.test.ts
```

Expected: FAIL because `src/domain/fifoReversal.ts` does not exist.

- [ ] **Step 4: Implement the FIFO reversal planner**

Create `src/domain/fifoReversal.ts`:

```ts
import { emptyFifoPostingEffects, type FifoPostingEffects, type LotMovementType } from "./fifoEffects";
import type { DocumentType } from "./types";

export interface OriginalLotMovement {
  id: string;
  lotId: string;
  movementType: LotMovementType;
  fromAccountId: string | null;
  toAccountId: string | null;
  fromPersonId: string | null;
  toPersonId: string | null;
  amountMinor: number;
  usdtCostMinor: number;
  createdAt: string;
}

export interface ReversalLotSnapshot {
  id: string;
  originalAmountMinor: number;
  remainingAmountMinor: number;
  originalUsdtCostMinor: number;
  remainingUsdtCostMinor: number;
  currentAccountId: string;
  currentPersonId: string | null;
  sourceDocumentId: string;
}

export interface ReversalPendingCostSnapshot {
  id: string;
  remainingAmountMinor: number;
}

export interface SafeFifoReversalInput {
  reversalDocumentId: string;
  originalDocumentId: string;
  originalDocumentType: DocumentType;
  reversalDate: string;
  originalMovements: OriginalLotMovement[];
  lots: ReversalLotSnapshot[];
  pendingCosts: ReversalPendingCostSnapshot[];
  laterMovementLotIds: string[];
}

export function planSafeFifoReversalEffects(input: SafeFifoReversalInput): FifoPostingEffects {
  requireNonEmpty(input.reversalDocumentId, "reversalDocumentId");
  const originalDocumentId = requireNonEmpty(input.originalDocumentId, "originalDocumentId");
  const reversalDate = requireNonEmpty(input.reversalDate, "reversalDate");

  if (!isFifoDocumentType(input.originalDocumentType)) {
    return emptyFifoPostingEffects();
  }
  if (input.laterMovementLotIds.length > 0) {
    throw new Error("Complex FIFO reversal requires manual review: affected lots have later movements");
  }
  if (input.pendingCosts.length > 0 || input.originalMovements.some((movement) => movement.movementType === "pending_cost_match")) {
    throw new Error("Complex FIFO reversal requires manual review: pending costs are involved");
  }

  if (input.originalDocumentType === "exchange") {
    return closeCreatedLots({
      originalDocumentId,
      reversalDate,
      lots: input.lots.filter((lot) => lot.sourceDocumentId === originalDocumentId)
    });
  }

  if (input.originalDocumentType === "petty_cash_reimbursement") {
    return restoreMovementLots({
      reversalDate,
      movements: movementsOfType(input.originalMovements, "petty_cash_reimbursement"),
      lots: input.lots
    });
  }

  const movementType = movementTypeForTransferLike(input.originalDocumentType);
  if (!movementType) {
    return emptyFifoPostingEffects();
  }

  const restoreEffects = restoreMovementLots({
    reversalDate,
    movements: movementsOfType(input.originalMovements, movementType),
    lots: input.lots
  });
  const closeEffects = closeCreatedLots({
    originalDocumentId,
    reversalDate,
    lots: input.lots.filter((lot) => lot.sourceDocumentId === originalDocumentId)
  });

  return {
    lotCreations: [],
    lotUpdates: [...restoreEffects.lotUpdates, ...closeEffects.lotUpdates],
    lotMovements: restoreEffects.lotMovements,
    pendingCostCreations: [],
    pendingCostUpdates: []
  };
}

function restoreMovementLots(input: {
  reversalDate: string;
  movements: OriginalLotMovement[];
  lots: ReversalLotSnapshot[];
}): FifoPostingEffects {
  const lotsById = new Map(input.lots.map((lot) => [lot.id, lot]));
  return {
    lotCreations: [],
    lotUpdates: input.movements.map((movement) => {
      const lot = requireLot(lotsById, movement.lotId);
      return {
        lotId: lot.id,
        amountDeltaMinor: requirePositiveSafeInteger(movement.amountMinor, "movement amountMinor"),
        usdtCostDeltaMinor: requirePositiveSafeInteger(movement.usdtCostMinor, "movement usdtCostMinor"),
        expectedRemainingAmountMinor: lot.remainingAmountMinor,
        expectedRemainingUsdtCostMinor: lot.remainingUsdtCostMinor
      };
    }),
    lotMovements: input.movements.map((movement) => ({
      lotId: movement.lotId,
      movementType: "fifo_reversal" as const,
      fromAccountId: movement.toAccountId,
      toAccountId: movement.fromAccountId,
      fromPersonId: movement.toPersonId,
      toPersonId: movement.fromPersonId,
      amountMinor: movement.amountMinor,
      usdtCostMinor: movement.usdtCostMinor,
      movementDate: input.reversalDate
    })),
    pendingCostCreations: [],
    pendingCostUpdates: []
  };
}

function closeCreatedLots(input: {
  originalDocumentId: string;
  reversalDate: string;
  lots: ReversalLotSnapshot[];
}): FifoPostingEffects {
  return {
    lotCreations: [],
    lotUpdates: input.lots.map((lot) => {
      if (lot.remainingAmountMinor !== lot.originalAmountMinor || lot.remainingUsdtCostMinor !== lot.originalUsdtCostMinor) {
        throw new Error("Complex FIFO reversal requires manual review: created lots are no longer fully available");
      }
      return {
        lotId: lot.id,
        amountDeltaMinor: -requirePositiveSafeInteger(lot.remainingAmountMinor, "lot remainingAmountMinor"),
        usdtCostDeltaMinor: -requirePositiveSafeInteger(lot.remainingUsdtCostMinor, "lot remainingUsdtCostMinor"),
        expectedRemainingAmountMinor: lot.remainingAmountMinor,
        expectedRemainingUsdtCostMinor: lot.remainingUsdtCostMinor
      };
    }),
    lotMovements: input.lots.map((lot) => ({
      lotId: lot.id,
      movementType: "fifo_reversal" as const,
      fromAccountId: lot.currentAccountId,
      toAccountId: null,
      fromPersonId: lot.currentPersonId,
      toPersonId: null,
      amountMinor: lot.remainingAmountMinor,
      usdtCostMinor: lot.remainingUsdtCostMinor,
      movementDate: input.reversalDate
    })),
    pendingCostCreations: [],
    pendingCostUpdates: []
  };
}

function movementsOfType(movements: OriginalLotMovement[], movementType: LotMovementType) {
  const filtered = movements.filter((movement) => movement.movementType === movementType);
  if (filtered.length === 0) {
    throw new Error("Original document has no FIFO movements to reverse");
  }
  return filtered;
}

function movementTypeForTransferLike(documentType: DocumentType): LotMovementType | null {
  if (documentType === "account_transfer") return "account_transfer";
  if (documentType === "petty_cash_issue") return "petty_cash_issue";
  if (documentType === "petty_cash_return") return "petty_cash_return";
  return null;
}

function isFifoDocumentType(documentType: DocumentType) {
  return (
    documentType === "exchange" ||
    documentType === "account_transfer" ||
    documentType === "petty_cash_issue" ||
    documentType === "petty_cash_return" ||
    documentType === "petty_cash_reimbursement"
  );
}

function requireLot(lotsById: Map<string, ReversalLotSnapshot>, lotId: string) {
  const lot = lotsById.get(lotId);
  if (!lot) throw new Error(`Lot snapshot is required for reversal: ${lotId}`);
  return lot;
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
```

- [ ] **Step 5: Verify FIFO reversal tests pass**

Run:

```bash
npm run test -- tests/domain/fifoReversal.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/fifoEffects.ts src/domain/fifoReversal.ts tests/domain/fifoReversal.test.ts
git commit -m "feat: plan safe fifo reversals"
```

## Task 3: Repository Reads For Original Posting Context

**Files:**
- Modify: `src/repositories/documentRepository.ts`
- Test: `tests/api/documentRepository.test.ts`

- [ ] **Step 1: Add repository read tests**

Append these tests to `tests/api/documentRepository.test.ts`:

```ts
it("lists account entries by document for reversal posting", async () => {
  let sql = "";
  let boundValues: unknown[] = [];
  const row = { account_id: "acct_usdt", currency_code: "USDT", amount_minor: 10000 };
  const repo = new DocumentRepository(
    mockDb({ allResults: [row], onSql: (value) => (sql = value), onBind: (values) => (boundValues = values) })
  );

  await expect(repo.listAccountEntriesForDocument("doc_original")).resolves.toEqual([row]);
  expect(sql.replace(/\s+/g, " ").toLowerCase()).toContain("from account_entries");
  expect(boundValues).toEqual(["doc_original"]);
});

it("lists loan entries by document for reversal posting", async () => {
  let sql = "";
  let boundValues: unknown[] = [];
  const row = { borrower_person_id: "person_1", currency_code: "USDT", amount_minor: 10000 };
  const repo = new DocumentRepository(
    mockDb({ allResults: [row], onSql: (value) => (sql = value), onBind: (values) => (boundValues = values) })
  );

  await expect(repo.listLoanEntriesForDocument("doc_original")).resolves.toEqual([row]);
  expect(sql.replace(/\s+/g, " ").toLowerCase()).toContain("from loan_entries");
  expect(boundValues).toEqual(["doc_original"]);
});

it("lists fifo reversal context by original document", async () => {
  const sqlStatements: string[] = [];
  const bindCalls: unknown[][] = [];
  const repo = new DocumentRepository(
    mockDb({ allResults: [], onSql: (sql) => sqlStatements.push(sql), onBind: (values) => bindCalls.push(values) })
  );

  await repo.listLotMovementsForDocument("doc_original");
  await repo.listLotsCreatedByDocument("doc_original");
  await repo.listPendingCostMatchesForDocument("doc_original");

  const normalizedSql = sqlStatements.join(" ").replace(/\s+/g, " ").toLowerCase();
  expect(normalizedSql).toContain("from lot_movements");
  expect(normalizedSql).toContain("from lots");
  expect(normalizedSql).toContain("from pending_cost_matches");
  expect(bindCalls).toEqual([["doc_original"], ["doc_original"], ["doc_original"]]);
});

it("lists lot snapshots and later movement conflicts for reversal safety checks", async () => {
  const sqlStatements: string[] = [];
  const bindCalls: unknown[][] = [];
  const repo = new DocumentRepository(
    mockDb({ allResults: [], onSql: (sql) => sqlStatements.push(sql), onBind: (values) => bindCalls.push(values) })
  );

  await repo.listLotsByIds(["lot_a", "lot_b"]);
  await repo.listLaterMovementLotIds({ lotIds: ["lot_a", "lot_b"], originalDocumentId: "doc_original" });

  const normalizedSql = sqlStatements.join(" ").replace(/\s+/g, " ").toLowerCase();
  expect(normalizedSql).toContain("where id in (?, ?)");
  expect(normalizedSql).toContain("select distinct lot_id");
  expect(normalizedSql).toContain("document_id <> ?");
  expect(bindCalls).toEqual([
    ["lot_a", "lot_b"],
    ["lot_a", "lot_b", "doc_original", "doc_original"]
  ]);
});
```

- [ ] **Step 2: Run failing repository tests**

Run:

```bash
npm run test -- tests/api/documentRepository.test.ts
```

Expected: FAIL because the new repository methods do not exist.

- [ ] **Step 3: Add row interfaces**

Add these interfaces to `src/repositories/documentRepository.ts`:

```ts
export interface AccountEntryReversalRow {
  account_id: string;
  currency_code: string;
  amount_minor: number;
}

export interface LoanEntryReversalRow {
  borrower_person_id: string;
  currency_code: string;
  amount_minor: number;
}

export interface LotMovementReversalRow {
  id: string;
  lot_id: string;
  movement_type: string;
  from_account_id: string | null;
  to_account_id: string | null;
  from_person_id: string | null;
  to_person_id: string | null;
  amount_minor: number;
  usdt_cost_minor: number;
  created_at: string;
}

export interface LotReversalRow {
  id: string;
  original_amount_minor: number;
  remaining_amount_minor: number;
  original_usdt_cost_minor: number;
  remaining_usdt_cost_minor: number;
  source_document_id: string;
  current_account_id: string;
  current_person_id: string | null;
}

export interface PendingCostReversalRow {
  id: string;
  remaining_amount_minor: number;
}
```

- [ ] **Step 4: Add repository methods**

Add these methods to `DocumentRepository`:

```ts
listAccountEntriesForDocument(documentId: string): Promise<AccountEntryReversalRow[]> {
  return all<AccountEntryReversalRow>(
    this.db
      .prepare(`
        SELECT account_id, currency_code, amount_minor
        FROM account_entries
        WHERE document_id = ?
        ORDER BY created_at, id
      `)
      .bind(documentId)
  );
}

listLoanEntriesForDocument(documentId: string): Promise<LoanEntryReversalRow[]> {
  return all<LoanEntryReversalRow>(
    this.db
      .prepare(`
        SELECT borrower_person_id, currency_code, amount_minor
        FROM loan_entries
        WHERE document_id = ?
        ORDER BY created_at, id
      `)
      .bind(documentId)
  );
}

listLotMovementsForDocument(documentId: string): Promise<LotMovementReversalRow[]> {
  return all<LotMovementReversalRow>(
    this.db
      .prepare(`
        SELECT
          id, lot_id, movement_type, from_account_id, to_account_id,
          from_person_id, to_person_id, amount_minor, usdt_cost_minor, created_at
        FROM lot_movements
        WHERE document_id = ?
        ORDER BY created_at, id
      `)
      .bind(documentId)
  );
}

listLotsCreatedByDocument(documentId: string): Promise<LotReversalRow[]> {
  return all<LotReversalRow>(
    this.db
      .prepare(`
        SELECT
          id, original_amount_minor, remaining_amount_minor,
          original_usdt_cost_minor, remaining_usdt_cost_minor,
          source_document_id, current_account_id, current_person_id
        FROM lots
        WHERE source_document_id = ?
        ORDER BY created_at, id
      `)
      .bind(documentId)
  );
}

listPendingCostMatchesForDocument(documentId: string): Promise<PendingCostReversalRow[]> {
  return all<PendingCostReversalRow>(
    this.db
      .prepare(`
        SELECT id, remaining_amount_minor
        FROM pending_cost_matches
        WHERE document_id = ?
        ORDER BY created_at, id
      `)
      .bind(documentId)
  );
}

listLotsByIds(lotIds: string[]): Promise<LotReversalRow[]> {
  if (lotIds.length === 0) return Promise.resolve([]);
  const placeholders = lotIds.map(() => "?").join(", ");
  return all<LotReversalRow>(
    this.db
      .prepare(`
        SELECT
          id, original_amount_minor, remaining_amount_minor,
          original_usdt_cost_minor, remaining_usdt_cost_minor,
          source_document_id, current_account_id, current_person_id
        FROM lots
        WHERE id IN (${placeholders})
        ORDER BY created_at, id
      `)
      .bind(...lotIds)
  );
}

listLaterMovementLotIds(input: { lotIds: string[]; originalDocumentId: string }): Promise<Array<{ lot_id: string }>> {
  if (input.lotIds.length === 0) return Promise.resolve([]);
  const placeholders = input.lotIds.map(() => "?").join(", ");
  return all<{ lot_id: string }>(
    this.db
      .prepare(`
        SELECT DISTINCT lot_id
        FROM lot_movements
        WHERE lot_id IN (${placeholders})
          AND document_id <> ?
          AND created_at > (
            SELECT COALESCE(MAX(created_at), '')
            FROM lot_movements
            WHERE document_id = ?
          )
        ORDER BY lot_id
      `)
      .bind(...input.lotIds, input.originalDocumentId, input.originalDocumentId)
  );
}
```

- [ ] **Step 5: Verify repository tests pass**

Run:

```bash
npm run test -- tests/api/documentRepository.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/repositories/documentRepository.ts tests/api/documentRepository.test.ts
git commit -m "feat: read reversal posting context"
```

## Task 4: Reversal Approval Orchestration

**Files:**
- Modify: `src/services/documentService.ts`
- Test: `tests/api/documentService.test.ts`

- [ ] **Step 1: Extend service repository mock type**

In `tests/api/documentService.test.ts`, extend `AtomicDocumentRepoMock` and `createMocks()` with these methods:

```ts
listAccountEntriesForDocument: ReturnType<typeof vi.fn>;
listLoanEntriesForDocument: ReturnType<typeof vi.fn>;
listLotMovementsForDocument: ReturnType<typeof vi.fn>;
listLotsCreatedByDocument: ReturnType<typeof vi.fn>;
listPendingCostMatchesForDocument: ReturnType<typeof vi.fn>;
listLotsByIds: ReturnType<typeof vi.fn>;
listLaterMovementLotIds: ReturnType<typeof vi.fn>;
```

Default mock implementations:

```ts
listAccountEntriesForDocument: vi.fn(async () => []),
listLoanEntriesForDocument: vi.fn(async () => []),
listLotMovementsForDocument: vi.fn(async () => []),
listLotsCreatedByDocument: vi.fn(async () => []),
listPendingCostMatchesForDocument: vi.fn(async () => []),
listLotsByIds: vi.fn(async () => []),
listLaterMovementLotIds: vi.fn(async () => [])
```

- [ ] **Step 2: Add service reversal tests**

Append these tests to `tests/api/documentService.test.ts`:

```ts
it("approves reversals from original approved account and loan entries", async () => {
  const { repo, service } = createMocks({
    getDocument: vi
      .fn()
      .mockResolvedValueOnce(documentRow({
        id: "doc_rev",
        status: "pending",
        action_type: "reversal",
        original_document_id: "doc_original",
        business_date: "2026-04-25"
      }))
      .mockResolvedValueOnce(documentRow({
        id: "doc_original",
        status: "approved",
        document_type: "loan_out",
        action_type: "normal",
        business_date: "2026-04-20"
      })),
    listAccountEntriesForDocument: vi.fn(async () => [
      { account_id: "acct_usdt_main", currency_code: "USDT", amount_minor: -120000 }
    ]),
    listLoanEntriesForDocument: vi.fn(async () => [
      { borrower_person_id: "person_borrower", currency_code: "USDT", amount_minor: 120000 }
    ])
  });

  await service.approve("doc_rev", "reviewer_1");

  expect(repo.getDocument).toHaveBeenCalledWith("doc_rev");
  expect(repo.getDocument).toHaveBeenCalledWith("doc_original");
  expect(repo.getDocumentLines).not.toHaveBeenCalled();
  expect(repo.approveWithPostings).toHaveBeenCalledWith(expect.objectContaining({
    documentId: "doc_rev",
    period: "2026-04",
    accountEntries: [
      { accountId: "acct_usdt_main", currencyCode: "USDT", amountMinor: 120000, entryDate: "2026-04-25" }
    ],
    loanEntries: [
      { borrowerPersonId: "person_borrower", currencyCode: "USDT", amountMinor: -120000, entryDate: "2026-04-25" }
    ],
    lotCreations: [],
    lotUpdates: [],
    lotMovements: []
  }));
});

it("approves safe exchange reversals with fifo restoration effects", async () => {
  const { repo, service } = createMocks({
    getDocument: vi
      .fn()
      .mockResolvedValueOnce(documentRow({
        id: "doc_rev",
        status: "pending",
        action_type: "reversal",
        original_document_id: "doc_fx",
        business_date: "2026-04-25"
      }))
      .mockResolvedValueOnce(documentRow({
        id: "doc_fx",
        status: "approved",
        document_type: "exchange",
        action_type: "normal"
      })),
    listAccountEntriesForDocument: vi.fn(async () => [
      { account_id: "acct_usdt_main", currency_code: "USDT", amount_minor: -100000 },
      { account_id: "acct_aed_reserve", currency_code: "AED", amount_minor: 367000 }
    ]),
    listLotMovementsForDocument: vi.fn(async () => [
      {
        id: "move_fx",
        lot_id: "lot_fx",
        movement_type: "exchange_in",
        from_account_id: null,
        to_account_id: "acct_aed_reserve",
        from_person_id: null,
        to_person_id: null,
        amount_minor: 367000,
        usdt_cost_minor: 100000,
        created_at: "2026-04-24T10:00:00.000Z"
      }
    ]),
    listLotsCreatedByDocument: vi.fn(async () => [
      {
        id: "lot_fx",
        original_amount_minor: 367000,
        remaining_amount_minor: 367000,
        original_usdt_cost_minor: 100000,
        remaining_usdt_cost_minor: 100000,
        source_document_id: "doc_fx",
        current_account_id: "acct_aed_reserve",
        current_person_id: null
      }
    ])
  });

  await service.approve("doc_rev", "reviewer_1");

  expect(repo.listLaterMovementLotIds).toHaveBeenCalledWith({ lotIds: ["lot_fx"], originalDocumentId: "doc_fx" });
  expect(repo.approveWithPostings).toHaveBeenCalledWith(expect.objectContaining({
    accountEntries: [
      { accountId: "acct_usdt_main", currencyCode: "USDT", amountMinor: 100000, entryDate: "2026-04-25" },
      { accountId: "acct_aed_reserve", currencyCode: "AED", amountMinor: -367000, entryDate: "2026-04-25" }
    ],
    lotUpdates: [
      {
        lotId: "lot_fx",
        amountDeltaMinor: -367000,
        usdtCostDeltaMinor: -100000,
        expectedRemainingAmountMinor: 367000,
        expectedRemainingUsdtCostMinor: 100000
      }
    ],
    lotMovements: [
      expect.objectContaining({ lotId: "lot_fx", movementType: "fifo_reversal" })
    ]
  }));
});

it("rejects fifo reversals when later lot movements exist", async () => {
  const { repo, service } = createMocks({
    getDocument: vi
      .fn()
      .mockResolvedValueOnce(documentRow({
        id: "doc_rev",
        status: "pending",
        action_type: "reversal",
        original_document_id: "doc_transfer"
      }))
      .mockResolvedValueOnce(documentRow({
        id: "doc_transfer",
        status: "approved",
        document_type: "account_transfer",
        action_type: "normal"
      })),
    listAccountEntriesForDocument: vi.fn(async () => [
      { account_id: "acct_aed_reserve", currency_code: "AED", amount_minor: -50000 },
      { account_id: "acct_aed_bank", currency_code: "AED", amount_minor: 50000 }
    ]),
    listLotMovementsForDocument: vi.fn(async () => [
      {
        id: "move_transfer",
        lot_id: "lot_source",
        movement_type: "account_transfer",
        from_account_id: "acct_aed_reserve",
        to_account_id: "acct_aed_bank",
        from_person_id: null,
        to_person_id: null,
        amount_minor: 50000,
        usdt_cost_minor: 13650,
        created_at: "2026-04-24T10:00:00.000Z"
      }
    ]),
    listLaterMovementLotIds: vi.fn(async () => [{ lot_id: "lot_source" }])
  });

  await expect(service.approve("doc_rev", "reviewer_1")).rejects.toThrow(
    "Complex FIFO reversal requires manual review: affected lots have later movements"
  );
  expect(repo.approveWithPostings).not.toHaveBeenCalled();
});

it("rejects reversals when the original document is not approved", async () => {
  const { repo, service } = createMocks({
    getDocument: vi
      .fn()
      .mockResolvedValueOnce(documentRow({
        id: "doc_rev",
        status: "pending",
        action_type: "reversal",
        original_document_id: "doc_original"
      }))
      .mockResolvedValueOnce(documentRow({ id: "doc_original", status: "pending" }))
  });

  await expect(service.approve("doc_rev", "reviewer_1")).rejects.toThrow("Original document must be approved before reversal");
  expect(repo.approveWithPostings).not.toHaveBeenCalled();
});
```

- [ ] **Step 3: Run failing service tests**

Run:

```bash
npm run test -- tests/api/documentService.test.ts
```

Expected: FAIL because service reversal orchestration does not exist.

- [ ] **Step 4: Extend service repository contract**

In `src/services/documentService.ts`, extend `DocumentWorkflowRepository` with:

```ts
  | "listAccountEntriesForDocument"
  | "listLoanEntriesForDocument"
  | "listLotMovementsForDocument"
  | "listLotsCreatedByDocument"
  | "listPendingCostMatchesForDocument"
  | "listLotsByIds"
  | "listLaterMovementLotIds"
```

- [ ] **Step 5: Import reversal helpers**

Add imports:

```ts
import { planSafeFifoReversalEffects } from "../domain/fifoReversal";
import { entriesForReversalDocument } from "../domain/reversalPosting";
```

- [ ] **Step 6: Route reversal approvals separately**

In `approve()` after the period lock check, before `getDocumentLines(id)`, add:

```ts
if (document.action_type === "reversal") {
  await this.approveReversal(document, reviewer, approvalPeriod);
  return;
}
```

- [ ] **Step 7: Add `approveReversal()`**

Add this private method to `DocumentService`:

```ts
private async approveReversal(document: DocumentDetailRow, reviewer: string, approvalPeriod: string) {
  const originalDocumentId = document.original_document_id?.trim() ?? "";
  if (!originalDocumentId) {
    throw new Error("originalDocumentId is required for reversal approval");
  }

  const original = await this.requireDocument(originalDocumentId);
  if (original.status !== "approved") {
    throw new Error("Original document must be approved before reversal");
  }

  const [originalAccountEntries, originalLoanEntries] = await Promise.all([
    this.documents.listAccountEntriesForDocument(originalDocumentId),
    this.documents.listLoanEntriesForDocument(originalDocumentId)
  ]);

  const posting = entriesForReversalDocument({
    reversalDate: document.business_date,
    originalAccountEntries: originalAccountEntries.map((entry) => ({
      accountId: entry.account_id,
      currencyCode: entry.currency_code,
      amountMinor: entry.amount_minor
    })),
    originalLoanEntries: originalLoanEntries.map((entry) => ({
      borrowerPersonId: entry.borrower_person_id,
      currencyCode: entry.currency_code,
      amountMinor: entry.amount_minor
    }))
  });

  const fifoEffects = await this.planFifoReversalEffects(document.id, original, document.business_date);
  const auditLogStatement = this.auditLogs.prepareRecordWhen(
    {
      actor: reviewer,
      action: "document.approve",
      entityType: "document",
      entityId: document.id,
      before: { status: document.status },
      after: { status: "approved", originalDocumentId }
    },
    {
      sql: "EXISTS (SELECT 1 FROM documents WHERE id = ? AND status = 'pending' AND NOT EXISTS (SELECT 1 FROM period_locks WHERE period = ?))",
      bindings: [document.id, approvalPeriod]
    }
  );

  await this.documents.approveWithPostings({
    documentId: document.id,
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
}
```

- [ ] **Step 8: Add `planFifoReversalEffects()` service helper**

Add this private method:

```ts
private async planFifoReversalEffects(reversalDocumentId: string, original: DocumentDetailRow, reversalDate: string) {
  if (!isSingleLineFifoDocumentType(original.document_type)) {
    return emptyFifoPostingEffects();
  }

  const [originalMovements, createdLots, pendingCosts] = await Promise.all([
    this.documents.listLotMovementsForDocument(original.id),
    this.documents.listLotsCreatedByDocument(original.id),
    this.documents.listPendingCostMatchesForDocument(original.id)
  ]);
  const movementLotIds = originalMovements.map((movement) => movement.lot_id);
  const createdLotIds = createdLots.map((lot) => lot.id);
  const lotIds = uniqueText([...movementLotIds, ...createdLotIds]);
  const [movementLots, laterMovementLotIds] = await Promise.all([
    this.documents.listLotsByIds(lotIds),
    this.documents.listLaterMovementLotIds({ lotIds, originalDocumentId: original.id })
  ]);

  return planSafeFifoReversalEffects({
    reversalDocumentId,
    originalDocumentId: original.id,
    originalDocumentType: original.document_type,
    reversalDate,
    originalMovements: originalMovements.map((movement) => ({
      id: movement.id,
      lotId: movement.lot_id,
      movementType: movement.movement_type as never,
      fromAccountId: movement.from_account_id,
      toAccountId: movement.to_account_id,
      fromPersonId: movement.from_person_id,
      toPersonId: movement.to_person_id,
      amountMinor: movement.amount_minor,
      usdtCostMinor: movement.usdt_cost_minor,
      createdAt: movement.created_at
    })),
    lots: [...movementLots, ...createdLots].map((lot) => ({
      id: lot.id,
      originalAmountMinor: lot.original_amount_minor,
      remainingAmountMinor: lot.remaining_amount_minor,
      originalUsdtCostMinor: lot.original_usdt_cost_minor,
      remainingUsdtCostMinor: lot.remaining_usdt_cost_minor,
      currentAccountId: lot.current_account_id,
      currentPersonId: lot.current_person_id,
      sourceDocumentId: lot.source_document_id
    })),
    pendingCosts: pendingCosts.map((pendingCost) => ({
      id: pendingCost.id,
      remainingAmountMinor: pendingCost.remaining_amount_minor
    })),
    laterMovementLotIds: laterMovementLotIds.map((row) => row.lot_id)
  });
}
```

Add helper:

```ts
function uniqueText(values: string[]) {
  return [...new Set(values.filter((value) => value.trim()))];
}
```

- [ ] **Step 9: Verify service tests pass**

Run:

```bash
npm run test -- tests/api/documentService.test.ts
```

Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/services/documentService.ts tests/api/documentService.test.ts
git commit -m "feat: approve safe reversal documents"
```

## Task 5: API Coverage For Reversal Approval

**Files:**
- Modify: `tests/api/documents.test.ts`

- [ ] **Step 1: Extend the API test DB mock with queued `all()` results**

In `tests/api/documents.test.ts`, change the `mockEnv()` options type from:

```ts
    allResults?: unknown[];
```

to:

```ts
    allResults?: unknown[];
    allResultsQueue?: unknown[][];
```

Then change the statement `all` mock from:

```ts
          all: async () => ({ success: true, results: options.allResults ?? [] }),
```

to:

```ts
          all: async () => ({ success: true, results: options.allResultsQueue?.shift() ?? options.allResults ?? [] }),
```

This keeps existing tests working while allowing one API approval flow to return different rows for account entries, loan entries, lot movements, lots, and pending costs.

- [ ] **Step 2: Add an API reversal approval test**

Append this test near the existing approval route test:

```ts
it("routes reversal approval requests using original posting entries", async () => {
  const batchCalls: PreparedMock[][] = [];
  const response = await route(
    new Request("https://ledger.test/api/documents/doc_rev/approve", {
      method: "POST",
      body: JSON.stringify({ reviewer: "reviewer_1" })
    }),
    mockEnv({
      firstResults: [
        documentRow({
          id: "doc_rev",
          status: "pending",
          action_type: "reversal",
          original_document_id: "doc_original",
          business_date: "2026-04-25"
        }),
        null,
        documentRow({
          id: "doc_original",
          status: "approved",
          document_type: "project_income",
          action_type: "normal",
          business_date: "2026-04-24"
        })
      ],
      allResultsQueue: [
        [{ account_id: "acct_usdt", currency_code: "USDT", amount_minor: 10000 }],
        []
      ],
      onBatch: (statements) => batchCalls.push(statements)
    })
  );

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ data: { id: "doc_rev", status: "approved" } });

  const accountEntryStatement = batchCalls[0].find((statement) =>
    statement.sql.replace(/\s+/g, " ").toLowerCase().includes("insert into account_entries")
  );
  expect(accountEntryStatement?.bindings).toEqual([
    expect.stringMatching(/^acct_entry_/),
    "doc_rev",
    "acct_usdt",
    "USDT",
    -10000,
    "2026-04-25",
    expect.any(String),
    "doc_rev",
    "2026-04"
  ]);
});
```

- [ ] **Step 3: Run API tests**

Run:

```bash
npm run test -- tests/api/documents.test.ts
```

Expected: PASS after Task 4 is complete.

- [ ] **Step 4: Commit**

```bash
git add tests/api/documents.test.ts
git commit -m "test: cover reversal approval api"
```

## Task 6: End-To-End Verification

**Files:**
- No planned source edits.

- [ ] **Step 1: Run automated verification**

Run:

```bash
npm run test
npm run build
npx tsc --noEmit
npm run db:migrate:local
git diff --check
```

Expected:

- Vitest passes.
- Vite build passes.
- TypeScript emits no errors.
- Local D1 migrations report no pending migrations or apply cleanly.
- `git diff --check` reports no whitespace errors.

- [ ] **Step 2: Browser/API smoke for simple reversals**

Using `http://127.0.0.1:8787/`, create, submit, and approve:

1. A normal `exchange` document.
2. A `reversal` document linked to that exchange.

Expected:

- Account balances return to their pre-exchange values for the reversed amounts.
- The exchange-created lot is closed.
- FIFO movement report shows `fifo_reversal`.

- [ ] **Step 3: Browser/API smoke for complex reversal rejection**

Create, submit, and approve:

1. A normal `exchange`.
2. A normal `account_transfer` consuming that exchange lot.
3. A reversal linked to the exchange.

Expected:

- Reversal approval fails with `Complex FIFO reversal requires manual review: affected lots have later movements`.
- No reversal account entries or lot updates are written.

- [ ] **Step 4: Final review**

Dispatch a final read-only review over the implementation range. The reviewer should verify:

- Reversal postings are source-derived.
- FIFO safe subset matches this plan.
- Complex reversals remain rejected.
- Excluded features remain excluded.

## Self-Review

- Spec coverage: This plan covers formal spec sections `7.11 冲正和修正` and `8.7 冲正下的 FIFO` for the safe, auditable subset.
- Planned gaps: Complex reversal with downstream lot consumption, pending-cost restoration, lock-accounting UX, role permissions, and manual high-risk adjustments remain excluded by design.
- Type consistency: New repository rows map snake_case database fields into domain camelCase inputs inside `DocumentService`. `approveWithPostings()` continues to receive the existing `FifoPostingEffects` shape.
- Execution mode: Use Subagent-Driven execution with one implementer per task and two-stage review after each task.
