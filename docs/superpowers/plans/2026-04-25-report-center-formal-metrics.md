# Report Center Formal Metrics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first formal report-center metrics for management accounting: operating reports, fund reports, petty-cash/loan rollups, and exception checks from approved source documents.

**Architecture:** Keep reports read-only and derived from approved documents plus posting side-effects. Add one missing attribution table for pending-cost applications so expense USDT cost can be traced after later petty-cash funding. Keep API handlers thin, put SQL in `ReportRepository`, and split the report page into small report modules so the page does not keep growing as one large file.

**Tech Stack:** Cloudflare Workers, D1 SQLite, TypeScript, React, Vite, Vitest.

---

## Design Source

Use the approved formal-system spec as the business source:

- `docs/superpowers/specs/2026-04-24-management-ledger-formal-system-design.md`
- Section `9. 报表体系`
- Section `9.1 经营分析报表`
- Section `9.2 资金管理报表`
- Section `9.3 备用金报表`
- Section `9.4 借款报表`
- Section `9.5 异常检查报表`
- Phase list item `5. 报表中心第一批正式口径`

## Scope

In scope:

- Add traceable attribution for pending petty-cash cost applications.
- Add formal operating reports:
  - project profit/loss
  - project income
  - merchant income
  - expense details
  - expense summary
  - monthly operating summary
- Add first exception checks:
  - negative petty cash
  - pending cost
  - negative company account
  - stale pending approval
  - stale draft
  - stale loan
- Add report filters:
  - `period`
  - `projectId`
  - `merchantId`
  - `personId`
  - `currencyCode`
  - `staleDays`
- Group report UI into:
  - 经营分析
  - 资金管理
  - 备用金
  - 借款
  - 异常检查

Out of scope:

- Excel/PDF export.
- Charts.
- Role permission enforcement.
- Import from the old spreadsheet.
- Cloudflare Access.
- Custom report builder.

## Business Rules

- Reports only include `documents.status = 'approved'`, except workflow exception checks for draft/pending aging.
- Reversal documents are included through their generated negative postings where the posting engine supports reversal.
- Loan writeoff reports exclude original writeoff documents that already have an approved reversal.
- Petty-cash reimbursement cost has two parts:
  - direct matched USDT cost from `lot_movements.movement_type = 'petty_cash_reimbursement'`
  - later matched USDT cost from the new `pending_cost_applications` table
- Pending cost still remaining must show separately and marks cost completeness as `incomplete`.
- Loan out and loan repayment are not income/expense. Loan writeoff is expense/loss.
- Project income comes from `project_income` documents and uses `merchant_id` as the source merchant.

## File Structure

Create:

- `migrations/0006_pending_cost_applications.sql` - records later USDT-cost applications against pending petty-cash costs.
- `src/app/pages/reports/reportTypes.ts` - UI row types for report endpoints.
- `src/app/pages/reports/reportFilters.ts` - query-string builder and default filter helpers.
- `src/app/pages/reports/reportFormat.ts` - shared amount/date/id formatting helpers.
- `src/app/pages/reports/ReportTable.tsx` - small reusable table shell with empty/error rows.
- `src/app/pages/reports/reportGroups.tsx` - grouped report sections for ReportsPage.
- `src/app/pages/reports/reportFilters.test.ts` - frontend tests for query construction.

Modify:

- `src/domain/fifoEffects.ts` - add pending-cost application effects when petty-cash issue matches pending costs.
- `src/repositories/documentRepository.ts` - write pending-cost application rows inside approval batches.
- `src/services/documentService.ts` - pass new FIFO effects through unchanged.
- `src/repositories/reportRepository.ts` - add formal report queries and report filter binding helpers.
- `src/api/reports.ts` - parse report filters and expose new handlers.
- `src/worker/router.ts` - route new report endpoints.
- `src/app/pages/ReportsPage.tsx` - replace flat report list with grouped report-center view.
- `src/app/styles.css` - add compact grouped-report layout styles.
- `tests/domain/fifoEffects.test.ts` - cover pending-cost application effects.
- `tests/api/documentRepository.test.ts` - cover pending-cost application batch writes.
- `tests/api/reportRepository.test.ts` - cover new report SQL.
- `tests/api/reports.test.ts` - cover handlers/routes/filter parsing.

---

## Task 1: Add Pending Cost Application Attribution

**Files:**

- Create: `migrations/0006_pending_cost_applications.sql`
- Modify: `src/domain/fifoEffects.ts`
- Modify: `src/repositories/documentRepository.ts`
- Test: `tests/domain/fifoEffects.test.ts`
- Test: `tests/api/documentRepository.test.ts`

- [ ] **Step 1: Write failing domain test for pending cost applications**

Add to `tests/domain/fifoEffects.test.ts`:

```ts
it("records pending cost application effects when petty cash issue matches pending costs", () => {
  const result = planPettyCashIssueEffects({
    documentId: "doc_issue",
    fromAccountId: "acct_company",
    toAccountId: "acct_staff",
    personId: "person_staff",
    currencyCode: "AED",
    amountMinor: 200000,
    businessDate: "2026-04-25",
    sourceLots: [
      {
        id: "lot_a",
        currencyCode: "AED",
        remainingAmountMinor: 200000,
        remainingUsdtCostMinor: 54000,
        lotDate: "2026-04-01"
      }
    ],
    openPendingMatches: [
      { id: "pending_old", remainingAmountMinor: 120000, expenseDate: "2026-04-20", createdAt: "2026-04-20T10:00:00.000Z" }
    ]
  });

  expect(result.pendingCostApplications).toEqual([
    {
      pendingCostMatchId: "pending_old",
      lotId: "doc_issue:issue:1",
      amountMinor: 120000,
      usdtCostMinor: 32400,
      applicationDate: "2026-04-25"
    }
  ]);
});
```

- [ ] **Step 2: Run the failing test**

Run:

```bash
npm run test -- tests/domain/fifoEffects.test.ts
```

Expected: FAIL because `pendingCostApplications` does not exist.

- [ ] **Step 3: Add domain effect type and populate it**

In `src/domain/fifoEffects.ts`, add:

```ts
export interface PendingCostApplicationEffect {
  pendingCostMatchId: string;
  lotId: string;
  amountMinor: number;
  usdtCostMinor: number;
  applicationDate: string;
}

export interface FifoPostingEffects {
  lotCreations: LotCreationEffect[];
  lotUpdates: LotUpdateEffect[];
  lotMovements: LotMovementEffect[];
  pendingCostCreations: PendingCostCreationEffect[];
  pendingCostUpdates: PendingCostUpdateEffect[];
  pendingCostApplications: PendingCostApplicationEffect[];
}
```

Update `emptyFifoPostingEffects()` to include `pendingCostApplications: []`.

Update every existing returned `FifoPostingEffects` object to include `pendingCostApplications: []`, except `planPettyCashIssueEffects`, which should return:

```ts
pendingCostApplications: pendingCostApplication.pendingCostApplications
```

Update `applyPendingCostMatches(...)` return type:

```ts
}): {
  pendingCostUpdates: PendingCostUpdateEffect[];
  lotMovements: LotMovementEffect[];
  pendingCostApplications: PendingCostApplicationEffect[];
} {
  const pendingCostApplications: PendingCostApplicationEffect[] = [];
```

Inside the allocation loop that creates `pending_cost_match` lot movements, push:

```ts
pendingCostApplications.push({
  pendingCostMatchId,
  lotId: issuedLot.creation.clientLotId,
  amountMinor: appliedAmountMinor,
  usdtCostMinor: appliedUsdtCostMinor,
  applicationDate: movementDate
});
```

Return `pendingCostApplications` with the existing updates and movements.

- [ ] **Step 4: Verify domain tests pass**

Run:

```bash
npm run test -- tests/domain/fifoEffects.test.ts
```

Expected: PASS.

- [ ] **Step 5: Add migration**

Create `migrations/0006_pending_cost_applications.sql`:

```sql
CREATE TABLE IF NOT EXISTS pending_cost_applications (
  id TEXT PRIMARY KEY,
  pending_cost_match_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  lot_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  usdt_cost_minor INTEGER NOT NULL,
  application_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (pending_cost_match_id) REFERENCES pending_cost_matches(id),
  FOREIGN KEY (document_id) REFERENCES documents(id),
  FOREIGN KEY (lot_id) REFERENCES lots(id)
);

CREATE INDEX IF NOT EXISTS idx_pending_cost_applications_pending
  ON pending_cost_applications(pending_cost_match_id, application_date, created_at);

CREATE INDEX IF NOT EXISTS idx_pending_cost_applications_document
  ON pending_cost_applications(document_id);
```

- [ ] **Step 6: Write repository batch test**

Add to `tests/api/documentRepository.test.ts`:

```ts
it("batches pending cost applications during guarded approval", async () => {
  const batchCalls: CapturedStatement[][] = [];
  const repo = new DocumentRepository(mockDb({ onBatch: (statements) => batchCalls.push(statements) }));

  await repo.approveWithPostings({
    documentId: "doc_issue",
    period: "2026-04",
    reviewer: "reviewer_1",
    accountEntries: [],
    loanEntries: [],
    lotCreations: [],
    lotUpdates: [],
    lotMovements: [],
    pendingCostCreations: [],
    pendingCostUpdates: [],
    pendingCostApplications: [
      {
        pendingCostMatchId: "pending_1",
        lotId: "lot_staff",
        amountMinor: 120000,
        usdtCostMinor: 32400,
        applicationDate: "2026-04-25"
      }
    ],
    auditLogStatement: {
      sql: "INSERT INTO audit_logs (id, entity_id) VALUES (?, ?)",
      bindings: ["audit_1", "doc_issue"]
    }
  });

  const statement = batchCalls[0].find((item) =>
    item.sql.replace(/\s+/g, " ").toLowerCase().includes("insert into pending_cost_applications")
  );
  expect(statement).toBeDefined();
  expect(statement?.bindings).toEqual([
    expect.stringMatching(/^pending_cost_app_/),
    "pending_1",
    "doc_issue",
    "lot_staff",
    120000,
    32400,
    "2026-04-25",
    expect.any(String),
    "doc_issue",
    "2026-04"
  ]);
});
```

- [ ] **Step 7: Implement repository write path**

In `src/repositories/documentRepository.ts`:

Import `PendingCostApplicationEffect` from `../domain/fifoEffects`.

Add to `ApproveDocumentWithPostingsInput`:

```ts
pendingCostApplications?: PendingCostApplicationEffect[];
```

In `approveWithPostings`, after `pendingCostUpdates` and before loan item effects, push statements:

```ts
for (const pendingCostApplication of input.pendingCostApplications ?? []) {
  statements.push({
    statement: this.prepareConditionalPendingCostApplication(input.documentId, input.period, pendingCostApplication, reversalOriginalDocumentId),
    role: "effect"
  });
}
```

Add:

```ts
private prepareConditionalPendingCostApplication(
  documentId: string,
  period: string,
  application: PendingCostApplicationEffect,
  reversalOriginalDocumentId: string | null = null
): D1PreparedStatement {
  return this.db
    .prepare(
      `INSERT INTO pending_cost_applications (
         id, pending_cost_match_id, document_id, lot_id,
         amount_minor, usdt_cost_minor, application_date, created_at
       )
       SELECT ?, ?, ?, ?, ?, ?, ?, ?
       WHERE ${this.approvalGuardSql(reversalOriginalDocumentId)}`
    )
    .bind(
      newId("pending_cost_app"),
      application.pendingCostMatchId,
      documentId,
      application.lotId,
      application.amountMinor,
      application.usdtCostMinor,
      application.applicationDate,
      nowIso(),
      ...this.approvalGuardBindings(documentId, period, reversalOriginalDocumentId)
    );
}
```

Pass `pendingCostApplications: fifoEffects.pendingCostApplications` from `DocumentService.approve(...)` and `approveReversal(...)`.

- [ ] **Step 8: Verify repository and service tests**

Run:

```bash
npm run test -- tests/domain/fifoEffects.test.ts tests/api/documentRepository.test.ts tests/api/documentService.test.ts
```

Expected: PASS.

- [ ] **Step 9: Apply local migration**

Run:

```bash
npm run db:migrate:local
```

Expected: migration `0006_pending_cost_applications.sql` applied or no migrations left after a rerun.

- [ ] **Step 10: Commit**

```bash
git add migrations/0006_pending_cost_applications.sql src/domain/fifoEffects.ts src/repositories/documentRepository.ts src/services/documentService.ts tests/domain/fifoEffects.test.ts tests/api/documentRepository.test.ts tests/api/documentService.test.ts
git commit -m "feat: track pending cost applications"
```

---

## Task 2: Add Report Filters and Formal Report Query Types

**Files:**

- Modify: `src/repositories/reportRepository.ts`
- Test: `tests/api/reportRepository.test.ts`

- [ ] **Step 1: Write failing filter helper tests**

Add to `tests/api/reportRepository.test.ts`:

```ts
it("binds formal report filters in project income queries", async () => {
  const rows = [];
  let sql = "";
  let bindings: unknown[] = [];
  const repo = new ReportRepository(mockDb(rows, (value) => (sql = value), (values) => (bindings = values)));

  await repo.projectIncome({ period: "2026-04", projectId: "proj_1", merchantId: "merchant_1", currencyCode: "USDT" });

  const normalized = normalizeSql(sql);
  expect(normalized).toContain("d.period = ?");
  expect(normalized).toContain("d.project_id = ?");
  expect(normalized).toContain("d.merchant_id = ?");
  expect(normalized).toContain("ae.currency_code = ?");
  expect(bindings).toEqual(["2026-04", "proj_1", "merchant_1", "USDT"]);
});
```

Update local `mockDb` in the test file to accept an optional `onBind` callback:

```ts
function mockDb(rows: unknown[], onSql: (sql: string) => void, onBind: (values: unknown[]) => void = () => {}): D1Database {
  return {
    prepare: (sql: string) => {
      onSql(sql);
      return {
        bind(...values: unknown[]) {
          onBind(values);
          return this;
        },
        all: async () => ({ success: true, results: rows })
      } as unknown as D1PreparedStatement;
    }
  } as unknown as D1Database;
}
```

- [ ] **Step 2: Add filter and row interfaces**

In `src/repositories/reportRepository.ts`, add:

```ts
export interface ReportFilters {
  period?: string;
  projectId?: string;
  merchantId?: string;
  personId?: string;
  currencyCode?: string;
  staleDays?: number;
}

export interface ProjectIncomeRow {
  period: string;
  project_id: string | null;
  merchant_id: string | null;
  category_id: string | null;
  currency_code: string;
  income_amount_minor: number;
  income_usdt_minor: number;
}

export interface MerchantIncomeRow {
  period: string;
  project_id: string | null;
  merchant_id: string | null;
  currency_code: string;
  income_amount_minor: number;
  income_usdt_minor: number;
}

export interface ExpenseDetailRow {
  document_id: string;
  document_type: string;
  period: string;
  business_date: string;
  project_id: string | null;
  merchant_id: string | null;
  category_id: string | null;
  person_id: string | null;
  borrower_person_id: string | null;
  currency_code: string;
  amount_minor: number;
  matched_usdt_cost_minor: number;
  pending_amount_minor: number;
  cost_status: "complete" | "incomplete";
}

export interface ExpenseSummaryRow {
  period: string;
  project_id: string | null;
  category_id: string | null;
  person_id: string | null;
  currency_code: string;
  amount_minor: number;
  matched_usdt_cost_minor: number;
  pending_amount_minor: number;
}

export interface ProjectProfitLossRow {
  period: string;
  project_id: string | null;
  income_usdt_minor: number;
  expense_usdt_minor: number;
  pending_expense_minor: number;
  net_usdt_minor: number;
  cost_status: "complete" | "incomplete";
}

export interface MonthlyOperatingSummaryRow {
  period: string;
  income_usdt_minor: number;
  expense_usdt_minor: number;
  pending_expense_minor: number;
  net_usdt_minor: number;
  cost_status: "complete" | "incomplete";
}
```

- [ ] **Step 3: Add reusable SQL filter helper**

In `ReportRepository`, add private helpers:

```ts
private documentFilterSql(filters: ReportFilters, alias = "d", accountAlias?: string) {
  const clauses: string[] = [];
  const bindings: unknown[] = [];

  if (filters.period) {
    clauses.push(`${alias}.period = ?`);
    bindings.push(filters.period);
  }
  if (filters.projectId) {
    clauses.push(`${alias}.project_id = ?`);
    bindings.push(filters.projectId);
  }
  if (filters.merchantId) {
    clauses.push(`${alias}.merchant_id = ?`);
    bindings.push(filters.merchantId);
  }
  if (filters.currencyCode && accountAlias) {
    clauses.push(`${accountAlias}.currency_code = ?`);
    bindings.push(filters.currencyCode);
  }

  return { sql: clauses.length ? `AND ${clauses.join(" AND ")}` : "", bindings };
}
```

- [ ] **Step 4: Verify filter helper tests pass**

Run:

```bash
npm run test -- tests/api/reportRepository.test.ts
```

Expected: PASS after `projectIncome()` is implemented in Task 3.

---

## Task 3: Add Operating Report Queries

**Files:**

- Modify: `src/repositories/reportRepository.ts`
- Test: `tests/api/reportRepository.test.ts`

- [ ] **Step 1: Write failing repository tests for operating reports**

Add tests:

```ts
it("returns project income grouped by project merchant period and currency", async () => {
  const rows = [{ period: "2026-04", project_id: "proj_1", merchant_id: "merchant_1", currency_code: "USDT", income_amount_minor: 10000 }];
  let sql = "";
  const repo = new ReportRepository(mockDb(rows, (value) => (sql = value)));

  await expect(repo.projectIncome({ period: "2026-04" })).resolves.toEqual(rows);

  const normalized = normalizeSql(sql);
  expect(normalized).toContain("from account_entries ae");
  expect(normalized).toContain("join documents d on d.id = ae.document_id");
  expect(normalized).toContain("d.document_type = 'project_income'");
  expect(normalized).toContain("d.status = 'approved'");
  expect(normalized).toContain("group by d.period, d.project_id, d.merchant_id, d.category_id, ae.currency_code");
});

it("returns expense detail rows from petty cash reimbursements and loan writeoffs", async () => {
  const rows = [{ document_id: "doc_expense", document_type: "petty_cash_reimbursement", amount_minor: 12000 }];
  let sql = "";
  const repo = new ReportRepository(mockDb(rows, (value) => (sql = value)));

  await expect(repo.expenseDetails({ period: "2026-04" })).resolves.toEqual(rows);

  const normalized = normalizeSql(sql);
  expect(normalized).toContain("petty_cash_reimbursement");
  expect(normalized).toContain("pending_cost_applications");
  expect(normalized).toContain("loan_writeoff");
  expect(normalized).toContain("union all");
});
```

- [ ] **Step 2: Implement `projectIncome()` and `merchantIncome()`**

Add methods:

```ts
projectIncome(filters: ReportFilters = {}): Promise<ProjectIncomeRow[]> {
  const filter = this.documentFilterSql(filters, "d", "ae");
  return all<ProjectIncomeRow>(
    this.db
      .prepare(`
        SELECT
          d.period AS period,
          d.project_id AS project_id,
          d.merchant_id AS merchant_id,
          d.category_id AS category_id,
          ae.currency_code AS currency_code,
          COALESCE(SUM(ae.amount_minor), 0) AS income_amount_minor,
          COALESCE(SUM(CASE WHEN ae.currency_code = 'USDT' THEN ae.amount_minor ELSE 0 END), 0) AS income_usdt_minor
        FROM account_entries ae
        JOIN documents d ON d.id = ae.document_id
        WHERE d.status = 'approved'
          AND d.document_type = 'project_income'
          ${filter.sql}
        GROUP BY d.period, d.project_id, d.merchant_id, d.category_id, ae.currency_code
        ORDER BY d.period DESC, d.project_id, d.merchant_id, ae.currency_code
      `)
      .bind(...filter.bindings)
  );
}

merchantIncome(filters: ReportFilters = {}): Promise<MerchantIncomeRow[]> {
  const filter = this.documentFilterSql(filters, "d", "ae");
  return all<MerchantIncomeRow>(
    this.db
      .prepare(`
        SELECT
          d.period AS period,
          d.project_id AS project_id,
          d.merchant_id AS merchant_id,
          ae.currency_code AS currency_code,
          COALESCE(SUM(ae.amount_minor), 0) AS income_amount_minor,
          COALESCE(SUM(CASE WHEN ae.currency_code = 'USDT' THEN ae.amount_minor ELSE 0 END), 0) AS income_usdt_minor
        FROM account_entries ae
        JOIN documents d ON d.id = ae.document_id
        WHERE d.status = 'approved'
          AND d.document_type = 'project_income'
          AND d.merchant_id IS NOT NULL
          ${filter.sql}
        GROUP BY d.period, d.project_id, d.merchant_id, ae.currency_code
        ORDER BY d.period DESC, d.project_id, d.merchant_id, ae.currency_code
      `)
      .bind(...filter.bindings)
  );
}
```

- [ ] **Step 3: Implement expense CTE method body**

Add `expenseDetails(filters)` using this SQL shape:

```sql
WITH petty_cash_expense AS (
  SELECT
    d.id AS document_id,
    d.document_type AS document_type,
    d.period AS period,
    d.business_date AS business_date,
    d.project_id AS project_id,
    d.merchant_id AS merchant_id,
    d.category_id AS category_id,
    dl.person_id AS person_id,
    NULL AS borrower_person_id,
    dl.currency_code AS currency_code,
    dl.amount_minor AS amount_minor,
    COALESCE(SUM(lm.usdt_cost_minor), 0) + COALESCE(SUM(pca.usdt_cost_minor), 0) AS matched_usdt_cost_minor,
    COALESCE(MAX(pcm.remaining_amount_minor), 0) AS pending_amount_minor,
    CASE WHEN COALESCE(MAX(pcm.remaining_amount_minor), 0) > 0 THEN 'incomplete' ELSE 'complete' END AS cost_status
  FROM documents d
  JOIN document_lines dl ON dl.document_id = d.id
  LEFT JOIN lot_movements lm ON lm.document_id = d.id AND lm.movement_type = 'petty_cash_reimbursement'
  LEFT JOIN pending_cost_matches pcm ON pcm.document_id = d.id
  LEFT JOIN pending_cost_applications pca ON pca.pending_cost_match_id = pcm.id
  WHERE d.status = 'approved'
    AND d.document_type = 'petty_cash_reimbursement'
  GROUP BY d.id, d.document_type, d.period, d.business_date, d.project_id, d.merchant_id, d.category_id, dl.person_id, dl.currency_code, dl.amount_minor
),
loan_writeoff_expense AS (
  SELECT
    d.id AS document_id,
    d.document_type AS document_type,
    d.period AS period,
    d.business_date AS business_date,
    d.project_id AS project_id,
    d.merchant_id AS merchant_id,
    d.category_id AS category_id,
    NULL AS person_id,
    li.borrower_person_id AS borrower_person_id,
    li.currency_code AS currency_code,
    COALESCE(SUM(la.amount_minor), 0) AS amount_minor,
    COALESCE(SUM(la.usdt_cost_minor), 0) AS matched_usdt_cost_minor,
    0 AS pending_amount_minor,
    'complete' AS cost_status
  FROM loan_allocations la
  JOIN loan_items li ON li.id = la.loan_item_id
  JOIN documents d ON d.id = la.document_id
  WHERE d.status = 'approved'
    AND d.document_type = 'loan_writeoff'
    AND la.allocation_type = 'writeoff'
    AND NOT EXISTS (
      SELECT 1 FROM documents reversal
      WHERE reversal.original_document_id = d.id
        AND reversal.action_type = 'reversal'
        AND reversal.status = 'approved'
    )
  GROUP BY d.id, d.document_type, d.period, d.business_date, d.project_id, d.merchant_id, d.category_id, li.borrower_person_id, li.currency_code
)
SELECT * FROM petty_cash_expense
UNION ALL
SELECT * FROM loan_writeoff_expense
ORDER BY business_date DESC, document_id
```

After adding the base query, apply the same filter intent inside both CTEs:

- `period` filters `d.period`.
- `projectId` filters `d.project_id`.
- `merchantId` filters `d.merchant_id`.
- `personId` filters petty cash `dl.person_id` and loan writeoff `li.borrower_person_id`.
- `currencyCode` filters `dl.currency_code` and `li.currency_code`.

- [ ] **Step 4: Implement `expenseSummary()`, `projectProfitLoss()`, and `monthlyOperatingSummary()`**

Use `expenseDetails()` CTE logic as the source expression and aggregate:

```ts
expenseSummary(filters: ReportFilters = {}): Promise<ExpenseSummaryRow[]> {
  // group by period, project_id, category_id, person_id, currency_code
}

projectProfitLoss(filters: ReportFilters = {}): Promise<ProjectProfitLossRow[]> {
  // income CTE from projectIncome source
  // expense CTE from expenseDetails source
  // net_usdt_minor = income_usdt_minor - expense_usdt_minor
}

monthlyOperatingSummary(filters: ReportFilters = {}): Promise<MonthlyOperatingSummaryRow[]> {
  // group projectProfitLoss rows by period
}
```

Do not call repository methods from inside repository methods because each method should issue one SQL query for predictable D1 behavior. Share SQL fragments through private helper functions that return `{ sql, bindings }`.

- [ ] **Step 5: Verify operating report tests**

Run:

```bash
npm run test -- tests/api/reportRepository.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/repositories/reportRepository.ts tests/api/reportRepository.test.ts
git commit -m "feat: add operating report queries"
```

---

## Task 4: Add Exception Check Queries

**Files:**

- Modify: `src/repositories/reportRepository.ts`
- Test: `tests/api/reportRepository.test.ts`

- [ ] **Step 1: Add row type and failing test**

Add type:

```ts
export interface ExceptionCheckRow {
  exception_type: string;
  severity: "info" | "warning" | "critical";
  entity_type: string;
  entity_id: string;
  period: string | null;
  business_date: string | null;
  currency_code: string | null;
  amount_minor: number | null;
  usdt_cost_minor: number | null;
  message: string;
}
```

Add test:

```ts
it("returns formal exception checks from approved balances and workflow aging", async () => {
  const rows = [{ exception_type: "pending_cost", severity: "warning", entity_id: "pending_1" }];
  let sql = "";
  const repo = new ReportRepository(mockDb(rows, (value) => (sql = value)));

  await expect(repo.exceptionChecks({ staleDays: 30 })).resolves.toEqual(rows);

  const normalized = normalizeSql(sql);
  expect(normalized).toContain("pending_cost");
  expect(normalized).toContain("negative_petty_cash");
  expect(normalized).toContain("negative_company_account");
  expect(normalized).toContain("stale_pending_document");
  expect(normalized).toContain("stale_draft_document");
  expect(normalized).toContain("stale_loan");
});
```

- [ ] **Step 2: Implement `exceptionChecks()`**

Add method:

```ts
exceptionChecks(filters: ReportFilters = {}): Promise<ExceptionCheckRow[]> {
  const staleDays = Number.isSafeInteger(filters.staleDays) && filters.staleDays && filters.staleDays > 0 ? filters.staleDays : 30;
  return all<ExceptionCheckRow>(
    this.db
      .prepare(`
        SELECT 'pending_cost' AS exception_type, 'warning' AS severity,
               'pending_cost_match' AS entity_type, pcm.id AS entity_id,
               d.period AS period, pcm.expense_date AS business_date,
               pcm.currency_code AS currency_code, pcm.remaining_amount_minor AS amount_minor,
               NULL AS usdt_cost_minor,
               '费用存在待匹配 USDT 成本' AS message
        FROM pending_cost_matches pcm
        JOIN documents d ON d.id = pcm.document_id
        WHERE d.status = 'approved'
          AND pcm.status IN ('open', 'partial')
          AND pcm.remaining_amount_minor > 0

        UNION ALL

        SELECT 'negative_petty_cash', 'warning',
               'person', ae.account_id || ':' || COALESCE(dl.person_id, ''),
               d.period, d.business_date, ae.currency_code, SUM(ae.amount_minor), NULL,
               '人员备用金为负，可能存在垫付'
        FROM account_entries ae
        JOIN documents d ON d.id = ae.document_id
        JOIN document_lines dl ON dl.document_id = d.id
        WHERE d.status = 'approved'
          AND d.document_type IN ('petty_cash_issue', 'petty_cash_return', 'petty_cash_reimbursement')
        GROUP BY ae.account_id, dl.person_id, ae.currency_code
        HAVING SUM(ae.amount_minor) < 0

        UNION ALL

        SELECT 'negative_company_account', 'critical',
               'account', ae.account_id,
               NULL, NULL, ae.currency_code, SUM(ae.amount_minor), NULL,
               '公司账户余额为负'
        FROM account_entries ae
        JOIN documents d ON d.id = ae.document_id
        JOIN accounts a ON a.id = ae.account_id
        WHERE d.status = 'approved'
          AND a.is_company_account = 1
          AND a.allow_negative = 0
        GROUP BY ae.account_id, ae.currency_code
        HAVING SUM(ae.amount_minor) < 0

        UNION ALL

        SELECT 'stale_pending_document', 'warning',
               'document', d.id,
               d.period, d.business_date, NULL, NULL, NULL,
               '单据长期停留在待审核'
        FROM documents d
        WHERE d.status = 'pending'
          AND julianday('now') - julianday(d.created_at) >= ?

        UNION ALL

        SELECT 'stale_draft_document', 'info',
               'document', d.id,
               d.period, d.business_date, NULL, NULL, NULL,
               '草稿长期未提交'
        FROM documents d
        WHERE d.status = 'draft'
          AND julianday('now') - julianday(d.created_at) >= ?

        UNION ALL

        SELECT 'stale_loan', 'warning',
               'loan_item', li.id,
               d.period, li.loan_date, li.currency_code,
               li.remaining_amount_minor, li.remaining_usdt_cost_minor,
               '借款长期未收回'
        FROM loan_items li
        JOIN documents d ON d.id = li.source_document_id
        WHERE d.status = 'approved'
          AND li.status IN ('open', 'partial')
          AND li.remaining_amount_minor > 0
          AND julianday('now') - julianday(li.loan_date) >= ?
        ORDER BY severity DESC, exception_type, business_date
      `)
      .bind(staleDays, staleDays, staleDays)
  );
}
```

- [ ] **Step 3: Verify exception tests**

Run:

```bash
npm run test -- tests/api/reportRepository.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/repositories/reportRepository.ts tests/api/reportRepository.test.ts
git commit -m "feat: add exception check report"
```

---

## Task 5: Expose Formal Report API Endpoints

**Files:**

- Modify: `src/api/reports.ts`
- Modify: `src/worker/router.ts`
- Test: `tests/api/reports.test.ts`

- [ ] **Step 1: Write failing API tests**

Add imports in `tests/api/reports.test.ts`:

```ts
import {
  exceptionChecks,
  expenseDetails,
  expenseSummary,
  merchantIncome,
  monthlyOperatingSummary,
  projectIncome,
  projectProfitLoss
} from "../../src/api/reports";
```

Add tests:

```ts
it.each([
  ["project income", projectIncome, "/api/reports/project-income?period=2026-04&projectId=proj_1"],
  ["merchant income", merchantIncome, "/api/reports/merchant-income?period=2026-04"],
  ["expense details", expenseDetails, "/api/reports/expense-details?period=2026-04"],
  ["expense summary", expenseSummary, "/api/reports/expense-summary?period=2026-04"],
  ["project profit loss", projectProfitLoss, "/api/reports/project-profit-loss?period=2026-04"],
  ["monthly operating", monthlyOperatingSummary, "/api/reports/monthly-operating?period=2026-04"],
  ["exception checks", exceptionChecks, "/api/reports/exception-checks?staleDays=45"]
])("returns %s from formal report handler", async (_label, handler, path) => {
  const rows = [{ id: "row_1" }];
  const response = await handler({
    request: new Request(`https://ledger.test${path}`),
    env: mockEnv(rows),
    params: {}
  });

  expect(response.status).toBe(200);
  await expect(response.json()).resolves.toEqual({ data: rows });
});
```

Extend route tests with:

```ts
"/api/reports/project-income",
"/api/reports/merchant-income",
"/api/reports/expense-details",
"/api/reports/expense-summary",
"/api/reports/project-profit-loss",
"/api/reports/monthly-operating",
"/api/reports/exception-checks"
```

- [ ] **Step 2: Implement filter parser**

In `src/api/reports.ts`, add:

```ts
function reportFiltersFromRequest(request: Request) {
  const search = new URL(request.url).searchParams;
  const staleDaysText = search.get("staleDays")?.trim() ?? "";
  const staleDays = staleDaysText ? Number(staleDaysText) : undefined;
  return {
    period: optionalParam(search.get("period")),
    projectId: optionalParam(search.get("projectId")),
    merchantId: optionalParam(search.get("merchantId")),
    personId: optionalParam(search.get("personId")),
    currencyCode: optionalParam(search.get("currencyCode"))?.toUpperCase(),
    staleDays: Number.isSafeInteger(staleDays) && staleDays && staleDays > 0 ? staleDays : undefined
  };
}

function optionalParam(value: string | null) {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : undefined;
}
```

- [ ] **Step 3: Implement handlers**

Add:

```ts
export const projectIncome: Handler = async ({ request, env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.projectIncome(reportFiltersFromRequest(request)) });
};

export const merchantIncome: Handler = async ({ request, env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.merchantIncome(reportFiltersFromRequest(request)) });
};

export const expenseDetails: Handler = async ({ request, env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.expenseDetails(reportFiltersFromRequest(request)) });
};

export const expenseSummary: Handler = async ({ request, env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.expenseSummary(reportFiltersFromRequest(request)) });
};

export const projectProfitLoss: Handler = async ({ request, env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.projectProfitLoss(reportFiltersFromRequest(request)) });
};

export const monthlyOperatingSummary: Handler = async ({ request, env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.monthlyOperatingSummary(reportFiltersFromRequest(request)) });
};

export const exceptionChecks: Handler = async ({ request, env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.exceptionChecks(reportFiltersFromRequest(request)) });
};
```

- [ ] **Step 4: Register routes**

In `src/worker/router.ts`, import the new handlers and add:

```ts
defineRoute("GET", "/api/reports/project-income", projectIncome),
defineRoute("GET", "/api/reports/merchant-income", merchantIncome),
defineRoute("GET", "/api/reports/expense-details", expenseDetails),
defineRoute("GET", "/api/reports/expense-summary", expenseSummary),
defineRoute("GET", "/api/reports/project-profit-loss", projectProfitLoss),
defineRoute("GET", "/api/reports/monthly-operating", monthlyOperatingSummary),
defineRoute("GET", "/api/reports/exception-checks", exceptionChecks),
```

- [ ] **Step 5: Verify API tests**

Run:

```bash
npm run test -- tests/api/reports.test.ts tests/api/reportRepository.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/api/reports.ts src/worker/router.ts tests/api/reports.test.ts
git commit -m "feat: expose formal report endpoints"
```

---

## Task 6: Refactor Report Page Into Grouped Formal UI

**Files:**

- Create: `src/app/pages/reports/reportTypes.ts`
- Create: `src/app/pages/reports/reportFilters.ts`
- Create: `src/app/pages/reports/reportFormat.ts`
- Create: `src/app/pages/reports/ReportTable.tsx`
- Create: `src/app/pages/reports/reportGroups.tsx`
- Create: `src/app/pages/reports/reportFilters.test.ts`
- Modify: `src/app/pages/ReportsPage.tsx`
- Modify: `src/app/styles.css`

- [ ] **Step 1: Add filter query tests**

Create `src/app/pages/reports/reportFilters.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildReportQuery } from "./reportFilters";

describe("buildReportQuery", () => {
  it("omits empty filters and encodes non-empty report filters", () => {
    expect(
      buildReportQuery({
        period: "2026-04",
        projectId: "proj 1",
        merchantId: "",
        personId: " person_1 ",
        currencyCode: " usdt ",
        staleDays: "45"
      })
    ).toBe("?period=2026-04&projectId=proj+1&personId=person_1&currencyCode=USDT&staleDays=45");
  });
});
```

- [ ] **Step 2: Add filter helper**

Create `src/app/pages/reports/reportFilters.ts`:

```ts
export interface ReportFilterState {
  period: string;
  projectId: string;
  merchantId: string;
  personId: string;
  currencyCode: string;
  staleDays: string;
}

export const defaultReportFilters: ReportFilterState = {
  period: "",
  projectId: "",
  merchantId: "",
  personId: "",
  currencyCode: "",
  staleDays: "30"
};

export function buildReportQuery(filters: ReportFilterState) {
  const params = new URLSearchParams();
  append(params, "period", filters.period);
  append(params, "projectId", filters.projectId);
  append(params, "merchantId", filters.merchantId);
  append(params, "personId", filters.personId);
  append(params, "currencyCode", filters.currencyCode.toUpperCase());
  append(params, "staleDays", filters.staleDays);
  const query = params.toString();
  return query ? `?${query}` : "";
}

function append(params: URLSearchParams, key: string, value: string) {
  const trimmed = value.trim();
  if (trimmed) params.set(key, trimmed);
}
```

- [ ] **Step 3: Add shared UI types and format helpers**

Create `src/app/pages/reports/reportTypes.ts` with interfaces matching the API row names from Tasks 2-4 plus existing report row types.

Create `src/app/pages/reports/reportFormat.ts`:

```ts
export function formatMinor(value: number | null | undefined) {
  if (value == null) return "-";
  return new Intl.NumberFormat("zh-CN").format(value);
}

export function formatOptional(value: string | null | undefined) {
  return value || "-";
}
```

- [ ] **Step 4: Add reusable report table**

Create `src/app/pages/reports/ReportTable.tsx`:

```tsx
import type { ReactNode } from "react";

export interface ReportColumn<T> {
  key: string;
  header: string;
  className?: string;
  render: (row: T) => ReactNode;
}

export function ReportTable<T>({
  title,
  rows,
  rowKey,
  columns,
  emptyLabel
}: {
  title: string;
  rows: T[];
  rowKey: (row: T) => string;
  columns: ReportColumn<T>[];
  emptyLabel: string;
}) {
  return (
    <section className="panel report-panel">
      <div className="panel-header">
        <h2>{title}</h2>
        <div className="status-slot">{rows.length} 条</div>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key} className={column.className}>
                  {column.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length > 0 ? (
              rows.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((column) => (
                    <td key={column.key} className={column.className}>
                      {column.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={columns.length} className="empty-cell">
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
```

- [ ] **Step 5: Add grouped report renderers**

Create `src/app/pages/reports/reportGroups.tsx`. Start with the project profit/loss table below:

```tsx
import { ReportTable } from "./ReportTable";
import { formatMinor, formatOptional } from "./reportFormat";
import type { ReportsState } from "./reportTypes";

export function OperatingReports({ reports, emptyLabel }: { reports: ReportsState; emptyLabel: string }) {
  return (
    <div className="report-group">
      <h2 className="report-group-title">经营分析</h2>
      <ReportTable
        title="项目收支表"
        rows={reports.projectProfitLoss}
        rowKey={(row) => `${row.period}-${row.project_id ?? "none"}`}
        emptyLabel={emptyLabel}
        columns={[
          { key: "period", header: "期间", render: (row) => <span className="mono">{row.period}</span> },
          { key: "project", header: "项目ID", render: (row) => <span className="mono">{formatOptional(row.project_id)}</span> },
          { key: "income", header: "收入USDT", className: "number-cell", render: (row) => formatMinor(row.income_usdt_minor) },
          { key: "expense", header: "费用USDT", className: "number-cell", render: (row) => formatMinor(row.expense_usdt_minor) },
          { key: "pending", header: "待匹配原币", className: "number-cell", render: (row) => formatMinor(row.pending_expense_minor) },
          { key: "net", header: "净额USDT", className: "number-cell", render: (row) => formatMinor(row.net_usdt_minor) },
          { key: "status", header: "成本状态", render: (row) => <span className="mono">{row.cost_status}</span> }
        ]}
      />
    </div>
  );
}
```

Then add the remaining grouped tables with these exact titles and columns:

| Group | Table title | Row key | Columns |
| --- | --- | --- | --- |
| 经营分析 | 项目收入表 | `period-project_id-merchant_id-category_id-currency_code` | 期间、项目ID、商户ID、分类ID、币种、收入原币、收入USDT |
| 经营分析 | 商户收入表 | `period-project_id-merchant_id-currency_code` | 期间、项目ID、商户ID、币种、收入原币、收入USDT |
| 经营分析 | 费用明细表 | `document_id` | 单据ID、类型、期间、日期、项目ID、商户ID、分类ID、人员ID、借款人ID、币种、费用原币、已匹配USDT、待匹配原币、成本状态 |
| 经营分析 | 费用汇总表 | `period-project_id-category_id-person_id-currency_code` | 期间、项目ID、分类ID、人员ID、币种、费用原币、已匹配USDT、待匹配原币 |
| 经营分析 | 月度经营总表 | `period` | 期间、收入USDT、费用USDT、待匹配原币、净额USDT、成本状态 |
| 资金管理 | 账户余额表 | `account_id-currency_code` | 账户ID、币种、余额 |
| 资金管理 | 换汇批次表 | `id` | 批次ID、币种、账户ID、人员ID、批次日期、剩余金额、剩余USDT成本 |
| 资金管理 | FIFO 消耗明细 | `id` | 流水ID、批次ID、单据ID、类型、日期、金额、USDT成本 |
| 备用金 | 备用金余额表 | `person_id-account_id-currency_code` | 人员ID、账户ID、币种、剩余金额 |
| 备用金 | 待匹配成本表 | `id` | 记录ID、单据ID、人员ID、账户ID、币种、费用日期、状态、剩余金额 |
| 借款 | 借款余额表 | `borrower_person_id-currency_code` | 借款人ID、币种、余额 |
| 借款 | 借款账龄表 | `loan_item_id` | 借款项ID、借款人ID、币种、借款日期、剩余金额、剩余USDT成本、账龄天数 |
| 借款 | 借款明细表 | `allocation_id` | 分摊ID、单据ID、借款项ID、类型、借款人ID、币种、日期、金额、USDT成本 |
| 借款 | 借款核销表 | `document_id-borrower_person_id-currency_code-allocation_date` | 单据ID、借款人ID、项目ID、分类ID、币种、日期、金额、USDT成本 |
| 异常检查 | 异常检查 | `exception_type-entity_type-entity_id` | 类型、级别、对象类型、对象ID、期间、日期、币种、金额、USDT成本、说明 |

Each table must call `ReportTable` with real `columns` entries. Do not keep an empty `columns` array in committed code.

Add these exports after `OperatingReports`:

```tsx

export function FundReports({ reports, emptyLabel }: { reports: ReportsState; emptyLabel: string }) {
  return (
    <div className="report-group">
      <h2 className="report-group-title">资金管理</h2>
      <ReportTable title="账户余额表" rows={reports.accountBalances} rowKey={(row) => `${row.account_id}-${row.currency_code}`} emptyLabel={emptyLabel} columns={accountBalanceColumns} />
      <ReportTable title="换汇批次表" rows={reports.lotBalances} rowKey={(row) => row.id} emptyLabel={emptyLabel} columns={lotBalanceColumns} />
      <ReportTable title="FIFO 消耗明细" rows={reports.lotMovements} rowKey={(row) => row.id} emptyLabel={emptyLabel} columns={lotMovementColumns} />
    </div>
  );
}

export function PettyCashReports({ reports, emptyLabel }: { reports: ReportsState; emptyLabel: string }) {
  return (
    <div className="report-group">
      <h2 className="report-group-title">备用金</h2>
      <ReportTable title="备用金余额表" rows={reports.pettyCashPending} rowKey={(row) => `${row.person_id}-${row.account_id}-${row.currency_code}`} emptyLabel={emptyLabel} columns={pettyCashPendingColumns} />
      <ReportTable title="待匹配成本表" rows={reports.pendingCosts} rowKey={(row) => row.id} emptyLabel={emptyLabel} columns={pendingCostColumns} />
    </div>
  );
}

export function LoanReports({ reports, emptyLabel }: { reports: ReportsState; emptyLabel: string }) {
  return (
    <div className="report-group">
      <h2 className="report-group-title">借款</h2>
      <ReportTable title="借款余额表" rows={reports.loanBalances} rowKey={(row) => `${row.borrower_person_id}-${row.currency_code}`} emptyLabel={emptyLabel} columns={loanBalanceColumns} />
      <ReportTable title="借款账龄表" rows={reports.loanAging} rowKey={(row) => row.loan_item_id} emptyLabel={emptyLabel} columns={loanAgingColumns} />
      <ReportTable title="借款明细表" rows={reports.loanAllocations} rowKey={(row) => row.allocation_id} emptyLabel={emptyLabel} columns={loanAllocationColumns} />
      <ReportTable title="借款核销表" rows={reports.loanWriteoffs} rowKey={(row) => `${row.document_id}-${row.borrower_person_id}-${row.currency_code}-${row.allocation_date}`} emptyLabel={emptyLabel} columns={loanWriteoffColumns} />
    </div>
  );
}

export function ExceptionReports({ reports, emptyLabel }: { reports: ReportsState; emptyLabel: string }) {
  return (
    <div className="report-group">
      <h2 className="report-group-title">异常检查</h2>
      <ReportTable title="异常检查" rows={reports.exceptionChecks} rowKey={(row) => `${row.exception_type}-${row.entity_type}-${row.entity_id}`} emptyLabel={emptyLabel} columns={exceptionCheckColumns} />
    </div>
  );
}
```

- [ ] **Step 6: Update ReportsPage state and fetches**

In `src/app/pages/ReportsPage.tsx`:

- Import `buildReportQuery`, `defaultReportFilters`, report group components, and row types.
- Add filter state:

```ts
const [filters, setFilters] = useState(defaultReportFilters);
const query = buildReportQuery(filters);
```

- Fetch the seven new formal endpoints with `query`:

```ts
getJson<ApiEnvelope<ProjectProfitLoss[]>>(`/api/reports/project-profit-loss${query}`),
getJson<ApiEnvelope<ProjectIncome[]>>(`/api/reports/project-income${query}`),
getJson<ApiEnvelope<MerchantIncome[]>>(`/api/reports/merchant-income${query}`),
getJson<ApiEnvelope<ExpenseDetail[]>>(`/api/reports/expense-details${query}`),
getJson<ApiEnvelope<ExpenseSummary[]>>(`/api/reports/expense-summary${query}`),
getJson<ApiEnvelope<MonthlyOperatingSummary[]>>(`/api/reports/monthly-operating${query}`),
getJson<ApiEnvelope<ExceptionCheck[]>>(`/api/reports/exception-checks${query}`)
```

- Render a compact filter band:

```tsx
<section className="panel">
  <div className="report-filter-grid">
    <label>期间<input value={filters.period} onChange={(event) => setFilters((current) => ({ ...current, period: event.target.value }))} /></label>
    <label>项目ID<input value={filters.projectId} onChange={(event) => setFilters((current) => ({ ...current, projectId: event.target.value }))} /></label>
    <label>商户ID<input value={filters.merchantId} onChange={(event) => setFilters((current) => ({ ...current, merchantId: event.target.value }))} /></label>
    <label>人员ID<input value={filters.personId} onChange={(event) => setFilters((current) => ({ ...current, personId: event.target.value }))} /></label>
    <label>币种<input value={filters.currencyCode} onChange={(event) => setFilters((current) => ({ ...current, currencyCode: event.target.value }))} /></label>
    <label>异常天数<input value={filters.staleDays} onChange={(event) => setFilters((current) => ({ ...current, staleDays: event.target.value }))} /></label>
  </div>
</section>
```

- Replace the flat list with:

```tsx
<OperatingReports reports={reports} emptyLabel={rowLabel} />
<FundReports reports={reports} emptyLabel={rowLabel} />
<PettyCashReports reports={reports} emptyLabel={rowLabel} />
<LoanReports reports={reports} emptyLabel={rowLabel} />
<ExceptionReports reports={reports} emptyLabel={rowLabel} />
```

- [ ] **Step 7: Add CSS**

In `src/app/styles.css`, add:

```css
.report-filter-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  padding: 16px;
}

.report-filter-grid label {
  display: grid;
  gap: 6px;
  color: #475467;
  font-size: 12px;
  font-weight: 700;
}

.report-group {
  display: grid;
  gap: 12px;
}

.report-group-title {
  padding: 4px 2px;
}

.report-panel table {
  min-width: 760px;
}
```

- [ ] **Step 8: Verify frontend tests and build**

Run:

```bash
npm run test -- src/app/pages/reports/reportFilters.test.ts src/app/pages/DocumentsPage.test.ts
npm run build
```

Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/app/pages/ReportsPage.tsx src/app/pages/reports src/app/styles.css
git commit -m "feat: group formal reports in UI"
```

---

## Task 7: Full Verification and Browser Smoke

**Files:**

- No source files unless verification exposes a defect.

- [ ] **Step 1: Run full tests**

```bash
npm run test
```

Expected: all test files pass.

- [ ] **Step 2: Run typecheck**

```bash
npx tsc --noEmit
```

Expected: no output and exit code 0.

- [ ] **Step 3: Run build**

```bash
npm run build
```

Expected: Vite build succeeds.

- [ ] **Step 4: Apply local migrations**

```bash
npm run db:migrate:local
```

Expected: migration applies or reports no migrations to apply.

- [ ] **Step 5: API smoke**

Run:

```bash
curl -sS -i 'http://127.0.0.1:8787/api/reports/project-profit-loss?period=2026-04' | sed -n '1,8p'
curl -sS -i 'http://127.0.0.1:8787/api/reports/expense-details?period=2026-04' | sed -n '1,8p'
curl -sS -i 'http://127.0.0.1:8787/api/reports/exception-checks?staleDays=30' | sed -n '1,8p'
```

Expected: each response starts with `HTTP/1.1 200 OK` and returns JSON.

- [ ] **Step 6: Browser smoke**

Use the in-app browser at `http://127.0.0.1:8787/`.

Verify:

- Report center opens without a console error.
- The page shows group headings:
  - `经营分析`
  - `资金管理`
  - `备用金`
  - `借款`
  - `异常检查`
- The filter fields render and do not overlap on desktop width.
- At least these tables are visible:
  - `项目收支表`
  - `费用明细表`
  - `月度经营总表`
  - `异常检查`

- [ ] **Step 7: Final commit if verification fixes were needed**

If Step 1-6 required fixes, commit them:

```bash
git add -A
git commit -m "fix: stabilize formal report center"
```

If no fixes were needed, do not create an empty commit.

## Self-Review

- Spec coverage: The plan covers formal reports from Section 9.1-9.5 and explicitly leaves export/charts/permissions/import out of scope.
- Placeholder scan: No task contains placeholder work; each task has concrete files, tests, commands, and expected behavior.
- Type consistency: `ReportFilters`, row interfaces, handler names, endpoint names, and UI query helpers are defined before later tasks use them.
- Data gap addressed: pending-cost application attribution is added before formal expense reports so later USDT cost matching can be reported accurately.
