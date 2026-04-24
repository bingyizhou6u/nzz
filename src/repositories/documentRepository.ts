import { all, first, newId, nowIso, run } from "./db";
import type { ActionType, DocumentStatus, DocumentType } from "../domain/types";
import type { NormalizedDocumentLine } from "../domain/documentLines";
import type {
  LotCreationEffect,
  LotMovementEffect,
  LotUpdateEffect,
  PendingCostCreationEffect,
  PendingCostUpdateEffect
} from "../domain/fifoEffects";
import type { LoanAllocationEffect, LoanItemCreationEffect, LoanItemUpdateEffect } from "../domain/loanEffects";

export interface CreateDocumentInput {
  documentType: DocumentType;
  actionType: ActionType;
  businessDate: string;
  period: string;
  operatorPersonId?: string | null;
  projectId?: string | null;
  merchantId?: string | null;
  categoryId?: string | null;
  originalDocumentId?: string | null;
  summary: string;
  createdBy: string;
}

export interface CreateDocumentWithLinesInput extends CreateDocumentInput {
  lines: NormalizedDocumentLine[];
}

export interface ApproveDocumentWithPostingsInput {
  documentId: string;
  period: string;
  reviewer: string;
  accountEntries: Array<{ accountId: string; currencyCode: string; amountMinor: number; entryDate: string }>;
  loanEntries: LoanEntryInput[];
  lotCreations?: LotCreationEffect[];
  lotUpdates?: LotUpdateEffect[];
  lotMovements?: LotMovementEffect[];
  pendingCostCreations?: PendingCostCreationEffect[];
  pendingCostUpdates?: PendingCostUpdateEffect[];
  loanItemCreations?: LoanItemCreationEffect[];
  loanItemUpdates?: LoanItemUpdateEffect[];
  loanAllocations?: LoanAllocationEffect[];
  reversalOriginalDocumentId?: string | null;
  auditLogStatement: D1PreparedStatement;
  reviewedAt?: string;
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

export interface LoanItemReversalRow {
  id: string;
  original_amount_minor: number;
  remaining_amount_minor: number;
  original_usdt_cost_minor: number;
  remaining_usdt_cost_minor: number;
}

export interface LoanAllocationReversalRow {
  loan_item_id: string;
  allocation_type: string;
  amount_minor: number;
  usdt_cost_minor: number;
  created_at: string;
}

export interface AccountEntryReversalRow {
  account_id: string;
  currency_code: string;
  amount_minor: number;
}

export interface LoanEntryReversalRow {
  borrower_person_id: string;
  currency_code: string;
  amount_minor: number;
  usdt_cost_minor: number | null;
}

export interface LoanEntryInput {
  borrowerPersonId: string;
  currencyCode: string;
  amountMinor: number;
  usdtCostMinor: number | null;
  entryDate: string;
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

type ApprovalStatementRole =
  | "write"
  | "lot_conflict_guard"
  | "lot_update"
  | "pending_cost_conflict_guard"
  | "pending_cost_update"
  | "loan_item_conflict_guard"
  | "loan_item_update"
  | "approval";

export class DocumentRepository {
  constructor(private readonly db: D1Database) {}

  async createDraft(input: CreateDocumentInput): Promise<{ id: string; documentNo: string; status: DocumentStatus }> {
    const id = newId("doc");
    const documentNo = newId("docno");
    await run(this.prepareDraftInsert(input, id, documentNo, nowIso()));
    return { id, documentNo, status: "draft" };
  }

  async createDraftWithLines(
    input: CreateDocumentWithLinesInput
  ): Promise<{ id: string; documentNo: string; status: DocumentStatus }> {
    const document = { id: newId("doc"), documentNo: newId("docno"), status: "draft" as DocumentStatus };
    await this.runBatch([
      this.prepareDraftInsert(input, document.id, document.documentNo, nowIso()),
      ...input.lines.map((line) =>
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
      )
    ]);
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
    await run(
      this.db
        .prepare(
          `UPDATE documents
           SET status = 'pending', submitted_at = ?, reject_reason = NULL
           WHERE id = ? AND status IN ('draft', 'rejected')`
        )
        .bind(submittedAt, id)
    );
  }

  async markRejected(id: string, reason: string) {
    await run(
      this.db
        .prepare(`UPDATE documents SET status = 'rejected', reject_reason = ? WHERE id = ? AND status = 'pending'`)
        .bind(reason, id)
    );
  }

  async markApproved(id: string, reviewer: string, reviewedAt = nowIso()) {
    await run(
      this.db
        .prepare(
          `UPDATE documents
           SET status = 'approved', reviewed_by = ?, reviewed_at = ?, reject_reason = NULL
           WHERE id = ? AND status = 'pending'`
        )
        .bind(reviewer, reviewedAt, id)
    );
  }

  isPeriodLocked(period: string): Promise<{ period: string } | null> {
    return first<{ period: string }>(this.db.prepare(`SELECT period FROM period_locks WHERE period = ?`).bind(period));
  }

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
            AND current_person_id IS ?
          ORDER BY lot_date, id
        `)
        .bind(input.accountId, input.currencyCode, input.personId ?? null)
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
          SELECT borrower_person_id, currency_code, amount_minor, usdt_cost_minor
          FROM loan_entries
          WHERE document_id = ?
          ORDER BY created_at, id
        `)
        .bind(documentId)
    );
  }

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
            AND created_at >= (
              SELECT COALESCE(MAX(created_at), '')
              FROM lot_movements
              WHERE document_id = ?
            )
          ORDER BY lot_id
        `)
        .bind(...input.lotIds, input.originalDocumentId, input.originalDocumentId)
    );
  }

  async insertAccountEntries(
    documentId: string,
    entries: Array<{ accountId: string; currencyCode: string; amountMinor: number; entryDate: string }>
  ) {
    await this.runBatch(
      entries.map((entry) =>
        this.db
          .prepare(
            `INSERT INTO account_entries (id, document_id, account_id, currency_code, amount_minor, entry_date, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(newId("acct_entry"), documentId, entry.accountId, entry.currencyCode, entry.amountMinor, entry.entryDate, nowIso())
      )
    );
  }

  async insertLoanEntries(
    documentId: string,
    entries: LoanEntryInput[]
  ) {
    await this.runBatch(
      entries.map((entry) =>
        this.db
          .prepare(
            `INSERT INTO loan_entries (
               id, document_id, borrower_person_id, currency_code,
               amount_minor, usdt_cost_minor, entry_date, created_at
             )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(
            newId("loan_entry"),
            documentId,
            entry.borrowerPersonId,
            entry.currencyCode,
            entry.amountMinor,
            entry.usdtCostMinor,
            entry.entryDate,
            nowIso()
          )
      )
    );
  }

  async approveWithPostings(input: ApproveDocumentWithPostingsInput): Promise<void> {
    const reversalOriginalDocumentId = input.reversalOriginalDocumentId?.trim() || null;
    const createdLotIds = new Map<string, string>();
    for (const lotCreation of input.lotCreations ?? []) {
      createdLotIds.set(lotCreation.clientLotId, newId("lot"));
    }
    const createdLoanItemIds = new Map<string, string>();
    for (const loanItemCreation of input.loanItemCreations ?? []) {
      createdLoanItemIds.set(loanItemCreation.clientLoanItemId, newId("loan_item"));
    }

    const statements: D1PreparedStatement[] = [];
    const statementRoles: ApprovalStatementRole[] = [];
    const addStatement = (statement: D1PreparedStatement, role: ApprovalStatementRole) => {
      statements.push(statement);
      statementRoles.push(role);
    };

    for (const entry of input.accountEntries) {
      addStatement(this.prepareConditionalAccountEntry(input.documentId, input.period, entry, reversalOriginalDocumentId), "write");
    }
    for (const entry of input.loanEntries) {
      addStatement(this.prepareConditionalLoanEntry(input.documentId, input.period, entry, reversalOriginalDocumentId), "write");
    }
    for (const loanItemCreation of input.loanItemCreations ?? []) {
      const loanItemId = createdLoanItemIds.get(loanItemCreation.clientLoanItemId);
      if (!loanItemId) {
        throw new Error("Loan item creation id was not prepared");
      }
      addStatement(
        this.prepareConditionalLoanItemCreation(input.documentId, input.period, loanItemCreation, loanItemId, reversalOriginalDocumentId),
        "write"
      );
    }
    for (const loanItemUpdate of input.loanItemUpdates ?? []) {
      addStatement(
        this.prepareLoanItemConflictGuard(input.documentId, input.period, loanItemUpdate, reversalOriginalDocumentId),
        "loan_item_conflict_guard"
      );
      addStatement(
        this.prepareConditionalLoanItemUpdate(input.documentId, input.period, loanItemUpdate, reversalOriginalDocumentId),
        "loan_item_update"
      );
    }
    for (const loanAllocation of input.loanAllocations ?? []) {
      const loanItemId = createdLoanItemIds.get(loanAllocation.loanItemId) ?? loanAllocation.loanItemId;
      addStatement(
        this.prepareConditionalLoanAllocation(
          input.documentId,
          input.period,
          loanAllocation,
          loanItemId,
          reversalOriginalDocumentId
        ),
        "write"
      );
    }
    for (const lotCreation of input.lotCreations ?? []) {
      const lotId = createdLotIds.get(lotCreation.clientLotId);
      if (!lotId) {
        throw new Error("Lot creation id was not prepared");
      }
      addStatement(
        this.prepareConditionalLotCreation(input.documentId, input.period, lotCreation, lotId, reversalOriginalDocumentId),
        "write"
      );
    }
    for (const lotUpdate of input.lotUpdates ?? []) {
      addStatement(
        this.prepareLotConflictGuard(input.documentId, input.period, lotUpdate, reversalOriginalDocumentId),
        "lot_conflict_guard"
      );
      addStatement(this.prepareConditionalLotUpdate(input.documentId, input.period, lotUpdate, reversalOriginalDocumentId), "lot_update");
    }
    for (const lotMovement of input.lotMovements ?? []) {
      const lotId = createdLotIds.get(lotMovement.lotId) ?? lotMovement.lotId;
      addStatement(
        this.prepareConditionalLotMovement(input.documentId, input.period, lotMovement, lotId, reversalOriginalDocumentId),
        "write"
      );
    }
    for (const pendingCostCreation of input.pendingCostCreations ?? []) {
      addStatement(
        this.prepareConditionalPendingCostCreation(input.documentId, input.period, pendingCostCreation, reversalOriginalDocumentId),
        "write"
      );
    }
    for (const pendingCostUpdate of input.pendingCostUpdates ?? []) {
      addStatement(
        this.preparePendingCostConflictGuard(input.documentId, input.period, pendingCostUpdate, reversalOriginalDocumentId),
        "pending_cost_conflict_guard"
      );
      addStatement(
        this.prepareConditionalPendingCostUpdate(input.documentId, input.period, pendingCostUpdate, reversalOriginalDocumentId),
        "pending_cost_update"
      );
    }
    addStatement(input.auditLogStatement, "write");
    addStatement(
      this.prepareGuardedApprovalUpdate(
        input.documentId,
        input.period,
        input.reviewer,
        input.reviewedAt ?? nowIso(),
        reversalOriginalDocumentId
      ),
      "approval"
    );

    const results = await this.runBatch(statements, statementRoles);
    const approvalResult = results[statementRoles.lastIndexOf("approval")];
    if (approvalResult?.meta?.changes === 0) {
      throw new Error("Document is not pending or period is locked");
    }

    for (let index = 0; index < results.length; index += 1) {
      if (statementRoles[index] === "lot_update" && results[index]?.meta?.changes === 0) {
        throw new Error("Lot balance changed before approval could be posted");
      }
      if (statementRoles[index] === "pending_cost_update" && results[index]?.meta?.changes === 0) {
        throw new Error("Pending cost balance changed before approval could be posted");
      }
      if (statementRoles[index] === "loan_item_update" && results[index]?.meta?.changes === 0) {
        throw new Error("Loan item balance changed before approval could be posted");
      }
    }
  }

  private prepareDraftInsert(input: CreateDocumentInput, id: string, documentNo: string, createdAt: string): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO documents (
          id, document_no, document_type, action_type, business_date, period,
          operator_person_id, project_id, merchant_id, category_id, summary,
          status, original_document_id, created_by, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?)`
      )
      .bind(
        id,
        documentNo,
        input.documentType,
        input.actionType,
        input.businessDate,
        input.period,
        input.operatorPersonId ?? null,
        input.projectId ?? null,
        input.merchantId ?? null,
        input.categoryId ?? null,
        input.summary,
        input.originalDocumentId ?? null,
        input.createdBy,
        createdAt
      );
  }

  private prepareConditionalAccountEntry(
    documentId: string,
    period: string,
    entry: { accountId: string; currencyCode: string; amountMinor: number; entryDate: string },
    reversalOriginalDocumentId: string | null = null
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO account_entries (id, document_id, account_id, currency_code, amount_minor, entry_date, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?
         WHERE ${this.approvalGuardSql(reversalOriginalDocumentId)}`
      )
      .bind(
        newId("acct_entry"),
        documentId,
        entry.accountId,
        entry.currencyCode,
        entry.amountMinor,
        entry.entryDate,
        nowIso(),
        ...this.approvalGuardBindings(documentId, period, reversalOriginalDocumentId)
      );
  }

  private prepareConditionalLoanEntry(
    documentId: string,
    period: string,
    entry: LoanEntryInput,
    reversalOriginalDocumentId: string | null = null
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO loan_entries (
           id, document_id, borrower_person_id, currency_code,
           amount_minor, usdt_cost_minor, entry_date, created_at
         )
         SELECT ?, ?, ?, ?, ?, ?, ?, ?
         WHERE ${this.approvalGuardSql(reversalOriginalDocumentId)}`
      )
      .bind(
        newId("loan_entry"),
        documentId,
        entry.borrowerPersonId,
        entry.currencyCode,
        entry.amountMinor,
        entry.usdtCostMinor,
        entry.entryDate,
        nowIso(),
        ...this.approvalGuardBindings(documentId, period, reversalOriginalDocumentId)
      );
  }

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

  private prepareLoanItemConflictGuard(
    documentId: string,
    period: string,
    update: LoanItemUpdateEffect,
    reversalOriginalDocumentId: string | null = null
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO account_entries (id, document_id, account_id, currency_code, amount_minor, entry_date, created_at)
         SELECT ?, ?, NULL, ?, 0, ?, ?
         WHERE ${this.approvalGuardSql(reversalOriginalDocumentId)}
           AND NOT EXISTS (
             SELECT 1 FROM loan_items
             WHERE id = ?
               AND remaining_amount_minor = ?
               AND remaining_usdt_cost_minor = ?
               AND remaining_amount_minor + ? >= 0
               AND remaining_usdt_cost_minor + ? >= 0
           )`
      )
      .bind(
        newId("loan_item_conflict_guard"),
        documentId,
        "USDT",
        nowIso(),
        nowIso(),
        ...this.approvalGuardBindings(documentId, period, reversalOriginalDocumentId),
        update.loanItemId,
        update.expectedRemainingAmountMinor,
        update.expectedRemainingUsdtCostMinor,
        update.amountDeltaMinor,
        update.usdtCostDeltaMinor
      );
  }

  private prepareConditionalLoanAllocation(
    documentId: string,
    period: string,
    allocation: LoanAllocationEffect,
    loanItemId: string,
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
        loanItemId,
        allocation.allocationType,
        allocation.amountMinor,
        allocation.usdtCostMinor,
        allocation.allocationDate,
        nowIso(),
        ...this.approvalGuardBindings(documentId, period, reversalOriginalDocumentId)
      );
  }

  private prepareConditionalLotCreation(
    documentId: string,
    period: string,
    lotCreation: LotCreationEffect,
    lotId: string,
    reversalOriginalDocumentId: string | null = null
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO lots (
           id, currency_code, original_amount_minor, remaining_amount_minor,
           original_usdt_cost_minor, remaining_usdt_cost_minor, source_document_id,
           current_account_id, current_person_id, lot_date, status, created_at
         )
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE ${this.approvalGuardSql(reversalOriginalDocumentId)}`
      )
      .bind(
        lotId,
        lotCreation.currencyCode,
        lotCreation.originalAmountMinor,
        lotCreation.remainingAmountMinor,
        lotCreation.originalUsdtCostMinor,
        lotCreation.remainingUsdtCostMinor,
        lotCreation.sourceDocumentId,
        lotCreation.currentAccountId,
        lotCreation.currentPersonId,
        lotCreation.lotDate,
        this.lotStatus(lotCreation.remainingAmountMinor),
        nowIso(),
        ...this.approvalGuardBindings(documentId, period, reversalOriginalDocumentId)
      );
  }

  private prepareConditionalLotUpdate(
    documentId: string,
    period: string,
    lotUpdate: LotUpdateEffect,
    reversalOriginalDocumentId: string | null = null
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `UPDATE lots
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
        lotUpdate.amountDeltaMinor,
        lotUpdate.usdtCostDeltaMinor,
        lotUpdate.amountDeltaMinor,
        lotUpdate.lotId,
        lotUpdate.expectedRemainingAmountMinor,
        lotUpdate.expectedRemainingUsdtCostMinor,
        lotUpdate.amountDeltaMinor,
        lotUpdate.usdtCostDeltaMinor,
        ...this.approvalGuardBindings(documentId, period, reversalOriginalDocumentId)
      );
  }

  private prepareLotConflictGuard(
    documentId: string,
    period: string,
    lotUpdate: LotUpdateEffect,
    reversalOriginalDocumentId: string | null = null
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO account_entries (id, document_id, account_id, currency_code, amount_minor, entry_date, created_at)
         SELECT ?, ?, NULL, ?, 0, ?, ?
         WHERE ${this.approvalGuardSql(reversalOriginalDocumentId)}
           AND NOT EXISTS (
             SELECT 1 FROM lots
             WHERE id = ?
               AND remaining_amount_minor = ?
               AND remaining_usdt_cost_minor = ?
               AND remaining_amount_minor + ? >= 0
               AND remaining_usdt_cost_minor + ? >= 0
           )`
      )
      .bind(
        newId("lot_conflict_guard"),
        documentId,
        "USDT",
        nowIso(),
        nowIso(),
        ...this.approvalGuardBindings(documentId, period, reversalOriginalDocumentId),
        lotUpdate.lotId,
        lotUpdate.expectedRemainingAmountMinor,
        lotUpdate.expectedRemainingUsdtCostMinor,
        lotUpdate.amountDeltaMinor,
        lotUpdate.usdtCostDeltaMinor
      );
  }

  private prepareConditionalLotMovement(
    documentId: string,
    period: string,
    lotMovement: LotMovementEffect,
    lotId: string,
    reversalOriginalDocumentId: string | null = null
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO lot_movements (
           id, lot_id, document_id, movement_type, from_account_id, to_account_id,
           from_person_id, to_person_id, amount_minor, usdt_cost_minor, movement_date, created_at
         )
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE ${this.approvalGuardSql(reversalOriginalDocumentId)}`
      )
      .bind(
        newId("lot_move"),
        lotId,
        documentId,
        lotMovement.movementType,
        lotMovement.fromAccountId,
        lotMovement.toAccountId,
        lotMovement.fromPersonId,
        lotMovement.toPersonId,
        lotMovement.amountMinor,
        lotMovement.usdtCostMinor,
        lotMovement.movementDate,
        nowIso(),
        ...this.approvalGuardBindings(documentId, period, reversalOriginalDocumentId)
      );
  }

  private prepareConditionalPendingCostCreation(
    documentId: string,
    period: string,
    pendingCostCreation: PendingCostCreationEffect,
    reversalOriginalDocumentId: string | null = null
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO pending_cost_matches (
           id, document_id, person_id, account_id, currency_code, amount_minor,
           remaining_amount_minor, expense_date, status, created_at
         )
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE ${this.approvalGuardSql(reversalOriginalDocumentId)}`
      )
      .bind(
        newId("pending_cost"),
        pendingCostCreation.documentId,
        pendingCostCreation.personId,
        pendingCostCreation.accountId,
        pendingCostCreation.currencyCode,
        pendingCostCreation.amountMinor,
        pendingCostCreation.remainingAmountMinor,
        pendingCostCreation.expenseDate,
        this.pendingCostStatus(pendingCostCreation.amountMinor, pendingCostCreation.remainingAmountMinor),
        nowIso(),
        ...this.approvalGuardBindings(documentId, period, reversalOriginalDocumentId)
      );
  }

  private prepareConditionalPendingCostUpdate(
    documentId: string,
    period: string,
    pendingCostUpdate: PendingCostUpdateEffect,
    reversalOriginalDocumentId: string | null = null
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `UPDATE pending_cost_matches
         SET remaining_amount_minor = remaining_amount_minor + ?,
             status = CASE WHEN remaining_amount_minor + ? = 0 THEN 'matched' ELSE 'partial' END
         WHERE id = ?
           AND remaining_amount_minor = ?
           AND remaining_amount_minor + ? >= 0
           AND ${this.approvalGuardSql(reversalOriginalDocumentId)}`
      )
      .bind(
        pendingCostUpdate.amountDeltaMinor,
        pendingCostUpdate.amountDeltaMinor,
        pendingCostUpdate.pendingCostMatchId,
        pendingCostUpdate.expectedRemainingAmountMinor,
        pendingCostUpdate.amountDeltaMinor,
        ...this.approvalGuardBindings(documentId, period, reversalOriginalDocumentId)
      );
  }

  private preparePendingCostConflictGuard(
    documentId: string,
    period: string,
    pendingCostUpdate: PendingCostUpdateEffect,
    reversalOriginalDocumentId: string | null = null
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO account_entries (id, document_id, account_id, currency_code, amount_minor, entry_date, created_at)
         SELECT ?, ?, NULL, ?, 0, ?, ?
         WHERE ${this.approvalGuardSql(reversalOriginalDocumentId)}
           AND NOT EXISTS (
             SELECT 1 FROM pending_cost_matches
             WHERE id = ?
               AND remaining_amount_minor = ?
               AND remaining_amount_minor + ? >= 0
           )`
      )
      .bind(
        newId("pending_cost_conflict_guard"),
        documentId,
        "USDT",
        nowIso(),
        nowIso(),
        ...this.approvalGuardBindings(documentId, period, reversalOriginalDocumentId),
        pendingCostUpdate.pendingCostMatchId,
        pendingCostUpdate.expectedRemainingAmountMinor,
        pendingCostUpdate.amountDeltaMinor
      );
  }

  private prepareGuardedApprovalUpdate(
    documentId: string,
    period: string,
    reviewer: string,
    reviewedAt: string,
    reversalOriginalDocumentId: string | null = null
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `UPDATE documents
         SET status = 'approved', reviewed_by = ?, reviewed_at = ?, reject_reason = NULL
         WHERE id = ?
           AND status = 'pending'
           AND NOT EXISTS (SELECT 1 FROM period_locks WHERE period = ?)
           ${this.duplicateReversalGuardSql(reversalOriginalDocumentId)}`
      )
      .bind(reviewer, reviewedAt, documentId, period, ...this.duplicateReversalGuardBindings(documentId, reversalOriginalDocumentId));
  }

  private approvalGuardSql(reversalOriginalDocumentId: string | null = null) {
    return `EXISTS (
      SELECT 1 FROM documents
      WHERE id = ?
        AND status = 'pending'
        AND NOT EXISTS (SELECT 1 FROM period_locks WHERE period = ?)
        ${this.duplicateReversalGuardSql(reversalOriginalDocumentId)}
    )`;
  }

  private approvalGuardBindings(documentId: string, period: string, reversalOriginalDocumentId: string | null = null): unknown[] {
    return [documentId, period, ...this.duplicateReversalGuardBindings(documentId, reversalOriginalDocumentId)];
  }

  private duplicateReversalGuardSql(reversalOriginalDocumentId: string | null) {
    if (!reversalOriginalDocumentId) return "";
    return `AND NOT EXISTS (
      SELECT 1 FROM documents
      WHERE original_document_id = ?
        AND action_type = 'reversal'
        AND status = 'approved'
        AND id <> ?
    )`;
  }

  private duplicateReversalGuardBindings(documentId: string, reversalOriginalDocumentId: string | null): unknown[] {
    return reversalOriginalDocumentId ? [reversalOriginalDocumentId, documentId] : [];
  }

  private lotStatus(remainingAmountMinor: number): "open" | "closed" {
    return remainingAmountMinor === 0 ? "closed" : "open";
  }

  private loanItemStatus(remainingAmountMinor: number): "open" | "closed" {
    return remainingAmountMinor === 0 ? "closed" : "open";
  }

  private pendingCostStatus(amountMinor: number, remainingAmountMinor: number): "open" | "partial" | "matched" {
    if (remainingAmountMinor === 0) return "matched";
    return remainingAmountMinor < amountMinor ? "partial" : "open";
  }

  private async runBatch(statements: D1PreparedStatement[], statementRoles: ApprovalStatementRole[] = []): Promise<D1Result[]> {
    if (statements.length === 0) return [];

    const results = await this.db.batch(statements);
    for (let index = 0; index < results.length; index += 1) {
      const result = results[index];
      if (!result.success) {
        if (statementRoles[index] === "lot_conflict_guard" && this.isConflictGuardSentinelError(result.error)) {
          throw new Error("Lot balance changed before approval could be posted");
        }
        if (statementRoles[index] === "pending_cost_conflict_guard" && this.isConflictGuardSentinelError(result.error)) {
          throw new Error("Pending cost balance changed before approval could be posted");
        }
        if (statementRoles[index] === "loan_item_conflict_guard" && this.isConflictGuardSentinelError(result.error)) {
          throw new Error("Loan item balance changed before approval could be posted");
        }
        throw new Error(result.error || "D1 batch write failed");
      }
    }
    return results;
  }

  private isConflictGuardSentinelError(error: string | undefined): boolean {
    return error?.includes("NOT NULL constraint failed: account_entries.account_id") ?? false;
  }
}
