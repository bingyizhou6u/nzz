import { all, first, newId, nowIso, run } from "./db";
import type { ActionType, DocumentStatus, DocumentType } from "../domain/types";
import type { NormalizedDocumentLine } from "../domain/documentLines";

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
        .prepare(`UPDATE documents SET status = 'pending', submitted_at = ?, reject_reason = NULL WHERE id = ?`)
        .bind(submittedAt, id)
    );
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

  private async runBatch(statements: D1PreparedStatement[]) {
    if (statements.length === 0) return;

    const results = await this.db.batch(statements);
    for (const result of results) {
      if (!result.success) {
        throw new Error(result.error || "D1 batch write failed");
      }
    }
  }
}
