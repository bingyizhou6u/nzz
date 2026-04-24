# Formal Document Workflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first formal-system increment: source documents with line items, submit/reject/approve workflow, audit logs, period-lock checks, and approval posting for project income, loan out, and loan repayment.

**Architecture:** Keep the existing Cloudflare Worker + D1 + React architecture. Add a service layer between API handlers and repositories so workflow rules, period-lock checks, audit logging, and posting are not spread across HTTP handlers.

**Tech Stack:** TypeScript, React 19, Vite, Vitest, Cloudflare Workers, Cloudflare D1, Wrangler.

---

## Scope Check

The approved formal system spec covers multiple subsystems: document workflow, master-data governance, FIFO lots, petty-cash negative balance matching, loans, reporting, permissions, lock accounting, audit, attachments, and deployment security. This plan intentionally implements only the first independently shippable subsystem:

```text
正式单据生命周期 + 明细行 + 审核过账基础闭环
```

Separate implementation plans should cover:

1. FIFO lots and exchange/petty-cash cost matching.
2. Full master-data governance and selectors.
3. Formal reporting center.
4. Role permissions and Cloudflare Access identity mapping.
5. Attachments, exports, backups, and R2.

## File Structure

Create or modify these files:

- Create: `migrations/0002_document_workflow_indexes.sql`
  - Add indexes for document list, status queues, line lookup, posting reports, and audit lookup.
- Create: `src/domain/documentWorkflow.ts`
  - Own document status transition rules and period-lock date selection.
- Create: `src/domain/documentLines.ts`
  - Own document-line validation and request normalization.
- Modify: `src/domain/posting.ts`
  - Extend approval posting to support `loan_repayment` in addition to existing `project_income` and `loan_out`.
- Modify: `src/repositories/documentRepository.ts`
  - Add document creation with lines, list/detail queries, status transitions, line reads, and posting writes.
- Create: `src/repositories/auditLogRepository.ts`
  - Insert audit log rows with consistent JSON snapshots.
- Create: `src/services/documentService.ts`
  - Orchestrate create, submit, reject, approve, period-lock checks, posting, and audit logging.
- Modify: `src/api/documents.ts`
  - Support list/detail endpoints and workflow actions.
- Modify: `src/worker/router.ts`
  - Support path parameters for `/api/documents/:id` and `/api/documents/:id/:action`.
- Modify: `src/app/api.ts`
  - Add typed helpers only if needed by the React page.
- Modify: `src/app/pages/DocumentsPage.tsx`
  - Replace single draft form with document list, line-item form, and workflow actions.
- Modify: `src/app/styles.css`
  - Add compact table and form styles for the document workflow.
- Test: `tests/domain/documentWorkflow.test.ts`
- Test: `tests/domain/documentLines.test.ts`
- Test: `tests/domain/posting.test.ts`
- Test: `tests/api/documentRepository.test.ts`
- Test: `tests/api/documents.test.ts`
- Test: `tests/api/documentService.test.ts`
- Test: `src/app/pages/DocumentsPage.test.ts`

## Task 1: Document Workflow Domain Rules

**Files:**
- Create: `src/domain/documentWorkflow.ts`
- Test: `tests/domain/documentWorkflow.test.ts`

- [ ] **Step 1: Write the failing transition tests**

Create `tests/domain/documentWorkflow.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { assertDocumentTransition, getLockCheckDate } from "../../src/domain/documentWorkflow";

describe("documentWorkflow", () => {
  it("allows draft to pending when submitting", () => {
    expect(() => assertDocumentTransition("draft", "pending", "submit")).not.toThrow();
  });

  it("allows pending to approved when approving", () => {
    expect(() => assertDocumentTransition("pending", "approved", "approve")).not.toThrow();
  });

  it("allows pending to rejected when rejecting", () => {
    expect(() => assertDocumentTransition("pending", "rejected", "reject")).not.toThrow();
  });

  it("allows rejected to draft when reopening", () => {
    expect(() => assertDocumentTransition("rejected", "draft", "reopen")).not.toThrow();
  });

  it("rejects approval unless a document is pending", () => {
    expect(() => assertDocumentTransition("draft", "approved", "approve")).toThrow(
      "Only pending documents can be approved"
    );
  });

  it("rejects submit unless a document is draft or rejected", () => {
    expect(() => assertDocumentTransition("approved", "pending", "submit")).toThrow(
      "Only draft or rejected documents can be submitted"
    );
  });

  it("uses business_date as the lock-check date for all current document types", () => {
    expect(getLockCheckDate({ documentType: "project_income", businessDate: "2026-04-24" })).toBe("2026-04-24");
    expect(getLockCheckDate({ documentType: "petty_cash_reimbursement", businessDate: "2026-04-23" })).toBe(
      "2026-04-23"
    );
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- tests/domain/documentWorkflow.test.ts
```

Expected: FAIL because `src/domain/documentWorkflow.ts` does not exist.

- [ ] **Step 3: Add the workflow domain module**

Create `src/domain/documentWorkflow.ts`:

```ts
import type { DocumentStatus, DocumentType } from "./types";

export type DocumentWorkflowAction = "submit" | "approve" | "reject" | "reopen";

export interface LockCheckInput {
  documentType: DocumentType;
  businessDate: string;
}

export function assertDocumentTransition(
  currentStatus: DocumentStatus,
  nextStatus: DocumentStatus,
  action: DocumentWorkflowAction
) {
  if (action === "submit") {
    if ((currentStatus === "draft" || currentStatus === "rejected") && nextStatus === "pending") return;
    throw new Error("Only draft or rejected documents can be submitted");
  }

  if (action === "approve") {
    if (currentStatus === "pending" && nextStatus === "approved") return;
    throw new Error("Only pending documents can be approved");
  }

  if (action === "reject") {
    if (currentStatus === "pending" && nextStatus === "rejected") return;
    throw new Error("Only pending documents can be rejected");
  }

  if (action === "reopen") {
    if (currentStatus === "rejected" && nextStatus === "draft") return;
    throw new Error("Only rejected documents can be reopened");
  }
}

export function getLockCheckDate(input: LockCheckInput) {
  return input.businessDate;
}

export function periodFromDate(dateText: string) {
  return dateText.slice(0, 7);
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npm run test -- tests/domain/documentWorkflow.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/documentWorkflow.ts tests/domain/documentWorkflow.test.ts
git commit -m "feat: add document workflow rules"
```

## Task 2: Document Line Validation

**Files:**
- Create: `src/domain/documentLines.ts`
- Test: `tests/domain/documentLines.test.ts`

- [ ] **Step 1: Write failing line-normalization tests**

Create `tests/domain/documentLines.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { normalizeDocumentLines } from "../../src/domain/documentLines";

describe("normalizeDocumentLines", () => {
  it("normalizes a valid project-income line", () => {
    expect(
      normalizeDocumentLines([
        {
          lineType: "main",
          accountId: " acct_usdt ",
          currencyCode: " usdt ",
          amountMinor: 10000,
          usdtAmountMinor: 10000,
          note: " Merchant income "
        }
      ])
    ).toEqual([
      {
        lineNo: 1,
        lineType: "main",
        accountId: "acct_usdt",
        counterpartyAccountId: null,
        personId: null,
        borrowerPersonId: null,
        currencyCode: "USDT",
        amountMinor: 10000,
        usdtAmountMinor: 10000,
        exchangeRateText: null,
        note: "Merchant income"
      }
    ]);
  });

  it("rejects empty line arrays", () => {
    expect(() => normalizeDocumentLines([])).toThrow("At least one document line is required");
  });

  it("rejects non-positive and unsafe amounts", () => {
    expect(() => normalizeDocumentLines([{ lineType: "main", accountId: "acct_1", currencyCode: "AED", amountMinor: 0 }])).toThrow(
      "line amountMinor must be a positive safe integer"
    );
    expect(() =>
      normalizeDocumentLines([{ lineType: "main", accountId: "acct_1", currencyCode: "AED", amountMinor: 10.5 }])
    ).toThrow("line amountMinor must be a positive safe integer");
  });

  it("requires account and currency on every line", () => {
    expect(() => normalizeDocumentLines([{ lineType: "main", accountId: " ", currencyCode: "AED", amountMinor: 100 }])).toThrow(
      "line accountId is required"
    );
    expect(() =>
      normalizeDocumentLines([{ lineType: "main", accountId: "acct_1", currencyCode: " ", amountMinor: 100 }])
    ).toThrow("line currencyCode is required");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- tests/domain/documentLines.test.ts
```

Expected: FAIL because `src/domain/documentLines.ts` does not exist.

- [ ] **Step 3: Add the line-normalization module**

Create `src/domain/documentLines.ts`:

```ts
export interface RawDocumentLine {
  lineType?: unknown;
  accountId?: unknown;
  counterpartyAccountId?: unknown;
  personId?: unknown;
  borrowerPersonId?: unknown;
  currencyCode?: unknown;
  amountMinor?: unknown;
  usdtAmountMinor?: unknown;
  exchangeRateText?: unknown;
  note?: unknown;
}

export interface NormalizedDocumentLine {
  lineNo: number;
  lineType: string;
  accountId: string;
  counterpartyAccountId: string | null;
  personId: string | null;
  borrowerPersonId: string | null;
  currencyCode: string;
  amountMinor: number;
  usdtAmountMinor: number | null;
  exchangeRateText: string | null;
  note: string | null;
}

export function normalizeDocumentLines(lines: RawDocumentLine[]): NormalizedDocumentLine[] {
  if (!Array.isArray(lines) || lines.length === 0) {
    throw new Error("At least one document line is required");
  }

  return lines.map((line, index) => {
    const lineType = textOrDefault(line.lineType, "main");
    const accountId = requiredText(line.accountId, "line accountId");
    const currencyCode = requiredText(line.currencyCode, "line currencyCode").toUpperCase();
    const amountMinor = positiveSafeInteger(line.amountMinor, "line amountMinor");

    return {
      lineNo: index + 1,
      lineType,
      accountId,
      counterpartyAccountId: optionalText(line.counterpartyAccountId),
      personId: optionalText(line.personId),
      borrowerPersonId: optionalText(line.borrowerPersonId),
      currencyCode,
      amountMinor,
      usdtAmountMinor: optionalSafeInteger(line.usdtAmountMinor, "line usdtAmountMinor"),
      exchangeRateText: optionalText(line.exchangeRateText),
      note: optionalText(line.note)
    };
  });
}

function requiredText(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function optionalText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function textOrDefault(value: unknown, defaultValue: string) {
  if (typeof value !== "string") return defaultValue;
  const trimmed = value.trim();
  return trimmed ? trimmed : defaultValue;
}

function positiveSafeInteger(value: unknown, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new Error(`${label} must be a positive safe integer`);
  }
  return value as number;
}

function optionalSafeInteger(value: unknown, label: string) {
  if (value === undefined || value === null || value === "") return null;
  if (!Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer`);
  }
  return value as number;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npm run test -- tests/domain/documentLines.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/documentLines.ts tests/domain/documentLines.test.ts
git commit -m "feat: validate document lines"
```

## Task 3: Repository Support For Documents With Lines

**Files:**
- Modify: `src/repositories/documentRepository.ts`
- Test: `tests/api/documentRepository.test.ts`

- [ ] **Step 1: Add failing repository tests**

Append these tests to `tests/api/documentRepository.test.ts`:

```ts
it("creates draft documents with lines", async () => {
  const sqlStatements: string[] = [];
  const bindCalls: unknown[][] = [];
  const repo = new DocumentRepository(
    mockDb({
      onSql: (sql) => sqlStatements.push(sql),
      onBind: (values) => bindCalls.push(values)
    })
  );

  const result = await repo.createDraftWithLines({
    documentType: "project_income",
    actionType: "normal",
    businessDate: "2026-04-24",
    period: "2026-04",
    summary: "Merchant income",
    createdBy: "user_1",
    operatorPersonId: null,
    projectId: "proj_1",
    merchantId: "merchant_1",
    categoryId: "cat_income",
    originalDocumentId: null,
    lines: [
      {
        lineNo: 1,
        lineType: "main",
        accountId: "acct_usdt",
        counterpartyAccountId: null,
        personId: null,
        borrowerPersonId: null,
        currencyCode: "USDT",
        amountMinor: 10000,
        usdtAmountMinor: 10000,
        exchangeRateText: null,
        note: null
      }
    ]
  });

  expect(result.status).toBe("draft");
  expect(sqlStatements.join(" ").toLowerCase()).toContain("insert into document_lines");
  expect(bindCalls.at(-1)).toEqual([
    expect.stringMatching(/^line_/),
    result.id,
    1,
    "main",
    "acct_usdt",
    null,
    null,
    null,
    "USDT",
    10000,
    10000,
    null,
    null
  ]);
});

it("updates document status for workflow actions", async () => {
  const sqlStatements: string[] = [];
  const bindCalls: unknown[][] = [];
  const repo = new DocumentRepository(
    mockDb({
      onSql: (sql) => sqlStatements.push(sql),
      onBind: (values) => bindCalls.push(values)
    })
  );

  await repo.markSubmitted("doc_1", "2026-04-24T10:00:00.000Z");
  await repo.markRejected("doc_1", "Missing attachment");

  const normalizedSql = sqlStatements.join(" ").replace(/\s+/g, " ").toLowerCase();
  expect(normalizedSql).toContain("status = 'pending'");
  expect(normalizedSql).toContain("status = 'rejected'");
  expect(bindCalls[0]).toEqual(["2026-04-24T10:00:00.000Z", "doc_1"]);
  expect(bindCalls[1]).toEqual(["Missing attachment", "doc_1"]);
});
```

- [ ] **Step 2: Run the repository test to verify it fails**

Run:

```bash
npm run test -- tests/api/documentRepository.test.ts
```

Expected: FAIL because `createDraftWithLines`, `markSubmitted`, and `markRejected` do not exist.

- [ ] **Step 3: Extend the repository interfaces**

Modify `src/repositories/documentRepository.ts` imports and interfaces:

```ts
import { all, first, newId, nowIso, run } from "./db";
import type { ActionType, DocumentStatus, DocumentType } from "../domain/types";
import type { NormalizedDocumentLine } from "../domain/documentLines";

export interface CreateDocumentWithLinesInput extends CreateDocumentInput {
  lines: NormalizedDocumentLine[];
}

export interface DocumentSummaryRow {
  id: string;
  document_no: string;
  document_type: DocumentType;
  action_type: ActionType;
  business_date: string;
  period: string;
  summary: string;
  status: DocumentStatus;
  created_by: string;
  created_at: string;
}

export interface DocumentDetailRow extends DocumentSummaryRow {
  operator_person_id: string | null;
  project_id: string | null;
  merchant_id: string | null;
  category_id: string | null;
  original_document_id: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reject_reason: string | null;
}

export interface DocumentLineRow {
  id: string;
  document_id: string;
  line_no: number;
  line_type: string;
  account_id: string | null;
  counterparty_account_id: string | null;
  person_id: string | null;
  borrower_person_id: string | null;
  currency_code: string;
  amount_minor: number;
  usdt_amount_minor: number | null;
  exchange_rate_text: string | null;
  note: string | null;
}
```

- [ ] **Step 4: Add repository methods**

Add these methods inside `DocumentRepository`:

```ts
  async createDraftWithLines(input: CreateDocumentWithLinesInput): Promise<{ id: string; documentNo: string; status: DocumentStatus }> {
    const document = await this.createDraft(input);
    for (const line of input.lines) {
      await run(
        this.db
          .prepare(
            `INSERT INTO document_lines (
              id, document_id, line_no, line_type, account_id, counterparty_account_id,
              person_id, borrower_person_id, currency_code, amount_minor, usdt_amount_minor,
              exchange_rate_text, note
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            newId("line"),
            document.id,
            line.lineNo,
            line.lineType,
            line.accountId,
            line.counterpartyAccountId,
            line.personId,
            line.borrowerPersonId,
            line.currencyCode,
            line.amountMinor,
            line.usdtAmountMinor,
            line.exchangeRateText,
            line.note
          )
      );
    }
    return document;
  }

  listDocuments(): Promise<DocumentSummaryRow[]> {
    return all<DocumentSummaryRow>(
      this.db.prepare(`
        SELECT id, document_no, document_type, action_type, business_date, period, summary, status, created_by, created_at
        FROM documents
        ORDER BY business_date DESC, created_at DESC
        LIMIT 100
      `)
    );
  }

  getDocument(id: string): Promise<DocumentDetailRow | null> {
    return first<DocumentDetailRow>(this.db.prepare(`SELECT * FROM documents WHERE id = ?`).bind(id));
  }

  getDocumentLines(documentId: string): Promise<DocumentLineRow[]> {
    return all<DocumentLineRow>(
      this.db.prepare(`SELECT * FROM document_lines WHERE document_id = ? ORDER BY line_no`).bind(documentId)
    );
  }

  async markSubmitted(id: string, submittedAt = nowIso()) {
    await run(this.db.prepare(`UPDATE documents SET status = 'pending', submitted_at = ?, reject_reason = NULL WHERE id = ?`).bind(submittedAt, id));
  }

  async markRejected(id: string, reason: string) {
    await run(this.db.prepare(`UPDATE documents SET status = 'rejected', reject_reason = ? WHERE id = ?`).bind(reason, id));
  }

  async markApproved(id: string, reviewer: string, reviewedAt = nowIso()) {
    await run(
      this.db
        .prepare(`UPDATE documents SET status = 'approved', reviewed_by = ?, reviewed_at = ?, reject_reason = NULL WHERE id = ?`)
        .bind(reviewer, reviewedAt, id)
    );
  }

  isPeriodLocked(period: string): Promise<{ period: string } | null> {
    return first<{ period: string }>(this.db.prepare(`SELECT period FROM period_locks WHERE period = ?`).bind(period));
  }

  async insertAccountEntries(
    documentId: string,
    entries: Array<{ accountId: string; currencyCode: string; amountMinor: number; entryDate: string }>
  ) {
    for (const entry of entries) {
      await run(
        this.db
          .prepare(
            `INSERT INTO account_entries (id, document_id, account_id, currency_code, amount_minor, entry_date, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(newId("acct_entry"), documentId, entry.accountId, entry.currencyCode, entry.amountMinor, entry.entryDate, nowIso())
      );
    }
  }

  async insertLoanEntries(
    documentId: string,
    entries: Array<{ borrowerPersonId: string; currencyCode: string; amountMinor: number; entryDate: string }>
  ) {
    for (const entry of entries) {
      await run(
        this.db
          .prepare(
            `INSERT INTO loan_entries (id, document_id, borrower_person_id, currency_code, amount_minor, entry_date, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(newId("loan_entry"), documentId, entry.borrowerPersonId, entry.currencyCode, entry.amountMinor, entry.entryDate, nowIso())
      );
    }
  }
```

- [ ] **Step 5: Run the repository test to verify it passes**

Run:

```bash
npm run test -- tests/api/documentRepository.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/repositories/documentRepository.ts tests/api/documentRepository.test.ts
git commit -m "feat: persist document lines and workflow status"
```

## Task 4: Audit Log Repository

**Files:**
- Create: `src/repositories/auditLogRepository.ts`
- Test: `tests/api/auditLogRepository.test.ts`

- [ ] **Step 1: Write a failing audit repository test**

Create `tests/api/auditLogRepository.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { AuditLogRepository } from "../../src/repositories/auditLogRepository";

function mockDb(options: { onBind?: (values: unknown[]) => void; onSql?: (sql: string) => void } = {}): D1Database {
  return {
    prepare: (sql: string) => {
      options.onSql?.(sql);
      return {
        bind(...values: unknown[]) {
          options.onBind?.(values);
          return this;
        },
        run: async () => ({ success: true } as D1Result)
      } as unknown as D1PreparedStatement;
    }
  } as unknown as D1Database;
}

describe("AuditLogRepository", () => {
  it("inserts JSON snapshots for auditable actions", async () => {
    let sql = "";
    let boundValues: unknown[] = [];
    const repo = new AuditLogRepository(mockDb({ onSql: (value) => (sql = value), onBind: (values) => (boundValues = values) }));

    await repo.record({
      actor: "user_1",
      action: "document.submit",
      entityType: "document",
      entityId: "doc_1",
      before: { status: "draft" },
      after: { status: "pending" },
      reason: "ready"
    });

    expect(sql.toLowerCase()).toContain("insert into audit_logs");
    expect(boundValues).toEqual([
      expect.stringMatching(/^audit_/),
      "user_1",
      "document.submit",
      "document",
      "doc_1",
      JSON.stringify({ status: "draft" }),
      JSON.stringify({ status: "pending" }),
      "ready",
      expect.any(String)
    ]);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run:

```bash
npm run test -- tests/api/auditLogRepository.test.ts
```

Expected: FAIL because `AuditLogRepository` does not exist.

- [ ] **Step 3: Add the audit repository**

Create `src/repositories/auditLogRepository.ts`:

```ts
import { newId, nowIso, run } from "./db";

export interface AuditLogInput {
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export class AuditLogRepository {
  constructor(private readonly db: D1Database) {}

  async record(input: AuditLogInput) {
    await run(
      this.db
        .prepare(
          `INSERT INTO audit_logs (
            id, actor, action, entity_type, entity_id, before_json, after_json, reason, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          newId("audit"),
          input.actor,
          input.action,
          input.entityType,
          input.entityId,
          input.before === undefined ? null : JSON.stringify(input.before),
          input.after === undefined ? null : JSON.stringify(input.after),
          input.reason ?? null,
          nowIso()
        )
    );
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:

```bash
npm run test -- tests/api/auditLogRepository.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/repositories/auditLogRepository.ts tests/api/auditLogRepository.test.ts
git commit -m "feat: add audit log repository"
```

## Task 5: Posting For Loan Repayment

**Files:**
- Modify: `src/domain/posting.ts`
- Test: `tests/domain/posting.test.ts`

- [ ] **Step 1: Write the failing posting test**

Append to `tests/domain/posting.test.ts`:

```ts
it("creates positive account and negative loan entries for loan repayments", () => {
  const entries = entriesForApprovedDocument({
    id: "doc_13",
    documentType: "loan_repayment",
    actionType: "normal",
    businessDate: "2026-04-03",
    borrowerPersonId: "person_1",
    lines: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 2500 }]
  });

  expect(entries.accountEntries).toEqual([{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 2500, entryDate: "2026-04-03" }]);
  expect(entries.loanEntries).toEqual([{ borrowerPersonId: "person_1", currencyCode: "USDT", amountMinor: -2500, entryDate: "2026-04-03" }]);
});
```

- [ ] **Step 2: Run the posting test to verify it fails**

Run:

```bash
npm run test -- tests/domain/posting.test.ts
```

Expected: FAIL with `Unsupported documentType: loan_repayment`.

- [ ] **Step 3: Extend posting support**

Modify `src/domain/posting.ts`:

```ts
  if (
    document.documentType !== "project_income" &&
    document.documentType !== "loan_out" &&
    document.documentType !== "loan_repayment"
  ) {
    throw new Error(`Unsupported documentType: ${document.documentType}`);
  }
```

Replace the loan borrower validation block with:

```ts
  let loanBorrowerPersonId = "";
  if (document.documentType === "loan_out" || document.documentType === "loan_repayment") {
    loanBorrowerPersonId = document.borrowerPersonId?.trim() ?? "";
    if (!loanBorrowerPersonId) throw new Error(`borrowerPersonId is required for ${document.documentType}`);
  }
```

Add this block inside the line loop:

```ts
    if (document.documentType === "loan_repayment") {
      const accountAmountMinor = document.actionType === "reversal" ? -line.amountMinor : line.amountMinor;
      const loanAmountMinor = document.actionType === "reversal" ? line.amountMinor : -line.amountMinor;
      accountEntries.push({ accountId, currencyCode, amountMinor: accountAmountMinor, entryDate: document.businessDate });
      loanEntries.push({ borrowerPersonId: loanBorrowerPersonId, currencyCode, amountMinor: loanAmountMinor, entryDate: document.businessDate });
    }
```

- [ ] **Step 4: Run the posting test to verify it passes**

Run:

```bash
npm run test -- tests/domain/posting.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/domain/posting.ts tests/domain/posting.test.ts
git commit -m "feat: post loan repayments"
```

## Task 6: Document Service Workflow

**Files:**
- Create: `src/services/documentService.ts`
- Test: `tests/api/documentService.test.ts`

- [ ] **Step 1: Write failing service tests**

Create `tests/api/documentService.test.ts`:

```ts
import { describe, expect, it, vi } from "vitest";
import { DocumentService } from "../../src/services/documentService";

function createRepo(overrides: Record<string, unknown> = {}) {
  return {
    createDraftWithLines: vi.fn(async () => ({ id: "doc_1", documentNo: "docno_1", status: "draft" })),
    getDocument: vi.fn(async () => ({
      id: "doc_1",
      document_no: "docno_1",
      document_type: "project_income",
      action_type: "normal",
      business_date: "2026-04-24",
      period: "2026-04",
      summary: "Income",
      status: "draft",
      created_by: "user_1",
      created_at: "2026-04-24T00:00:00.000Z",
      operator_person_id: null,
      project_id: "proj_1",
      merchant_id: "merchant_1",
      category_id: "cat_income",
      original_document_id: null,
      reviewed_by: null,
      reviewed_at: null,
      reject_reason: null
    })),
    getDocumentLines: vi.fn(async () => [{ account_id: "acct_usdt", currency_code: "USDT", amount_minor: 10000 }]),
    markSubmitted: vi.fn(async () => undefined),
    markRejected: vi.fn(async () => undefined),
    markApproved: vi.fn(async () => undefined),
    isPeriodLocked: vi.fn(async () => null),
    insertAccountEntries: vi.fn(async () => undefined),
    insertLoanEntries: vi.fn(async () => undefined),
    ...overrides
  };
}

function createAudit() {
  return { record: vi.fn(async () => undefined) };
}

describe("DocumentService", () => {
  it("creates drafts with normalized lines and audit logs", async () => {
    const repo = createRepo();
    const audit = createAudit();
    const service = new DocumentService(repo, audit);

    const result = await service.createDraft({
      documentType: "project_income",
      actionType: "normal",
      businessDate: "2026-04-24",
      period: "2026-04",
      summary: "Income",
      createdBy: "user_1",
      projectId: "proj_1",
      merchantId: "merchant_1",
      lines: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 10000 }]
    });

    expect(result.status).toBe("draft");
    expect(repo.createDraftWithLines).toHaveBeenCalledWith(expect.objectContaining({ lines: [expect.objectContaining({ lineNo: 1 })] }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "document.create", entityId: "doc_1" }));
  });

  it("submits draft documents", async () => {
    const repo = createRepo();
    const audit = createAudit();
    const service = new DocumentService(repo, audit);

    await service.submit("doc_1", "user_1");

    expect(repo.markSubmitted).toHaveBeenCalledWith("doc_1");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "document.submit" }));
  });

  it("rejects pending documents with a reason", async () => {
    const repo = createRepo({ getDocument: vi.fn(async () => ({ ...(await createRepo().getDocument()), status: "pending" })) });
    const audit = createAudit();
    const service = new DocumentService(repo, audit);

    await service.reject("doc_1", "user_2", "Missing attachment");

    expect(repo.markRejected).toHaveBeenCalledWith("doc_1", "Missing attachment");
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "document.reject", reason: "Missing attachment" }));
  });

  it("approves pending project income and writes posting entries", async () => {
    const baseDocument = await createRepo().getDocument();
    const repo = createRepo({
      getDocument: vi.fn(async () => ({ ...baseDocument, status: "pending" })),
      getDocumentLines: vi.fn(async () => [{ account_id: "acct_usdt", currency_code: "USDT", amount_minor: 10000 }])
    });
    const audit = createAudit();
    const service = new DocumentService(repo, audit);

    await service.approve("doc_1", "reviewer_1");

    expect(repo.insertAccountEntries).toHaveBeenCalledWith("doc_1", [
      { accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 10000, entryDate: "2026-04-24" }
    ]);
    expect(repo.markApproved).toHaveBeenCalledWith("doc_1", "reviewer_1");
  });

  it("rejects approval when the period is locked", async () => {
    const baseDocument = await createRepo().getDocument();
    const repo = createRepo({
      getDocument: vi.fn(async () => ({ ...baseDocument, status: "pending" })),
      isPeriodLocked: vi.fn(async () => ({ period: "2026-04" }))
    });
    const service = new DocumentService(repo, createAudit());

    await expect(service.approve("doc_1", "reviewer_1")).rejects.toThrow("Period 2026-04 is locked");
  });
});
```

- [ ] **Step 2: Run the service test to verify it fails**

Run:

```bash
npm run test -- tests/api/documentService.test.ts
```

Expected: FAIL because `DocumentService` does not exist.

- [ ] **Step 3: Add the service**

Create `src/services/documentService.ts`:

```ts
import { normalizeDocumentLines, type RawDocumentLine } from "../domain/documentLines";
import { assertDocumentTransition, periodFromDate } from "../domain/documentWorkflow";
import { entriesForApprovedDocument } from "../domain/posting";
import type { ActionType, DocumentType } from "../domain/types";
import type { AuditLogRepository } from "../repositories/auditLogRepository";
import type { DocumentRepository } from "../repositories/documentRepository";

export interface CreateDraftRequest {
  documentType: DocumentType;
  actionType?: ActionType;
  businessDate: string;
  period: string;
  operatorPersonId?: string | null;
  projectId?: string | null;
  merchantId?: string | null;
  categoryId?: string | null;
  originalDocumentId?: string | null;
  summary: string;
  createdBy: string;
  lines: RawDocumentLine[];
}

export class DocumentService {
  constructor(
    private readonly documents: Pick<
      DocumentRepository,
      | "createDraftWithLines"
      | "getDocument"
      | "getDocumentLines"
      | "markSubmitted"
      | "markRejected"
      | "markApproved"
      | "isPeriodLocked"
      | "insertAccountEntries"
      | "insertLoanEntries"
    >,
    private readonly auditLogs: Pick<AuditLogRepository, "record">
  ) {}

  async createDraft(input: CreateDraftRequest) {
    const lines = normalizeDocumentLines(input.lines);
    const document = await this.documents.createDraftWithLines({
      ...input,
      actionType: input.actionType ?? "normal",
      operatorPersonId: input.operatorPersonId ?? null,
      projectId: input.projectId ?? null,
      merchantId: input.merchantId ?? null,
      categoryId: input.categoryId ?? null,
      originalDocumentId: input.originalDocumentId ?? null,
      lines
    });
    await this.auditLogs.record({
      actor: input.createdBy,
      action: "document.create",
      entityType: "document",
      entityId: document.id,
      after: document
    });
    return document;
  }

  async submit(id: string, actor: string) {
    const document = await this.requireDocument(id);
    assertDocumentTransition(document.status, "pending", "submit");
    await this.documents.markSubmitted(id);
    await this.auditLogs.record({
      actor,
      action: "document.submit",
      entityType: "document",
      entityId: id,
      before: { status: document.status },
      after: { status: "pending" }
    });
  }

  async reject(id: string, actor: string, reason: string) {
    const document = await this.requireDocument(id);
    assertDocumentTransition(document.status, "rejected", "reject");
    const trimmedReason = reason.trim();
    if (!trimmedReason) throw new Error("Reject reason is required");
    await this.documents.markRejected(id, trimmedReason);
    await this.auditLogs.record({
      actor,
      action: "document.reject",
      entityType: "document",
      entityId: id,
      before: { status: document.status },
      after: { status: "rejected" },
      reason: trimmedReason
    });
  }

  async approve(id: string, reviewer: string) {
    const document = await this.requireDocument(id);
    assertDocumentTransition(document.status, "approved", "approve");
    const period = periodFromDate(document.business_date);
    if (await this.documents.isPeriodLocked(period)) {
      throw new Error(`Period ${period} is locked`);
    }

    const lines = await this.documents.getDocumentLines(id);
    const posting = entriesForApprovedDocument({
      id,
      documentType: document.document_type,
      actionType: document.action_type,
      businessDate: document.business_date,
      borrowerPersonId: firstBorrower(lines),
      lines: lines.map((line) => ({
        accountId: line.account_id ?? "",
        currencyCode: line.currency_code,
        amountMinor: line.amount_minor
      }))
    });

    await this.documents.insertAccountEntries(id, posting.accountEntries);
    await this.documents.insertLoanEntries(id, posting.loanEntries);
    await this.documents.markApproved(id, reviewer);
    await this.auditLogs.record({
      actor: reviewer,
      action: "document.approve",
      entityType: "document",
      entityId: id,
      before: { status: document.status },
      after: { status: "approved", accountEntries: posting.accountEntries.length, loanEntries: posting.loanEntries.length }
    });
  }

  private async requireDocument(id: string) {
    const document = await this.documents.getDocument(id);
    if (!document) throw new Error("Document not found");
    return document;
  }
}

function firstBorrower(lines: Array<{ borrower_person_id: string | null }>) {
  return lines.find((line) => line.borrower_person_id)?.borrower_person_id ?? undefined;
}
```

- [ ] **Step 4: Run the service test to verify it passes**

Run:

```bash
npm run test -- tests/api/documentService.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/documentService.ts tests/api/documentService.test.ts
git commit -m "feat: orchestrate document workflow"
```

## Task 7: Documents API And Router Actions

**Files:**
- Modify: `src/api/documents.ts`
- Modify: `src/worker/router.ts`
- Test: `tests/api/documents.test.ts`

- [ ] **Step 1: Add failing API tests for list and actions**

Append to `tests/api/documents.test.ts`:

```ts
it("routes document list requests", async () => {
  const response = await route(new Request("https://ledger.test/api/documents"), mockEnv());

  expect(response.status).toBe(200);
});

it("routes document submit actions", async () => {
  const response = await route(
    new Request("https://ledger.test/api/documents/doc_1/submit", {
      method: "POST",
      body: JSON.stringify({ actor: "user_1" })
    }),
    mockEnv()
  );

  expect(response.status).not.toBe(404);
});
```

- [ ] **Step 2: Run the API test to verify it fails**

Run:

```bash
npm run test -- tests/api/documents.test.ts
```

Expected: FAIL because routes for document list and document actions do not exist.

- [ ] **Step 3: Update the router for path parameters**

Modify `src/worker/router.ts`:

```ts
interface Route {
  method: string;
  pattern: RegExp;
  handler: Handler;
  paramNames?: string[];
}

const routes: Route[] = [
  { method: "GET", pattern: /^\/api\/currencies$/, handler: listCurrencies },
  { method: "GET", pattern: /^\/api\/reports\/account-balances$/, handler: accountBalances },
  { method: "GET", pattern: /^\/api\/reports\/petty-cash-pending$/, handler: pettyCashPendingMatches },
  { method: "GET", pattern: /^\/api\/reports\/loan-balances$/, handler: loanBalances },
  { method: "GET", pattern: /^\/api\/documents$/, handler: listDocuments },
  { method: "GET", pattern: /^\/api\/documents\/([^/]+)$/, handler: getDocument, paramNames: ["id"] },
  { method: "POST", pattern: /^\/api\/documents$/, handler: createDocument },
  { method: "POST", pattern: /^\/api\/documents\/([^/]+)\/submit$/, handler: submitDocument, paramNames: ["id"] },
  { method: "POST", pattern: /^\/api\/documents\/([^/]+)\/approve$/, handler: approveDocument, paramNames: ["id"] },
  { method: "POST", pattern: /^\/api\/documents\/([^/]+)\/reject$/, handler: rejectDocument, paramNames: ["id"] },
  { method: "POST", pattern: /^\/api\/projects$/, handler: createProject }
];

export async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  for (const candidate of routes) {
    const match = candidate.pattern.exec(url.pathname);
    if (candidate.method === request.method && match) {
      const params = Object.fromEntries((candidate.paramNames ?? []).map((name, index) => [name, match[index + 1]]));
      return candidate.handler({ request, env, params });
    }
  }
  return Response.json({ error: "Not found" }, { status: 404 });
}
```

Also update the import from `../api/documents` to include `listDocuments`, `getDocument`, `submitDocument`, `approveDocument`, and `rejectDocument`.

- [ ] **Step 4: Refactor document API handlers to use the service**

Modify `src/api/documents.ts` to instantiate repositories through a helper:

```ts
import { AuditLogRepository } from "../repositories/auditLogRepository";
import { DocumentService } from "../services/documentService";

function documentService(env: { DB: D1Database }) {
  return new DocumentService(new DocumentRepository(env.DB), new AuditLogRepository(env.DB));
}
```

Add handlers:

```ts
export const listDocuments: Handler = async ({ env }) => {
  const repo = new DocumentRepository(env.DB);
  return Response.json({ data: await repo.listDocuments() });
};

export const getDocument: Handler = async ({ env, params }) => {
  const repo = new DocumentRepository(env.DB);
  const document = await repo.getDocument(params.id);
  if (!document) return Response.json({ error: "Document not found" }, { status: 404 });
  const lines = await repo.getDocumentLines(params.id);
  return Response.json({ data: { document, lines } });
};

export const submitDocument: Handler = async ({ env, params, request }) => {
  const body = await readJsonObject(request);
  const actor = requiredBodyString(body, "actor");
  await documentService(env).submit(params.id, actor);
  return Response.json({ data: { id: params.id, status: "pending" } });
};

export const approveDocument: Handler = async ({ env, params, request }) => {
  const body = await readJsonObject(request);
  const reviewer = requiredBodyString(body, "reviewer");
  await documentService(env).approve(params.id, reviewer);
  return Response.json({ data: { id: params.id, status: "approved" } });
};

export const rejectDocument: Handler = async ({ env, params, request }) => {
  const body = await readJsonObject(request);
  const actor = requiredBodyString(body, "actor");
  const reason = requiredBodyString(body, "reason");
  await documentService(env).reject(params.id, actor, reason);
  return Response.json({ data: { id: params.id, status: "rejected" } });
};

async function readJsonObject(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("JSON object body is required");
  }
  return body as Record<string, unknown>;
}

function requiredBodyString(body: Record<string, unknown>, field: string) {
  const value = body[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${field} is required`);
  }
  return value.trim();
}
```

Change `createDocument` so it calls `documentService(env).createDraft(...)` and accepts `lines` in the request body.

- [ ] **Step 5: Add request error handling**

Wrap service calls in `try/catch` in `createDocument`, `submitDocument`, `approveDocument`, and `rejectDocument`. Return:

```ts
return Response.json({ error: error instanceof Error ? error.message : "Document workflow failed" }, { status: 400 });
```

- [ ] **Step 6: Run the API test to verify it passes**

Run:

```bash
npm run test -- tests/api/documents.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/api/documents.ts src/worker/router.ts tests/api/documents.test.ts
git commit -m "feat: add document workflow api"
```

## Task 8: D1 Index Migration

**Files:**
- Create: `migrations/0002_document_workflow_indexes.sql`

- [ ] **Step 1: Add the migration**

Create `migrations/0002_document_workflow_indexes.sql`:

```sql
CREATE INDEX IF NOT EXISTS idx_documents_status_created_at ON documents(status, created_at);
CREATE INDEX IF NOT EXISTS idx_documents_period_status ON documents(period, status);
CREATE INDEX IF NOT EXISTS idx_document_lines_document_id ON document_lines(document_id);
CREATE INDEX IF NOT EXISTS idx_account_entries_document_id ON account_entries(document_id);
CREATE INDEX IF NOT EXISTS idx_loan_entries_document_id ON loan_entries(document_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at);
```

- [ ] **Step 2: Run local migration**

Run:

```bash
npm run db:migrate:local
```

Expected: Wrangler applies `0002_document_workflow_indexes.sql` without SQL errors.

- [ ] **Step 3: Commit**

```bash
git add migrations/0002_document_workflow_indexes.sql
git commit -m "chore: index document workflow tables"
```

## Task 9: Document Workflow UI

**Files:**
- Modify: `src/app/pages/DocumentsPage.tsx`
- Modify: `src/app/styles.css`
- Test: `src/app/pages/DocumentsPage.test.ts`

- [ ] **Step 1: Add failing UI unit tests for action helpers**

Modify the existing import in `src/app/pages/DocumentsPage.test.ts`:

```ts
import {
  buildDocumentPayload,
  canApproveDocument,
  canSubmitDocument,
  formatLocalDateInputValue,
  formatLocalMonthInputValue,
  isOriginalDocumentRequired
} from "./DocumentsPage";
```

Append these tests inside the existing `describe("document date defaults", () => { ... })` block:

```ts
it("builds a document payload with one line", () => {
  expect(
    buildDocumentPayload({
      documentType: "project_income",
      actionType: "normal",
      businessDate: "2026-04-24",
      period: "2026-04",
      originalDocumentId: "",
      summary: "Income",
      createdBy: "user_1",
      operatorPersonId: "",
      projectId: "proj_1",
      merchantId: "merchant_1",
      categoryId: "cat_income",
      accountId: "acct_usdt",
      currencyCode: "USDT",
      amountMajor: "100.50",
      borrowerPersonId: ""
    })
  ).toEqual({
    documentType: "project_income",
    actionType: "normal",
    businessDate: "2026-04-24",
    period: "2026-04",
    summary: "Income",
    createdBy: "user_1",
    projectId: "proj_1",
    merchantId: "merchant_1",
    categoryId: "cat_income",
    lines: [{ lineType: "main", accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 10050 }]
  });
});

it("shows workflow actions by status", () => {
  expect(canSubmitDocument("draft")).toBe(true);
  expect(canSubmitDocument("rejected")).toBe(true);
  expect(canSubmitDocument("pending")).toBe(false);
  expect(canApproveDocument("pending")).toBe(true);
  expect(canApproveDocument("approved")).toBe(false);
});
```

- [ ] **Step 2: Run the UI test to verify it fails**

Run:

```bash
npm run test -- src/app/pages/DocumentsPage.test.ts
```

Expected: FAIL because the exported helpers do not exist.

- [ ] **Step 3: Export UI helpers**

In `src/app/pages/DocumentsPage.tsx`, export helpers:

```ts
export function amountMajorToMinor(value: string) {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error("金额格式必须最多两位小数");
  const [major, minor = ""] = normalized.split(".");
  return Number(major) * 100 + Number(minor.padEnd(2, "0"));
}

export function canSubmitDocument(status: string) {
  return status === "draft" || status === "rejected";
}

export function canApproveDocument(status: string) {
  return status === "pending";
}

export function buildDocumentPayload(form: DocumentForm & { accountId: string; currencyCode: string; amountMajor: string; borrowerPersonId: string }) {
  const payload: Record<string, unknown> = {
    documentType: form.documentType,
    actionType: form.actionType,
    businessDate: form.businessDate,
    period: form.period,
    summary: form.summary.trim(),
    createdBy: form.createdBy.trim(),
    lines: [
      {
        lineType: "main",
        accountId: form.accountId.trim(),
        currencyCode: form.currencyCode.trim().toUpperCase(),
        amountMinor: amountMajorToMinor(form.amountMajor)
      }
    ]
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

  const borrowerPersonId = form.borrowerPersonId.trim();
  if (borrowerPersonId) {
    (payload.lines as Array<Record<string, unknown>>)[0].borrowerPersonId = borrowerPersonId;
  }

  return payload;
}
```

- [ ] **Step 4: Update the page behavior**

Modify `DocumentsPage` so it:

- Loads `GET /api/documents` on mount.
- Renders a compact document table with document number, type, date, status, and summary.
- Adds form fields for account ID, currency code, amount, and borrower person ID.
- Calls `POST /api/documents/:id/submit` with `{ actor: form.createdBy }`.
- Calls `POST /api/documents/:id/approve` with `{ reviewer: form.createdBy }`.
- Calls `POST /api/documents/:id/reject` with `{ actor: form.createdBy, reason: "退回修改" }`.
- Refreshes the list after create or action.

Use existing `getJson` and `postJson` helpers from `src/app/api.ts`.

- [ ] **Step 5: Add compact workflow styles**

Add to `src/app/styles.css`:

```css
.document-toolbar {
  display: flex;
  gap: 8px;
  align-items: center;
  justify-content: flex-end;
}

.data-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 13px;
}

.data-table th,
.data-table td {
  border-bottom: 1px solid var(--border-color);
  padding: 8px;
  text-align: left;
  vertical-align: middle;
}

.data-table th {
  color: var(--muted-text);
  font-weight: 600;
}

.inline-actions {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
```

- [ ] **Step 6: Run the UI test**

Run:

```bash
npm run test -- src/app/pages/DocumentsPage.test.ts
```

Expected: PASS.

- [ ] **Step 7: Run the build**

Run:

```bash
npm run build
```

Expected: Vite build completes with exit code 0.

- [ ] **Step 8: Commit**

```bash
git add src/app/pages/DocumentsPage.tsx src/app/styles.css src/app/pages/DocumentsPage.test.ts
git commit -m "feat: add document workflow UI"
```

## Task 10: Final Verification

**Files:**
- Modify: `docs/deployment.md` if local or deployment commands changed.

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

- The documents page lists documents.
- A project-income draft can be created with one line.
- The draft can be submitted.
- The pending document can be approved.
- Account balance report reflects the approved project-income posting.

- [ ] **Step 6: Commit verification-only docs if changed**

If `docs/deployment.md` changed:

```bash
git add docs/deployment.md
git commit -m "docs: update workflow verification notes"
```

## Implementation Notes

- Keep workflow and posting code conservative. This plan intentionally supports approval posting for `project_income`, `loan_out`, and `loan_repayment` only.
- `exchange`, `petty_cash_issue`, `petty_cash_return`, `petty_cash_reimbursement`, `loan_writeoff`, and `manual_adjustment` may be created as drafts, but approval should return the current posting error until their dedicated subsystem plan is implemented.
- Do not add role permissions in this plan. Use explicit `actor` and `reviewer` request fields for audit logging until identity mapping is implemented.
- Do not change Cloudflare deployment credentials or store secrets in files.

## Self-Review Notes

Spec coverage in this plan:

- Source documents with line items: Tasks 2, 3, 7, and 9.
- Submit, reject, approve lifecycle: Tasks 1, 6, 7, and 9.
- Approved-only posting foundation: Tasks 5 and 6.
- Audit logs for create, submit, reject, approve: Tasks 4 and 6.
- Period-lock checks before approval: Tasks 1 and 6.
- Local migration and verification: Tasks 8 and 10.

Intentionally excluded from this plan and split into separate plans:

- FIFO lots, exchange posting, petty-cash negative balance matching, and pending cost matching.
- Full loan writeoff behavior.
- Role-based permissions and Cloudflare Access identity mapping.
- Full formal reporting center.
- R2 attachments and export/backup flows.

No placeholder tasks remain in this plan. Type names, function names, and file paths are consistent across the tasks above.
