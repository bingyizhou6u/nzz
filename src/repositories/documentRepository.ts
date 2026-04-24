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
  loanEntries: Array<{ borrowerPersonId: string; currencyCode: string; amountMinor: number; entryDate: string }>;
  lotCreations?: LotCreationEffect[];
  lotUpdates?: LotUpdateEffect[];
  lotMovements?: LotMovementEffect[];
  pendingCostCreations?: PendingCostCreationEffect[];
  pendingCostUpdates?: PendingCostUpdateEffect[];
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

type ApprovalStatementRole =
  | "write"
  | "lot_conflict_guard"
  | "lot_update"
  | "pending_cost_conflict_guard"
  | "pending_cost_update"
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
    entries: Array<{ borrowerPersonId: string; currencyCode: string; amountMinor: number; entryDate: string }>
  ) {
    await this.runBatch(
      entries.map((entry) =>
        this.db
          .prepare(
            `INSERT INTO loan_entries (id, document_id, borrower_person_id, currency_code, amount_minor, entry_date, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(newId("loan_entry"), documentId, entry.borrowerPersonId, entry.currencyCode, entry.amountMinor, entry.entryDate, nowIso())
      )
    );
  }

  async approveWithPostings(input: ApproveDocumentWithPostingsInput): Promise<void> {
    const createdLotIds = new Map<string, string>();
    for (const lotCreation of input.lotCreations ?? []) {
      createdLotIds.set(lotCreation.clientLotId, newId("lot"));
    }

    const statements: D1PreparedStatement[] = [];
    const statementRoles: ApprovalStatementRole[] = [];
    const addStatement = (statement: D1PreparedStatement, role: ApprovalStatementRole) => {
      statements.push(statement);
      statementRoles.push(role);
    };

    for (const entry of input.accountEntries) {
      addStatement(this.prepareConditionalAccountEntry(input.documentId, input.period, entry), "write");
    }
    for (const entry of input.loanEntries) {
      addStatement(this.prepareConditionalLoanEntry(input.documentId, input.period, entry), "write");
    }
    for (const lotCreation of input.lotCreations ?? []) {
      const lotId = createdLotIds.get(lotCreation.clientLotId);
      if (!lotId) {
        throw new Error("Lot creation id was not prepared");
      }
      addStatement(this.prepareConditionalLotCreation(input.documentId, input.period, lotCreation, lotId), "write");
    }
    for (const lotUpdate of input.lotUpdates ?? []) {
      addStatement(this.prepareLotConflictGuard(input.documentId, input.period, lotUpdate), "lot_conflict_guard");
      addStatement(this.prepareConditionalLotUpdate(input.documentId, input.period, lotUpdate), "lot_update");
    }
    for (const lotMovement of input.lotMovements ?? []) {
      const lotId = createdLotIds.get(lotMovement.lotId) ?? lotMovement.lotId;
      addStatement(this.prepareConditionalLotMovement(input.documentId, input.period, lotMovement, lotId), "write");
    }
    for (const pendingCostCreation of input.pendingCostCreations ?? []) {
      addStatement(this.prepareConditionalPendingCostCreation(input.documentId, input.period, pendingCostCreation), "write");
    }
    for (const pendingCostUpdate of input.pendingCostUpdates ?? []) {
      addStatement(
        this.preparePendingCostConflictGuard(input.documentId, input.period, pendingCostUpdate),
        "pending_cost_conflict_guard"
      );
      addStatement(this.prepareConditionalPendingCostUpdate(input.documentId, input.period, pendingCostUpdate), "pending_cost_update");
    }
    addStatement(input.auditLogStatement, "write");
    addStatement(
      this.prepareGuardedApprovalUpdate(input.documentId, input.period, input.reviewer, input.reviewedAt ?? nowIso()),
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
    entry: { accountId: string; currencyCode: string; amountMinor: number; entryDate: string }
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO account_entries (id, document_id, account_id, currency_code, amount_minor, entry_date, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?
         WHERE ${this.approvalGuardSql()}`
      )
      .bind(
        newId("acct_entry"),
        documentId,
        entry.accountId,
        entry.currencyCode,
        entry.amountMinor,
        entry.entryDate,
        nowIso(),
        documentId,
        period
      );
  }

  private prepareConditionalLoanEntry(
    documentId: string,
    period: string,
    entry: { borrowerPersonId: string; currencyCode: string; amountMinor: number; entryDate: string }
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO loan_entries (id, document_id, borrower_person_id, currency_code, amount_minor, entry_date, created_at)
         SELECT ?, ?, ?, ?, ?, ?, ?
         WHERE ${this.approvalGuardSql()}`
      )
      .bind(
        newId("loan_entry"),
        documentId,
        entry.borrowerPersonId,
        entry.currencyCode,
        entry.amountMinor,
        entry.entryDate,
        nowIso(),
        documentId,
        period
      );
  }

  private prepareConditionalLotCreation(
    documentId: string,
    period: string,
    lotCreation: LotCreationEffect,
    lotId: string
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO lots (
           id, currency_code, original_amount_minor, remaining_amount_minor,
           original_usdt_cost_minor, remaining_usdt_cost_minor, source_document_id,
           current_account_id, current_person_id, lot_date, status, created_at
         )
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE ${this.approvalGuardSql()}`
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
        documentId,
        period
      );
  }

  private prepareConditionalLotUpdate(
    documentId: string,
    period: string,
    lotUpdate: LotUpdateEffect
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
           AND ${this.approvalGuardSql()}`
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
        documentId,
        period
      );
  }

  private prepareLotConflictGuard(
    documentId: string,
    period: string,
    lotUpdate: LotUpdateEffect
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO account_entries (id, document_id, account_id, currency_code, amount_minor, entry_date, created_at)
         SELECT ?, ?, NULL, ?, 0, ?, ?
         WHERE ${this.approvalGuardSql()}
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
        documentId,
        period,
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
    lotId: string
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO lot_movements (
           id, lot_id, document_id, movement_type, from_account_id, to_account_id,
           from_person_id, to_person_id, amount_minor, usdt_cost_minor, movement_date, created_at
         )
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE ${this.approvalGuardSql()}`
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
        documentId,
        period
      );
  }

  private prepareConditionalPendingCostCreation(
    documentId: string,
    period: string,
    pendingCostCreation: PendingCostCreationEffect
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO pending_cost_matches (
           id, document_id, person_id, account_id, currency_code, amount_minor,
           remaining_amount_minor, expense_date, status, created_at
         )
         SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
         WHERE ${this.approvalGuardSql()}`
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
        documentId,
        period
      );
  }

  private prepareConditionalPendingCostUpdate(
    documentId: string,
    period: string,
    pendingCostUpdate: PendingCostUpdateEffect
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `UPDATE pending_cost_matches
         SET remaining_amount_minor = remaining_amount_minor + ?,
             status = CASE WHEN remaining_amount_minor + ? = 0 THEN 'matched' ELSE 'partial' END
         WHERE id = ?
           AND remaining_amount_minor = ?
           AND remaining_amount_minor + ? >= 0
           AND ${this.approvalGuardSql()}`
      )
      .bind(
        pendingCostUpdate.amountDeltaMinor,
        pendingCostUpdate.amountDeltaMinor,
        pendingCostUpdate.pendingCostMatchId,
        pendingCostUpdate.expectedRemainingAmountMinor,
        pendingCostUpdate.amountDeltaMinor,
        documentId,
        period
      );
  }

  private preparePendingCostConflictGuard(
    documentId: string,
    period: string,
    pendingCostUpdate: PendingCostUpdateEffect
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `INSERT INTO account_entries (id, document_id, account_id, currency_code, amount_minor, entry_date, created_at)
         SELECT ?, ?, NULL, ?, 0, ?, ?
         WHERE ${this.approvalGuardSql()}
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
        documentId,
        period,
        pendingCostUpdate.pendingCostMatchId,
        pendingCostUpdate.expectedRemainingAmountMinor,
        pendingCostUpdate.amountDeltaMinor
      );
  }

  private prepareGuardedApprovalUpdate(
    documentId: string,
    period: string,
    reviewer: string,
    reviewedAt: string
  ): D1PreparedStatement {
    return this.db
      .prepare(
        `UPDATE documents
         SET status = 'approved', reviewed_by = ?, reviewed_at = ?, reject_reason = NULL
         WHERE id = ?
           AND status = 'pending'
           AND NOT EXISTS (SELECT 1 FROM period_locks WHERE period = ?)`
      )
      .bind(reviewer, reviewedAt, documentId, period);
  }

  private approvalGuardSql() {
    return `EXISTS (
      SELECT 1 FROM documents
      WHERE id = ?
        AND status = 'pending'
        AND NOT EXISTS (SELECT 1 FROM period_locks WHERE period = ?)
    )`;
  }

  private lotStatus(remainingAmountMinor: number): "open" | "closed" {
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
        throw new Error(result.error || "D1 batch write failed");
      }
    }
    return results;
  }

  private isConflictGuardSentinelError(error: string | undefined): boolean {
    return error?.includes("NOT NULL constraint failed: account_entries.account_id") ?? false;
  }
}
