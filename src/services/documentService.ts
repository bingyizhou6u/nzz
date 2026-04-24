import { normalizeDocumentLines } from "../domain/documentLines";
import type { RawDocumentLine } from "../domain/documentLines";
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

type DocumentWorkflowRepository = Pick<
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
>;

type DocumentAuditRepository = Pick<AuditLogRepository, "record">;

export class DocumentService {
  constructor(
    private readonly documents: DocumentWorkflowRepository,
    private readonly auditLogs: DocumentAuditRepository
  ) {}

  async createDraft(input: CreateDraftRequest) {
    const lines = normalizeDocumentLines(input.lines);
    const document = await this.documents.createDraftWithLines({
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
      createdBy: input.createdBy,
      lines
    });

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

    const lockedPeriod = await this.documents.isPeriodLocked(periodFromDate(document.business_date));
    if (lockedPeriod) {
      throw new Error("Period is locked");
    }

    const lines = await this.documents.getDocumentLines(id);
    const posting = entriesForApprovedDocument({
      id: document.id,
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
      after: { status: "approved" }
    });
  }

  private async requireDocument(id: string) {
    const document = await this.documents.getDocument(id);
    if (!document) {
      throw new Error("Document not found");
    }
    return document;
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
