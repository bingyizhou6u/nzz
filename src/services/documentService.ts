import { normalizeDocumentLines } from "../domain/documentLines";
import type { RawDocumentLine } from "../domain/documentLines";
import {
  emptyFifoPostingEffects,
  planExchangeLotCreation,
  planPettyCashIssueEffects,
  planPettyCashReimbursementEffects
} from "../domain/fifoEffects";
import { assertDocumentTransition, periodFromDate } from "../domain/documentWorkflow";
import { entriesForApprovedDocument } from "../domain/posting";
import type { Lot } from "../domain/types";
import type { ActionType, DocumentType } from "../domain/types";
import type { AuditLogRepository } from "../repositories/auditLogRepository";
import type { DocumentLineRow, DocumentRepository, LotRow, PendingCostMatchRow } from "../repositories/documentRepository";

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
  lines?: RawDocumentLine[];
}

type DocumentWorkflowRepository = Pick<
  DocumentRepository,
  | "createDraft"
  | "createDraftWithLines"
  | "getDocument"
  | "getDocumentLines"
  | "markSubmitted"
  | "markRejected"
  | "markApproved"
  | "isPeriodLocked"
  | "insertAccountEntries"
  | "insertLoanEntries"
  | "listOpenLotsForAccount"
  | "listOpenPendingCostMatches"
  | "approveWithPostings"
>;

type DocumentAuditRepository = Pick<AuditLogRepository, "record" | "prepareRecordWhen">;

export class DocumentService {
  constructor(
    private readonly documents: DocumentWorkflowRepository,
    private readonly auditLogs: DocumentAuditRepository
  ) {}

  async createDraft(input: CreateDraftRequest) {
    const draftInput = {
      documentType: input.documentType,
      actionType: input.actionType ?? "normal",
      businessDate: input.businessDate,
      period: input.period,
      operatorPersonId: nullableText(input.operatorPersonId),
      projectId: nullableText(input.projectId),
      merchantId: nullableText(input.merchantId),
      categoryId: nullableText(input.categoryId),
      originalDocumentId: nullableText(input.originalDocumentId),
      summary: input.summary,
      createdBy: input.createdBy
    };

    const document =
      Array.isArray(input.lines) && input.lines.length > 0
        ? await this.documents.createDraftWithLines({
            ...draftInput,
            lines: normalizeDocumentLines(input.lines)
          })
        : await this.documents.createDraft(draftInput);

    await this.auditLogs.record({
      actor: input.createdBy,
      action: "document.create",
      entityType: "document",
      entityId: document.id,
      after: { document }
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
    if (!trimmedReason) {
      throw new Error("Rejection reason is required");
    }

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

    const approvalPeriod = periodFromDate(document.business_date);
    const lockedPeriod = await this.documents.isPeriodLocked(approvalPeriod);
    if (lockedPeriod) {
      throw new Error(`Period ${approvalPeriod} is locked`);
    }

    const lines = await this.documents.getDocumentLines(id);
    assertSingleLineFifoApproval(document.document_type, lines);
    const posting = entriesForApprovedDocument({
      id: document.id,
      documentType: document.document_type,
      actionType: document.action_type,
      businessDate: document.business_date,
      borrowerPersonId: firstBorrower(lines),
      lines: lines.map((line) => ({
        accountId: line.account_id ?? "",
        counterpartyAccountId: line.counterparty_account_id,
        personId: line.person_id,
        currencyCode: line.currency_code,
        amountMinor: line.amount_minor,
        usdtAmountMinor: line.usdt_amount_minor
      }))
    });
    const fifoEffects = await this.planFifoPostingEffects(document.document_type, document.id, document.business_date, lines);
    const auditLogStatement = this.auditLogs.prepareRecordWhen(
      {
        actor: reviewer,
        action: "document.approve",
        entityType: "document",
        entityId: id,
        before: { status: document.status },
        after: { status: "approved" }
      },
      {
        sql: "EXISTS (SELECT 1 FROM documents WHERE id = ? AND status = 'pending' AND NOT EXISTS (SELECT 1 FROM period_locks WHERE period = ?))",
        bindings: [id, approvalPeriod]
      }
    );

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
  }

  private async requireDocument(id: string) {
    const document = await this.documents.getDocument(id);
    if (!document) {
      throw new Error("Document not found");
    }
    return document;
  }

  private async planFifoPostingEffects(documentType: DocumentType, documentId: string, businessDate: string, lines: DocumentLineRow[]) {
    if (documentType === "exchange") {
      const line = requireFirstLine(lines, documentType);
      return planExchangeLotCreation({
        documentId,
        accountId: requireLineText(line.account_id, "line accountId", documentType),
        currencyCode: requireLineText(line.currency_code, "line currencyCode", documentType),
        amountMinor: requirePositiveSafeInteger(line.amount_minor, "line amountMinor", documentType),
        usdtCostMinor: requirePositiveSafeInteger(line.usdt_amount_minor, "line usdtAmountMinor", documentType),
        lotDate: businessDate
      });
    }

    if (documentType === "petty_cash_issue") {
      const line = requireFirstLine(lines, documentType);
      const fromAccountId = requireLineText(line.account_id, "line accountId", documentType);
      const toAccountId = requireLineText(line.counterparty_account_id, "line counterpartyAccountId", documentType);
      const personId = requireLineText(line.person_id, "line personId", documentType);
      const currencyCode = requireLineText(line.currency_code, "line currencyCode", documentType);
      const [sourceLots, openPendingMatches] = await Promise.all([
        this.documents.listOpenLotsForAccount({ accountId: fromAccountId, personId: null, currencyCode }),
        this.documents.listOpenPendingCostMatches({ accountId: toAccountId, personId, currencyCode })
      ]);

      return planPettyCashIssueEffects({
        documentId,
        fromAccountId,
        toAccountId,
        personId,
        currencyCode,
        amountMinor: requirePositiveSafeInteger(line.amount_minor, "line amountMinor", documentType),
        businessDate,
        sourceLots: sourceLots.map(mapLotRow),
        openPendingMatches: openPendingMatches.map(mapPendingCostMatchRow)
      });
    }

    if (documentType === "petty_cash_reimbursement") {
      const line = requireFirstLine(lines, documentType);
      const accountId = requireLineText(line.account_id, "line accountId", documentType);
      const personId = requireLineText(line.person_id, "line personId", documentType);
      const currencyCode = requireLineText(line.currency_code, "line currencyCode", documentType);
      const sourceLots = await this.documents.listOpenLotsForAccount({ accountId, personId, currencyCode });

      return planPettyCashReimbursementEffects({
        documentId,
        accountId,
        personId,
        currencyCode,
        amountMinor: requirePositiveSafeInteger(line.amount_minor, "line amountMinor", documentType),
        expenseDate: businessDate,
        sourceLots: sourceLots.map(mapLotRow)
      });
    }

    return emptyFifoPostingEffects();
  }
}

function nullableText(value: string | null | undefined) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function firstBorrower(lines: Array<{ borrower_person_id: string | null }>) {
  return lines.find((line) => line.borrower_person_id)?.borrower_person_id ?? undefined;
}

function assertSingleLineFifoApproval(documentType: DocumentType, lines: DocumentLineRow[]) {
  if (!isSingleLineFifoDocumentType(documentType)) return;
  if (lines.length !== 1) {
    throw new Error(`${documentType} requires exactly one line`);
  }
}

function isSingleLineFifoDocumentType(documentType: DocumentType) {
  return documentType === "exchange" || documentType === "petty_cash_issue" || documentType === "petty_cash_reimbursement";
}

function requireFirstLine(lines: DocumentLineRow[], documentType: DocumentType): DocumentLineRow {
  const line = lines[0];
  if (!line) {
    throw new Error(`line is required for ${documentType}`);
  }
  return line;
}

function requireLineText(value: string | null | undefined, label: string, documentType: DocumentType): string {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    throw new Error(`${label} is required for ${documentType}`);
  }
  return trimmed;
}

function requirePositiveSafeInteger(value: number | null | undefined, label: string, documentType: DocumentType): number {
  if (value == null) {
    throw new Error(`${label} is required for ${documentType}`);
  }
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${label} must be a positive safe integer for ${documentType}`);
  }
  return value;
}

function mapLotRow(row: LotRow): Lot {
  return {
    id: row.id,
    currencyCode: row.currency_code,
    remainingAmountMinor: row.remaining_amount_minor,
    remainingUsdtCostMinor: row.remaining_usdt_cost_minor,
    lotDate: row.lot_date
  };
}

function mapPendingCostMatchRow(row: PendingCostMatchRow) {
  return {
    id: row.id,
    remainingAmountMinor: row.remaining_amount_minor,
    expenseDate: row.expense_date,
    createdAt: row.created_at
  };
}
