# Document Transfer And Petty Cash Return Closure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the remaining FIFO-related normal document gaps by supporting account transfers and petty-cash returns as approved, auditable postings.

**Architecture:** Keep approved source documents as the only write source. Extend the existing posting engine for account-entry effects, extend `fifoEffects` for pure lot-transfer effects, and keep approval atomic through `DocumentRepository.approveWithPostings()`. Report views remain read-only and should show the new lot movements automatically through existing FIFO movement reports.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, Cloudflare Workers, Cloudflare D1, Wrangler.

---

## Scope Check

This plan completes the normal posting behavior for two document types that already exist in the UI and formal spec:

1. `account_transfer`
   - Same-currency transfer from `accountId` to `counterpartyAccountId`.
   - Creates account entries: source decreases, target increases.
   - For non-USDT currencies, moves FIFO lots from source account to target account.
   - Does not confirm income or expense.
2. `petty_cash_return`
   - Staff returns unused petty cash from `accountId` to `counterpartyAccountId`.
   - Creates account entries: staff petty-cash account decreases, company account increases.
   - Moves FIFO lots from staff/person back to company account.
   - Does not match pending costs and does not confirm expense.

Excluded from this plan:

1. Transfer fees. Fees should be a separate expense/reimbursement document until an explicit fee line model exists.
2. `loan_writeoff`. This belongs to the loan-closure phase because it must also feed expense/loss reports.
3. `manual_adjustment`. This is high-risk and needs role controls, reason enforcement, and a dedicated audit plan.
4. FIFO reversal/restoration. This needs a separate safety plan because complex reversals depend on downstream lot consumption.
5. Permissions, Cloudflare Access, attachments, exports, backups, and lock-accounting UX.

## Line Semantics

The existing single main-line shape is reused.

| Document type | `accountId` | `counterpartyAccountId` | `personId` | `currencyCode` | `amountMinor` |
| --- | --- | --- | --- | --- | --- |
| `account_transfer` | source account | target account | null | transfer currency | transfer amount |
| `petty_cash_return` | staff petty-cash account | company receiving account | staff person | return currency | return amount |

`account_transfer` should only use company/account-level lots. `petty_cash_return` should use staff/person lots.

## File Structure

- Modify: `src/domain/posting.ts`
  - Add normal posting rules for `account_transfer` and `petty_cash_return`.
- Modify: `src/domain/fifoEffects.ts`
  - Add pure FIFO effect planners for account transfer and petty-cash return.
  - Add lot movement types `account_transfer` and `petty_cash_return`.
- Modify: `src/services/documentService.ts`
  - Include the new document types in single-line FIFO checks.
  - Plan FIFO effects during approval for non-USDT transfers and petty-cash returns.
- Modify: `src/repositories/documentRepository.ts`
  - No schema change expected; existing lot creation/update/movement atomic batch support should be reused.
- Modify: `src/app/App.tsx`
  - Replace stale `Phase 1 MVP` label with a formal-system beta label.
- Test: `tests/domain/posting.test.ts`
- Test: `tests/domain/fifoEffects.test.ts`
- Test: `tests/api/documentService.test.ts`
- Test: `tests/api/documentRepository.test.ts`
- Test: browser smoke on `http://127.0.0.1:8787/`

## Task 1: Domain Posting Rules

**Files:**
- Modify: `src/domain/posting.ts`
- Test: `tests/domain/posting.test.ts`

- [ ] **Step 1: Replace the unsupported account-transfer test**

Replace the current `throws for unsupported document types` case in `tests/domain/posting.test.ts` with:

```ts
it("posts account transfer as source out and target in", () => {
  expect(
    entriesForApprovedDocument({
      id: "doc_transfer",
      documentType: "account_transfer",
      actionType: "normal",
      businessDate: "2026-04-24",
      lines: [
        {
          accountId: "acct_aed_reserve",
          counterpartyAccountId: "acct_aed_bank",
          currencyCode: "AED",
          amountMinor: 50000
        }
      ]
    })
  ).toEqual({
    accountEntries: [
      { accountId: "acct_aed_reserve", currencyCode: "AED", amountMinor: -50000, entryDate: "2026-04-24" },
      { accountId: "acct_aed_bank", currencyCode: "AED", amountMinor: 50000, entryDate: "2026-04-24" }
    ],
    loanEntries: []
  });
});
```

- [ ] **Step 2: Add petty-cash-return posting tests**

Append these tests near the existing petty-cash posting tests:

```ts
it("posts petty cash return as staff out and reserve in", () => {
  expect(
    entriesForApprovedDocument({
      id: "doc_return",
      documentType: "petty_cash_return",
      actionType: "normal",
      businessDate: "2026-04-24",
      lines: [
        {
          accountId: "acct_petty_bob",
          counterpartyAccountId: "acct_aed_reserve",
          personId: "person_bob",
          currencyCode: "AED",
          amountMinor: 80000
        }
      ]
    })
  ).toEqual({
    accountEntries: [
      { accountId: "acct_petty_bob", currencyCode: "AED", amountMinor: -80000, entryDate: "2026-04-24" },
      { accountId: "acct_aed_reserve", currencyCode: "AED", amountMinor: 80000, entryDate: "2026-04-24" }
    ],
    loanEntries: []
  });
});

it("requires target account for account transfers and petty cash returns", () => {
  expect(() =>
    entriesForApprovedDocument({
      id: "doc_transfer",
      documentType: "account_transfer",
      actionType: "normal",
      businessDate: "2026-04-24",
      lines: [{ accountId: "acct_aed_reserve", currencyCode: "AED", amountMinor: 50000 }]
    })
  ).toThrow("line counterpartyAccountId is required for account_transfer");

  expect(() =>
    entriesForApprovedDocument({
      id: "doc_return",
      documentType: "petty_cash_return",
      actionType: "normal",
      businessDate: "2026-04-24",
      lines: [{ accountId: "acct_petty_bob", personId: "person_bob", currencyCode: "AED", amountMinor: 80000 }]
    })
  ).toThrow("line counterpartyAccountId is required for petty_cash_return");
});

it("requires person for petty cash returns", () => {
  expect(() =>
    entriesForApprovedDocument({
      id: "doc_return",
      documentType: "petty_cash_return",
      actionType: "normal",
      businessDate: "2026-04-24",
      lines: [
        {
          accountId: "acct_petty_bob",
          counterpartyAccountId: "acct_aed_reserve",
          currencyCode: "AED",
          amountMinor: 80000
        }
      ]
    })
  ).toThrow("line personId is required for petty_cash_return");
});
```

- [ ] **Step 3: Run the focused posting tests**

Run:

```bash
npm run test -- tests/domain/posting.test.ts
```

Expected: FAIL because the two document types are not yet supported by `entriesForApprovedDocument()`.

- [ ] **Step 4: Implement minimal posting support**

In `src/domain/posting.ts`, add `account_transfer` and `petty_cash_return` to the supported-document guard. Then add these branches inside the line loop:

```ts
if (document.documentType === "account_transfer") {
  const targetAccountId = requireOptionalText(line.counterpartyAccountId, "line counterpartyAccountId for account_transfer");
  accountEntries.push({ accountId, currencyCode, amountMinor: -line.amountMinor, entryDate: document.businessDate });
  accountEntries.push({ accountId: targetAccountId, currencyCode, amountMinor: line.amountMinor, entryDate: document.businessDate });
}

if (document.documentType === "petty_cash_return") {
  const targetAccountId = requireOptionalText(line.counterpartyAccountId, "line counterpartyAccountId for petty_cash_return");
  requireOptionalText(line.personId, "line personId for petty_cash_return");
  accountEntries.push({ accountId, currencyCode, amountMinor: -line.amountMinor, entryDate: document.businessDate });
  accountEntries.push({ accountId: targetAccountId, currencyCode, amountMinor: line.amountMinor, entryDate: document.businessDate });
}
```

Keep `supportsReversalPosting()` unchanged in this task. FIFO reversal remains out of scope.

- [ ] **Step 5: Verify posting tests pass**

Run:

```bash
npm run test -- tests/domain/posting.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/domain/posting.ts tests/domain/posting.test.ts
git commit -m "feat: post transfer and petty cash return documents"
```

## Task 2: FIFO Effects For Transfers And Returns

**Files:**
- Modify: `src/domain/fifoEffects.ts`
- Test: `tests/domain/fifoEffects.test.ts`

- [ ] **Step 1: Add account-transfer FIFO test**

Append this test to `tests/domain/fifoEffects.test.ts`:

```ts
it("plans account transfer by moving source lots to target account lots", () => {
  const result = planAccountTransferEffects({
    documentId: "doc_transfer",
    fromAccountId: "acct_aed_reserve",
    toAccountId: "acct_aed_bank",
    currencyCode: "AED",
    amountMinor: 200000,
    businessDate: "2026-04-24",
    sourceLots: reserveLots
  });

  expect(result.lotUpdates).toEqual([
    {
      lotId: "lot_a",
      amountDeltaMinor: -150000,
      usdtCostDeltaMinor: -41000,
      expectedRemainingAmountMinor: 150000,
      expectedRemainingUsdtCostMinor: 41000
    },
    {
      lotId: "lot_b",
      amountDeltaMinor: -50000,
      usdtCostDeltaMinor: -13650,
      expectedRemainingAmountMinor: 100000,
      expectedRemainingUsdtCostMinor: 27300
    }
  ]);
  expect(result.lotCreations).toEqual([
    {
      clientLotId: "doc_transfer:transfer:1",
      currencyCode: "AED",
      originalAmountMinor: 150000,
      remainingAmountMinor: 150000,
      originalUsdtCostMinor: 41000,
      remainingUsdtCostMinor: 41000,
      sourceDocumentId: "doc_transfer",
      currentAccountId: "acct_aed_bank",
      currentPersonId: null,
      lotDate: "2026-04-24"
    },
    {
      clientLotId: "doc_transfer:transfer:2",
      currencyCode: "AED",
      originalAmountMinor: 50000,
      remainingAmountMinor: 50000,
      originalUsdtCostMinor: 13650,
      remainingUsdtCostMinor: 13650,
      sourceDocumentId: "doc_transfer",
      currentAccountId: "acct_aed_bank",
      currentPersonId: null,
      lotDate: "2026-04-24"
    }
  ]);
  expect(result.lotMovements).toEqual([
    {
      lotId: "lot_a",
      movementType: "account_transfer",
      fromAccountId: "acct_aed_reserve",
      toAccountId: "acct_aed_bank",
      fromPersonId: null,
      toPersonId: null,
      amountMinor: 150000,
      usdtCostMinor: 41000,
      movementDate: "2026-04-24"
    },
    {
      lotId: "lot_b",
      movementType: "account_transfer",
      fromAccountId: "acct_aed_reserve",
      toAccountId: "acct_aed_bank",
      fromPersonId: null,
      toPersonId: null,
      amountMinor: 50000,
      usdtCostMinor: 13650,
      movementDate: "2026-04-24"
    }
  ]);
});
```

- [ ] **Step 2: Add petty-cash-return FIFO test**

Append:

```ts
it("plans petty cash return by moving staff lots back to reserve lots", () => {
  const staffLots = [
    {
      id: "staff_lot_a",
      currencyCode: "AED",
      remainingAmountMinor: 90000,
      remainingUsdtCostMinor: 24570,
      lotDate: "2026-04-23"
    }
  ];

  const result = planPettyCashReturnEffects({
    documentId: "doc_return",
    fromAccountId: "acct_petty_bob",
    toAccountId: "acct_aed_reserve",
    personId: "person_bob",
    currencyCode: "AED",
    amountMinor: 80000,
    businessDate: "2026-04-24",
    sourceLots: staffLots
  });

  expect(result.lotUpdates).toEqual([
    {
      lotId: "staff_lot_a",
      amountDeltaMinor: -80000,
      usdtCostDeltaMinor: -21840,
      expectedRemainingAmountMinor: 90000,
      expectedRemainingUsdtCostMinor: 24570
    }
  ]);
  expect(result.lotCreations).toEqual([
    {
      clientLotId: "doc_return:return:1",
      currencyCode: "AED",
      originalAmountMinor: 80000,
      remainingAmountMinor: 80000,
      originalUsdtCostMinor: 21840,
      remainingUsdtCostMinor: 21840,
      sourceDocumentId: "doc_return",
      currentAccountId: "acct_aed_reserve",
      currentPersonId: null,
      lotDate: "2026-04-24"
    }
  ]);
  expect(result.lotMovements).toEqual([
    {
      lotId: "staff_lot_a",
      movementType: "petty_cash_return",
      fromAccountId: "acct_petty_bob",
      toAccountId: "acct_aed_reserve",
      fromPersonId: "person_bob",
      toPersonId: null,
      amountMinor: 80000,
      usdtCostMinor: 21840,
      movementDate: "2026-04-24"
    }
  ]);
});
```

- [ ] **Step 3: Import the new planners**

At the top of `tests/domain/fifoEffects.test.ts`, extend the import:

```ts
import {
  planAccountTransferEffects,
  planExchangeLotCreation,
  planPettyCashIssueEffects,
  planPettyCashReimbursementEffects,
  planPettyCashReturnEffects
} from "../../src/domain/fifoEffects";
```

- [ ] **Step 4: Run focused FIFO tests**

Run:

```bash
npm run test -- tests/domain/fifoEffects.test.ts
```

Expected: FAIL because the new planner exports do not exist yet.

- [ ] **Step 5: Implement reusable lot transfer planner**

In `src/domain/fifoEffects.ts`, update the movement type and add inputs:

```ts
export type LotMovementType =
  | "exchange_in"
  | "account_transfer"
  | "petty_cash_issue"
  | "petty_cash_return"
  | "petty_cash_reimbursement"
  | "pending_cost_match";

export interface AccountTransferEffectsInput {
  documentId: string;
  fromAccountId: string;
  toAccountId: string;
  currencyCode: string;
  amountMinor: number;
  businessDate: string;
  sourceLots: Lot[];
}

export interface PettyCashReturnEffectsInput extends AccountTransferEffectsInput {
  personId: string;
}
```

Add these exports after `planExchangeLotCreation()`:

```ts
export function planAccountTransferEffects(input: AccountTransferEffectsInput): FifoPostingEffects {
  return planLotTransfer({
    documentId: input.documentId,
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    fromPersonId: null,
    toPersonId: null,
    currencyCode: input.currencyCode,
    amountMinor: input.amountMinor,
    businessDate: input.businessDate,
    sourceLots: input.sourceLots,
    movementType: "account_transfer",
    clientLotPrefix: "transfer"
  });
}

export function planPettyCashReturnEffects(input: PettyCashReturnEffectsInput): FifoPostingEffects {
  const personId = requireNonEmpty(input.personId, "personId");
  return planLotTransfer({
    documentId: input.documentId,
    fromAccountId: input.fromAccountId,
    toAccountId: input.toAccountId,
    fromPersonId: personId,
    toPersonId: null,
    currencyCode: input.currencyCode,
    amountMinor: input.amountMinor,
    businessDate: input.businessDate,
    sourceLots: input.sourceLots,
    movementType: "petty_cash_return",
    clientLotPrefix: "return"
  });
}
```

Add the helper near `staffLotCreation()`:

```ts
function planLotTransfer(input: {
  documentId: string;
  fromAccountId: string;
  toAccountId: string;
  fromPersonId: string | null;
  toPersonId: string | null;
  currencyCode: string;
  amountMinor: number;
  businessDate: string;
  sourceLots: Lot[];
  movementType: LotMovementType;
  clientLotPrefix: string;
}): FifoPostingEffects {
  const documentId = requireNonEmpty(input.documentId, "documentId");
  const fromAccountId = requireNonEmpty(input.fromAccountId, "fromAccountId");
  const toAccountId = requireNonEmpty(input.toAccountId, "toAccountId");
  const currencyCode = requireNonEmpty(input.currencyCode, "currencyCode");
  const businessDate = requireNonEmpty(input.businessDate, "businessDate");
  const allocationResult = allocateFifo(input.sourceLots, input.amountMinor, currencyCode);

  return {
    lotCreations: allocationResult.allocations.map((allocation, index) =>
      transferredLotCreation(
        allocation,
        `${documentId}:${input.clientLotPrefix}:${index + 1}`,
        documentId,
        toAccountId,
        input.toPersonId,
        currencyCode,
        businessDate
      )
    ),
    lotUpdates: lotUpdatesForAllocations(allocationResult.allocations),
    lotMovements: allocationResult.allocations.map((allocation) => ({
      lotId: allocation.lotId,
      movementType: input.movementType,
      fromAccountId,
      toAccountId,
      fromPersonId: input.fromPersonId,
      toPersonId: input.toPersonId,
      amountMinor: allocation.amountMinor,
      usdtCostMinor: allocation.usdtCostMinor,
      movementDate: businessDate
    })),
    pendingCostCreations: [],
    pendingCostUpdates: []
  };
}

function transferredLotCreation(
  allocation: LotAllocation,
  clientLotId: string,
  documentId: string,
  accountId: string,
  personId: string | null,
  currencyCode: string,
  lotDate: string
): LotCreationEffect {
  return {
    clientLotId,
    currencyCode,
    originalAmountMinor: allocation.amountMinor,
    remainingAmountMinor: allocation.amountMinor,
    originalUsdtCostMinor: allocation.usdtCostMinor,
    remainingUsdtCostMinor: allocation.usdtCostMinor,
    sourceDocumentId: documentId,
    currentAccountId: accountId,
    currentPersonId: personId,
    lotDate
  };
}
```

- [ ] **Step 6: Verify FIFO tests pass**

Run:

```bash
npm run test -- tests/domain/fifoEffects.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/domain/fifoEffects.ts tests/domain/fifoEffects.test.ts
git commit -m "feat: plan transfer and return fifo effects"
```

## Task 3: Approval Orchestration

**Files:**
- Modify: `src/services/documentService.ts`
- Test: `tests/api/documentService.test.ts`

- [ ] **Step 1: Add service tests for account transfer and petty-cash return**

Append these tests to `tests/api/documentService.test.ts`:

```ts
it("approves non-USDT account transfers with FIFO effects", async () => {
  const { repo, service } = createMocks({
    getDocument: vi.fn(async () => documentRow({ status: "pending", document_type: "account_transfer" })),
    getDocumentLines: vi.fn(async () => [
      lineRow({
        account_id: "acct_aed_reserve",
        counterparty_account_id: "acct_aed_bank",
        currency_code: "AED",
        amount_minor: 50000
      })
    ]),
    listOpenLotsForAccount: vi.fn(async () => [
      lotRow({ id: "lot_a", remaining_amount_minor: 100000, remaining_usdt_cost_minor: 27300 })
    ])
  });

  await service.approve("doc_1", "reviewer_1");

  expect(repo.listOpenLotsForAccount).toHaveBeenCalledWith({
    accountId: "acct_aed_reserve",
    personId: null,
    currencyCode: "AED"
  });
  expect(repo.approveWithPostings).toHaveBeenCalledWith(
    expect.objectContaining({
      accountEntries: [
        { accountId: "acct_aed_reserve", currencyCode: "AED", amountMinor: -50000, entryDate: "2026-04-24" },
        { accountId: "acct_aed_bank", currencyCode: "AED", amountMinor: 50000, entryDate: "2026-04-24" }
      ],
      lotCreations: [
        expect.objectContaining({
          clientLotId: "doc_1:transfer:1",
          currentAccountId: "acct_aed_bank",
          currentPersonId: null,
          remainingAmountMinor: 50000
        })
      ],
      lotMovements: [
        expect.objectContaining({
          movementType: "account_transfer",
          fromAccountId: "acct_aed_reserve",
          toAccountId: "acct_aed_bank",
          amountMinor: 50000
        })
      ]
    })
  );
});

it("approves USDT account transfers without FIFO effects", async () => {
  const { repo, service } = createMocks({
    getDocument: vi.fn(async () => documentRow({ status: "pending", document_type: "account_transfer" })),
    getDocumentLines: vi.fn(async () => [
      lineRow({
        account_id: "acct_usdt_main",
        counterparty_account_id: "acct_usdt_backup",
        currency_code: "USDT",
        amount_minor: 50000
      })
    ])
  });

  await service.approve("doc_1", "reviewer_1");

  expect(repo.listOpenLotsForAccount).not.toHaveBeenCalled();
  expect(repo.approveWithPostings).toHaveBeenCalledWith(
    expect.objectContaining({
      lotCreations: [],
      lotUpdates: [],
      lotMovements: []
    })
  );
});

it("approves petty cash returns with staff FIFO effects", async () => {
  const { repo, service } = createMocks({
    getDocument: vi.fn(async () => documentRow({ status: "pending", document_type: "petty_cash_return" })),
    getDocumentLines: vi.fn(async () => [
      lineRow({
        account_id: "acct_petty_bob",
        counterparty_account_id: "acct_aed_reserve",
        person_id: "person_bob",
        currency_code: "AED",
        amount_minor: 80000
      })
    ]),
    listOpenLotsForAccount: vi.fn(async () => [
      lotRow({ id: "staff_lot_a", remaining_amount_minor: 90000, remaining_usdt_cost_minor: 24570 })
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
      accountEntries: [
        { accountId: "acct_petty_bob", currencyCode: "AED", amountMinor: -80000, entryDate: "2026-04-24" },
        { accountId: "acct_aed_reserve", currencyCode: "AED", amountMinor: 80000, entryDate: "2026-04-24" }
      ],
      lotCreations: [
        expect.objectContaining({
          clientLotId: "doc_1:return:1",
          currentAccountId: "acct_aed_reserve",
          currentPersonId: null,
          remainingAmountMinor: 80000
        })
      ],
      lotMovements: [
        expect.objectContaining({
          movementType: "petty_cash_return",
          fromAccountId: "acct_petty_bob",
          toAccountId: "acct_aed_reserve",
          fromPersonId: "person_bob",
          toPersonId: null,
          amountMinor: 80000
        })
      ]
    })
  );
});
```

- [ ] **Step 2: Run focused service tests**

Run:

```bash
npm run test -- tests/api/documentService.test.ts
```

Expected: FAIL because approval orchestration does not yet plan the new FIFO effects.

- [ ] **Step 3: Import planners in the service**

Update the `fifoEffects` import in `src/services/documentService.ts`:

```ts
import {
  emptyFifoPostingEffects,
  planAccountTransferEffects,
  planExchangeLotCreation,
  planPettyCashIssueEffects,
  planPettyCashReimbursementEffects,
  planPettyCashReturnEffects
} from "../domain/fifoEffects";
```

- [ ] **Step 4: Extend single-line FIFO document guard**

Update `isSingleLineFifoDocumentType()`:

```ts
function isSingleLineFifoDocumentType(documentType: DocumentType) {
  return (
    documentType === "exchange" ||
    documentType === "account_transfer" ||
    documentType === "petty_cash_issue" ||
    documentType === "petty_cash_return" ||
    documentType === "petty_cash_reimbursement"
  );
}
```

- [ ] **Step 5: Add account-transfer planning**

In `planFifoPostingEffects()`, add this branch after `exchange`:

```ts
if (documentType === "account_transfer") {
  const line = requireFirstLine(lines, documentType);
  const currencyCode = requireLineText(line.currency_code, "line currencyCode", documentType);
  if (currencyCode === "USDT") {
    return emptyFifoPostingEffects();
  }

  const fromAccountId = requireLineText(line.account_id, "line accountId", documentType);
  const toAccountId = requireLineText(line.counterparty_account_id, "line counterpartyAccountId", documentType);
  const sourceLots = await this.documents.listOpenLotsForAccount({ accountId: fromAccountId, personId: null, currencyCode });

  return planAccountTransferEffects({
    documentId,
    fromAccountId,
    toAccountId,
    currencyCode,
    amountMinor: requirePositiveSafeInteger(line.amount_minor, "line amountMinor", documentType),
    businessDate,
    sourceLots: sourceLots.map(mapLotRow)
  });
}
```

- [ ] **Step 6: Add petty-cash-return planning**

In `planFifoPostingEffects()`, add this branch before `petty_cash_reimbursement`:

```ts
if (documentType === "petty_cash_return") {
  const line = requireFirstLine(lines, documentType);
  const fromAccountId = requireLineText(line.account_id, "line accountId", documentType);
  const toAccountId = requireLineText(line.counterparty_account_id, "line counterpartyAccountId", documentType);
  const personId = requireLineText(line.person_id, "line personId", documentType);
  const currencyCode = requireLineText(line.currency_code, "line currencyCode", documentType);
  const sourceLots = await this.documents.listOpenLotsForAccount({ accountId: fromAccountId, personId, currencyCode });

  return planPettyCashReturnEffects({
    documentId,
    fromAccountId,
    toAccountId,
    personId,
    currencyCode,
    amountMinor: requirePositiveSafeInteger(line.amount_minor, "line amountMinor", documentType),
    businessDate,
    sourceLots: sourceLots.map(mapLotRow)
  });
}
```

- [ ] **Step 7: Verify service tests pass**

Run:

```bash
npm run test -- tests/api/documentService.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/services/documentService.ts tests/api/documentService.test.ts
git commit -m "feat: approve transfer and return fifo effects"
```

## Task 4: Repository Coverage And UI Label Cleanup

**Files:**
- Modify: `src/app/App.tsx`
- Test: `tests/api/documentRepository.test.ts`

- [ ] **Step 1: Add repository coverage for created-lot movement ID mapping**

Add a repository test that approves a transfer with one lot update, one created target lot, and one movement against the created client lot id. Use the existing `approveWithPostings` test style and assert:

```ts
expect(batchCalls.some((statement) => statement.sql.toLowerCase().includes("insert into lots"))).toBe(true);
expect(batchCalls.some((statement) => statement.sql.toLowerCase().includes("insert into lot_movements"))).toBe(true);
expect(batchCalls.some((statement) => statement.bindings.includes("account_transfer"))).toBe(true);
```

Expected behavior: the movement insert receives the generated database lot id when its effect references a client lot id.

- [ ] **Step 2: Run repository tests**

Run:

```bash
npm run test -- tests/api/documentRepository.test.ts
```

Expected: PASS or a focused failure showing the existing client-lot-id mapping does not cover this shape.

- [ ] **Step 3: Fix repository mapping only if the test exposes a gap**

If the test fails because the created-lot movement id is not mapped, update `approveWithPostings()` so this existing expression is used for all lot movements:

```ts
const lotId = createdLotIds.get(lotMovement.lotId) ?? lotMovement.lotId;
addStatement(this.prepareConditionalLotMovement(input.documentId, input.period, lotMovement, lotId), "write");
```

If the test already passes, no repository implementation change is needed.

- [ ] **Step 4: Replace stale MVP banner**

In `src/app/App.tsx`, replace:

```tsx
<p>Phase 1 MVP</p>
```

with:

```tsx
<p>正式系统 Beta</p>
```

- [ ] **Step 5: Run build-time UI verification**

Run:

```bash
npm run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/App.tsx tests/api/documentRepository.test.ts src/repositories/documentRepository.ts
git commit -m "test: cover transfer lot persistence"
```

If `src/repositories/documentRepository.ts` was unchanged, omit it from `git add`.

## Task 5: End-To-End Verification

**Files:**
- No planned source edits.

- [ ] **Step 1: Run full automated verification**

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
- Local D1 migrations report no pending or apply cleanly.
- `git diff --check` reports no whitespace errors.

- [ ] **Step 2: Browser smoke transfer flow**

In the local app at `http://127.0.0.1:8787/`, create, submit, and approve:

1. Exchange: `1000 USDT -> 3670 AED` into reserve.
2. Account transfer: `500 AED` from reserve to another AED company account.
3. Petty cash issue: `1000 AED` from reserve to Bob petty cash.
4. Petty cash return: `300 AED` from Bob petty cash to reserve.

Expected:

- Account balances reflect each source decrease and target increase.
- FIFO movement report includes `account_transfer` and `petty_cash_return`.
- Lot balance report shows target account lots created with proportional USDT cost.
- No pending cost row is created by petty-cash return.

- [ ] **Step 3: Commit final verification note only if files changed**

No commit is required if Step 1 and Step 2 make no file changes.

## Self-Review

- Spec coverage: This plan covers formal spec sections `7.3 账户转账单`, `7.5 备用金退回单`, and the FIFO transfer parts of `8.3 FIFO 消耗`.
- Known gaps: Transfer fees, loan writeoff, manual adjustment, and FIFO reversal are intentionally left for separate plans because they require extra source-data fields, expense/loss reporting, role controls, or complex downstream-consumption checks.
- Type consistency: The plan uses existing `DocumentType`, `LotMovementType`, `FifoPostingEffects`, `LotCreationEffect`, and `approveWithPostings()` shapes. The new planners mirror existing `planPettyCashIssueEffects()` behavior and reuse the existing repository batch writer.
- Execution mode: Use Subagent-Driven execution. Task ownership can be split as posting domain, FIFO domain, service orchestration, and repository/UI verification.
