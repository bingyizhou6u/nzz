import { normalizeDocumentLines } from "../domain/documentLines";
import type { RawDocumentLine } from "../domain/documentLines";
import {
  emptyFifoPostingEffects,
  planAccountTransferEffects,
  planExchangeLotCreation,
  planPettyCashIssueEffects,
  planPettyCashReimbursementEffects,
  planPettyCashReturnEffects,
  type LotMovementType
} from "../domain/fifoEffects";
import { planSafeFifoReversalEffects } from "../domain/fifoReversal";
import { assertDocumentTransition, periodFromDate } from "../domain/documentWorkflow";
import {
  emptyLoanPostingEffects,
  planLoanOutEffects,
  planLoanReductionEffects,
  totalLoanAllocationUsdtCost
} from "../domain/loanEffects";
import { planSafeLoanReversalEffects } from "../domain/loanReversal";
import { entriesForApprovedDocument } from "../domain/posting";
import { entriesForReversalDocument } from "../domain/reversalPosting";
import type { Lot } from "../domain/types";
import type { ActionType, DocumentType } from "../domain/types";
import type { AuditLogRepository } from "../repositories/auditLogRepository";
import type {
  DocumentDetailRow,
  DocumentLineRow,
  DocumentRepository,
  LoanItemReversalRow,
  LotRow,
  PendingCostMatchRow
} from "../repositories/documentRepository";

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
  | "listOpenLoanItems"
  | "listOpenPendingCostMatches"
  | "listAccountEntriesForDocument"
  | "listLoanEntriesForDocument"
  | "listLotMovementsForDocument"
  | "listLotsCreatedByDocument"
  | "listPendingCostMatchesForDocument"
  | "listLotsByIds"
  | "listLaterMovementLotIds"
  | "listLoanItemsCreatedByDocument"
  | "listLoanAllocationsForDocument"
  | "listLoanItemsByIds"
  | "listLaterLoanAllocationItemIds"
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

    if (document.action_type === "reversal") {
      await this.approveReversal(document, reviewer, approvalPeriod);
      return;
    }

    const lines = await this.documents.getDocumentLines(id);
    assertSingleLineFifoApproval(document.document_type, lines);
    const borrowerPersonId = borrowerForLoanDocument(document.document_type, lines);
    const posting = entriesForApprovedDocument({
      id: document.id,
      documentType: document.document_type,
      actionType: document.action_type,
      businessDate: document.business_date,
      borrowerPersonId,
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
    const loanEffects = await this.planLoanPostingEffects(document, lines, borrowerPersonId);
    const loanEntries = attachLoanAllocationCost(
      document.document_type,
      posting.loanEntries,
      totalLoanAllocationUsdtCost(loanEffects)
    );
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
      loanEntries,
      lotCreations: fifoEffects.lotCreations,
      lotUpdates: fifoEffects.lotUpdates,
      lotMovements: fifoEffects.lotMovements,
      pendingCostCreations: fifoEffects.pendingCostCreations,
      pendingCostUpdates: fifoEffects.pendingCostUpdates,
      loanItemCreations: loanEffects.loanItemCreations,
      loanItemUpdates: loanEffects.loanItemUpdates,
      loanAllocations: loanEffects.loanAllocations,
      auditLogStatement
    });
  }

  private async approveReversal(document: DocumentDetailRow, reviewer: string, approvalPeriod: string) {
    const originalDocumentId = document.original_document_id?.trim() ?? "";
    if (!originalDocumentId) {
      throw new Error("originalDocumentId is required for reversal approval");
    }

    const original = await this.requireDocument(originalDocumentId);
    if (original.status !== "approved") {
      throw new Error("Original document must be approved before reversal");
    }
    if (document.document_type !== original.document_type) {
      throw new Error("Reversal document type must match original document type");
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
        amountMinor: entry.amount_minor,
        usdtCostMinor: entry.usdt_cost_minor
      }))
    });

    const fifoEffects = await this.planFifoReversalEffects(document.id, original, document.business_date);
    const loanEffects = await this.planLoanReversalEffects(document.id, original, document.business_date);
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
        sql: `EXISTS (
          SELECT 1 FROM documents
          WHERE id = ?
            AND status = 'pending'
            AND NOT EXISTS (SELECT 1 FROM period_locks WHERE period = ?)
            AND NOT EXISTS (
              SELECT 1 FROM documents
              WHERE original_document_id = ?
                AND action_type = 'reversal'
                AND status = 'approved'
                AND id <> ?
            )
        )`,
        bindings: [document.id, approvalPeriod, originalDocumentId, document.id]
      }
    );

    await this.documents.approveWithPostings({
      documentId: document.id,
      period: approvalPeriod,
      reviewer,
      reversalOriginalDocumentId: originalDocumentId,
      accountEntries: posting.accountEntries,
      loanEntries: posting.loanEntries,
      lotCreations: fifoEffects.lotCreations,
      lotUpdates: fifoEffects.lotUpdates,
      lotMovements: fifoEffects.lotMovements,
      pendingCostCreations: fifoEffects.pendingCostCreations,
      pendingCostUpdates: fifoEffects.pendingCostUpdates,
      loanItemCreations: loanEffects.loanItemCreations,
      loanItemUpdates: loanEffects.loanItemUpdates,
      loanAllocations: loanEffects.loanAllocations,
      auditLogStatement
    });
  }

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
        movementType: movement.movement_type as LotMovementType,
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

  private async planLoanReversalEffects(reversalDocumentId: string, original: DocumentDetailRow, reversalDate: string) {
    if (!isLoanDocumentType(original.document_type)) {
      return emptyLoanPostingEffects();
    }

    const [createdLoanItems, originalAllocations] = await Promise.all([
      this.documents.listLoanItemsCreatedByDocument(original.id),
      this.documents.listLoanAllocationsForDocument(original.id)
    ]);
    const allocationLoanItemIds = originalAllocations.map((allocation) => allocation.loan_item_id);
    const createdLoanItemIds = createdLoanItems.map((item) => item.id);
    const loanItemIds = uniqueText([...allocationLoanItemIds, ...createdLoanItemIds]);
    const [affectedLoanItems, laterAllocationLoanItemIds] = await Promise.all([
      this.documents.listLoanItemsByIds(loanItemIds),
      this.documents.listLaterLoanAllocationItemIds({ loanItemIds, originalDocumentId: original.id })
    ]);

    return planSafeLoanReversalEffects({
      reversalDocumentId,
      originalDocumentId: original.id,
      originalDocumentType: original.document_type,
      reversalDate,
      createdLoanItems: createdLoanItems.map(mapLoanItemReversalRow),
      affectedLoanItems: affectedLoanItems.map(mapLoanItemReversalRow),
      originalAllocations: originalAllocations.map((allocation) => ({
        loanItemId: allocation.loan_item_id,
        allocationType: allocation.allocation_type,
        amountMinor: allocation.amount_minor,
        usdtCostMinor: allocation.usdt_cost_minor
      })),
      laterAllocationLoanItemIds: laterAllocationLoanItemIds.map((row) => row.loan_item_id)
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

  private async planLoanPostingEffects(
    document: DocumentDetailRow,
    lines: DocumentLineRow[],
    borrowerPersonId: string | undefined
  ) {
    if (!borrowerPersonId) return emptyLoanPostingEffects();

    if (document.document_type === "loan_out") {
      return planLoanOutEffects({
        documentId: document.id,
        borrowerPersonId,
        loanDate: document.business_date,
        lines: lines.map((line) => ({
          lineId: line.id,
          currencyCode: line.currency_code,
          amountMinor: line.amount_minor,
          usdtCostMinor: line.usdt_amount_minor
        }))
      });
    }

    if (document.document_type === "loan_repayment" || document.document_type === "loan_writeoff") {
      assertSingleLineLoanReduction(document.document_type, lines);
      requireWriteoffCategory(document);
      const line = requireFirstLine(lines, document.document_type);
      const currencyCode = requireLineText(line.currency_code, "line currencyCode", document.document_type);
      const openLoanItems = await this.documents.listOpenLoanItems({
        borrowerPersonId,
        currencyCode,
        targetSourceDocumentId: document.original_document_id
      });

      return planLoanReductionEffects({
        documentId: document.id,
        borrowerPersonId,
        currencyCode,
        amountMinor: requirePositiveSafeInteger(line.amount_minor, "line amountMinor", document.document_type),
        reductionDate: document.business_date,
        allocationType: document.document_type === "loan_repayment" ? "repayment" : "writeoff",
        targetSourceDocumentId: document.original_document_id,
        openLoanItems: openLoanItems.map((item) => ({
          id: item.id,
          sourceDocumentId: item.source_document_id,
          borrowerPersonId: item.borrower_person_id,
          currencyCode: item.currency_code,
          remainingAmountMinor: item.remaining_amount_minor,
          remainingUsdtCostMinor: item.remaining_usdt_cost_minor,
          loanDate: item.loan_date,
          createdAt: item.created_at
        }))
      });
    }

    return emptyLoanPostingEffects();
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

function borrowerForLoanDocument(documentType: DocumentType, lines: DocumentLineRow[]) {
  if (!isLoanDocumentType(documentType)) return undefined;
  const borrowers = lines.map((line) => line.borrower_person_id?.trim() ?? "");
  if (borrowers.some((borrower) => !borrower)) throw new Error(`borrowerPersonId is required for ${documentType}`);
  const uniqueBorrowers = uniqueText(borrowers);
  if (uniqueBorrowers.length > 1) throw new Error(`${documentType} requires one borrower`);
  return uniqueBorrowers[0];
}

function assertSingleLineLoanReduction(documentType: DocumentType, lines: DocumentLineRow[]) {
  if (documentType !== "loan_repayment" && documentType !== "loan_writeoff") return;
  if (lines.length !== 1) {
    throw new Error(`${documentType} requires exactly one line`);
  }
}

function requireWriteoffCategory(document: DocumentDetailRow) {
  if (document.document_type === "loan_writeoff" && !document.category_id?.trim()) {
    throw new Error("categoryId is required for loan_writeoff");
  }
}

function attachLoanAllocationCost(
  documentType: DocumentType,
  loanEntries: Array<{ borrowerPersonId: string; currencyCode: string; amountMinor: number; usdtCostMinor: number | null; entryDate: string }>,
  allocatedUsdtCostMinor: number
) {
  if (documentType !== "loan_repayment" && documentType !== "loan_writeoff") return loanEntries;
  if (loanEntries.length !== 1) throw new Error(`${documentType} requires exactly one loan entry`);
  const sign = loanEntries[0].amountMinor < 0 ? -1 : 1;
  return [{ ...loanEntries[0], usdtCostMinor: sign * allocatedUsdtCostMinor }];
}

function assertSingleLineFifoApproval(documentType: DocumentType, lines: DocumentLineRow[]) {
  if (!isSingleLineFifoDocumentType(documentType)) return;
  if (lines.length !== 1) {
    throw new Error(`${documentType} requires exactly one line`);
  }
}

function isSingleLineFifoDocumentType(documentType: DocumentType) {
  return (
    documentType === "exchange" ||
    documentType === "account_transfer" ||
    documentType === "petty_cash_issue" ||
    documentType === "petty_cash_return" ||
    documentType === "petty_cash_reimbursement"
  );
}

function isLoanDocumentType(documentType: DocumentType) {
  return documentType === "loan_out" || documentType === "loan_repayment" || documentType === "loan_writeoff";
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

function mapLoanItemReversalRow(row: LoanItemReversalRow) {
  return {
    id: row.id,
    originalAmountMinor: row.original_amount_minor,
    remainingAmountMinor: row.remaining_amount_minor,
    originalUsdtCostMinor: row.original_usdt_cost_minor,
    remainingUsdtCostMinor: row.remaining_usdt_cost_minor
  };
}

function uniqueText(values: string[]) {
  return [...new Set(values.filter((value) => value.trim()))];
}
