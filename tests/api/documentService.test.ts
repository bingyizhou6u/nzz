import { describe, expect, it, vi } from "vitest";
import { DocumentService } from "../../src/services/documentService";
import type { DocumentDetailRow, DocumentLineRow } from "../../src/repositories/documentRepository";

type DocumentRepoMock = ConstructorParameters<typeof DocumentService>[0];
type AuditRepoMock = ConstructorParameters<typeof DocumentService>[1];
type AtomicDocumentRepoMock = DocumentRepoMock & {
  createDraft: ReturnType<typeof vi.fn>;
  approveWithPostings: ReturnType<typeof vi.fn>;
};
type AtomicAuditRepoMock = AuditRepoMock & {
  prepareRecordWhen: ReturnType<typeof vi.fn>;
};

function documentRow(overrides: Partial<DocumentDetailRow> = {}): DocumentDetailRow {
  return {
    id: "doc_1",
    document_no: "docno_1",
    document_type: "project_income",
    action_type: "normal",
    business_date: "2026-04-24",
    period: "2026-04",
    summary: "Merchant income",
    status: "draft",
    created_by: "creator_1",
    created_at: "2026-04-24T10:00:00.000Z",
    operator_person_id: null,
    project_id: null,
    merchant_id: null,
    category_id: null,
    original_document_id: null,
    reviewed_by: null,
    reviewed_at: null,
    reject_reason: null,
    ...overrides
  };
}

function lineRow(overrides: Partial<DocumentLineRow> = {}): DocumentLineRow {
  return {
    id: "line_1",
    document_id: "doc_1",
    line_no: 1,
    line_type: "main",
    account_id: "acct_usdt",
    counterparty_account_id: null,
    person_id: null,
    borrower_person_id: null,
    currency_code: "USDT",
    amount_minor: 10000,
    usdt_amount_minor: 10000,
    exchange_rate_text: null,
    note: null,
    ...overrides
  };
}

function createMocks(overrides: Partial<AtomicDocumentRepoMock> = {}) {
  const repo = {
    createDraft: vi.fn(async () => ({ id: "doc_1", documentNo: "docno_1", status: "draft" as const })),
    createDraftWithLines: vi.fn(async () => ({ id: "doc_1", documentNo: "docno_1", status: "draft" as const })),
    getDocument: vi.fn(async () => documentRow()),
    getDocumentLines: vi.fn(async () => [lineRow()]),
    markSubmitted: vi.fn(async () => undefined),
    markRejected: vi.fn(async () => undefined),
    markApproved: vi.fn(async () => undefined),
    isPeriodLocked: vi.fn(async () => null),
    insertAccountEntries: vi.fn(async () => undefined),
    insertLoanEntries: vi.fn(async () => undefined),
    approveWithPostings: vi.fn(async () => undefined),
    ...overrides
  } satisfies AtomicDocumentRepoMock;
  const audit = {
    record: vi.fn(async () => undefined),
    prepareRecordWhen: vi.fn(() => ({ statement: "audit" }) as unknown as D1PreparedStatement)
  } satisfies AtomicAuditRepoMock;

  return { repo, audit, service: new DocumentService(repo, audit) };
}

describe("DocumentService", () => {
  it("creates header-only drafts and audit logs when lines are omitted", async () => {
    const { repo, audit, service } = createMocks();

    const document = await service.createDraft({
      documentType: "project_income",
      businessDate: "2026-04-24",
      period: "2026-04",
      operatorPersonId: "",
      projectId: "  proj_1  ",
      merchantId: undefined,
      categoryId: "cat_income",
      originalDocumentId: " ",
      summary: "Merchant income",
      createdBy: "creator_1"
    });

    expect(document).toEqual({ id: "doc_1", documentNo: "docno_1", status: "draft" });
    expect(repo.createDraft).toHaveBeenCalledWith({
      documentType: "project_income",
      actionType: "normal",
      businessDate: "2026-04-24",
      period: "2026-04",
      operatorPersonId: null,
      projectId: "proj_1",
      merchantId: null,
      categoryId: "cat_income",
      originalDocumentId: null,
      summary: "Merchant income",
      createdBy: "creator_1"
    });
    expect(repo.createDraftWithLines).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith({
      actor: "creator_1",
      action: "document.create",
      entityType: "document",
      entityId: "doc_1",
      after: { document: { id: "doc_1", documentNo: "docno_1", status: "draft" } }
    });
  });

  it("creates drafts with normalized lines and audit logs", async () => {
    const { repo, audit, service } = createMocks();

    const document = await service.createDraft({
      documentType: "project_income",
      businessDate: "2026-04-24",
      period: "2026-04",
      operatorPersonId: "",
      projectId: "  proj_1  ",
      merchantId: undefined,
      categoryId: "cat_income",
      originalDocumentId: " ",
      summary: "Merchant income",
      createdBy: "creator_1",
      lines: [
        {
          accountId: " acct_usdt ",
          currencyCode: "usdt",
          amountMinor: 10000,
          usdtAmountMinor: 10000,
          note: "  cash sale  "
        }
      ]
    });

    expect(document).toEqual({ id: "doc_1", documentNo: "docno_1", status: "draft" });
    expect(repo.createDraft).not.toHaveBeenCalled();
    expect(repo.createDraftWithLines).toHaveBeenCalledWith({
      documentType: "project_income",
      actionType: "normal",
      businessDate: "2026-04-24",
      period: "2026-04",
      operatorPersonId: null,
      projectId: "proj_1",
      merchantId: null,
      categoryId: "cat_income",
      originalDocumentId: null,
      summary: "Merchant income",
      createdBy: "creator_1",
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
          note: "cash sale"
        }
      ]
    });
    expect(audit.record).toHaveBeenCalledWith({
      actor: "creator_1",
      action: "document.create",
      entityType: "document",
      entityId: "doc_1",
      after: { document: { id: "doc_1", documentNo: "docno_1", status: "draft" } }
    });
  });

  it("submits draft documents", async () => {
    const { repo, audit, service } = createMocks({ getDocument: vi.fn(async () => documentRow({ status: "draft" })) });

    await service.submit("doc_1", "submitter_1");

    expect(repo.markSubmitted).toHaveBeenCalledWith("doc_1");
    expect(audit.record).toHaveBeenCalledWith({
      actor: "submitter_1",
      action: "document.submit",
      entityType: "document",
      entityId: "doc_1",
      before: { status: "draft" },
      after: { status: "pending" }
    });
  });

  it("rejects pending documents with a reason", async () => {
    const { repo, audit, service } = createMocks({ getDocument: vi.fn(async () => documentRow({ status: "pending" })) });

    await service.reject("doc_1", "reviewer_1", "  Missing receipt  ");

    expect(repo.markRejected).toHaveBeenCalledWith("doc_1", "Missing receipt");
    expect(audit.record).toHaveBeenCalledWith({
      actor: "reviewer_1",
      action: "document.reject",
      entityType: "document",
      entityId: "doc_1",
      before: { status: "pending" },
      after: { status: "rejected" },
      reason: "Missing receipt"
    });
  });

  it("approves pending project income with one atomic posting write", async () => {
    const { repo, audit, service } = createMocks({
      getDocument: vi.fn(async () => documentRow({ status: "pending" })),
      getDocumentLines: vi.fn(async () => [lineRow({ amount_minor: 15000 })])
    });

    await service.approve("doc_1", "reviewer_1");

    expect(repo.isPeriodLocked).toHaveBeenCalledWith("2026-04");
    expect(audit.prepareRecordWhen).toHaveBeenCalledWith({
      actor: "reviewer_1",
      action: "document.approve",
      entityType: "document",
      entityId: "doc_1",
      before: { status: "pending" },
      after: { status: "approved" }
    }, {
      sql: "EXISTS (SELECT 1 FROM documents WHERE id = ? AND status = 'pending' AND NOT EXISTS (SELECT 1 FROM period_locks WHERE period = ?))",
      bindings: ["doc_1", "2026-04"]
    });
    expect(repo.approveWithPostings).toHaveBeenCalledWith({
      documentId: "doc_1",
      period: "2026-04",
      reviewer: "reviewer_1",
      accountEntries: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 15000, entryDate: "2026-04-24" }],
      loanEntries: [],
      auditLogStatement: { statement: "audit" }
    });
    expect(repo.insertAccountEntries).not.toHaveBeenCalled();
    expect(repo.insertLoanEntries).not.toHaveBeenCalled();
    expect(repo.markApproved).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("rejects approval when the period is locked", async () => {
    const { repo, audit, service } = createMocks({
      getDocument: vi.fn(async () => documentRow({ status: "pending" })),
      isPeriodLocked: vi.fn(async () => ({ period: "2026-04" }))
    });

    await expect(service.approve("doc_1", "reviewer_1")).rejects.toThrow("Period 2026-04 is locked");

    expect(repo.getDocumentLines).not.toHaveBeenCalled();
    expect(repo.approveWithPostings).not.toHaveBeenCalled();
    expect(audit.prepareRecordWhen).not.toHaveBeenCalled();
  });

  it("rejects approval when the document is not found", async () => {
    const { repo, service } = createMocks({ getDocument: vi.fn(async () => null) });

    await expect(service.approve("doc_missing", "reviewer_1")).rejects.toThrow("Document not found");

    expect(repo.approveWithPostings).not.toHaveBeenCalled();
  });

  it("rejects approval from invalid statuses before writes", async () => {
    const { repo, service } = createMocks({ getDocument: vi.fn(async () => documentRow({ status: "draft" })) });

    await expect(service.approve("doc_1", "reviewer_1")).rejects.toThrow("Only pending documents can be approved");

    expect(repo.getDocumentLines).not.toHaveBeenCalled();
    expect(repo.approveWithPostings).not.toHaveBeenCalled();
  });

  it("rejects blank rejection reasons before writes", async () => {
    const { repo, audit, service } = createMocks({ getDocument: vi.fn(async () => documentRow({ status: "pending" })) });

    await expect(service.reject("doc_1", "reviewer_1", "   ")).rejects.toThrow("Rejection reason is required");

    expect(repo.markRejected).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("rejects unsupported posting types before approval writes", async () => {
    const { repo, audit, service } = createMocks({
      getDocument: vi.fn(async () => documentRow({ status: "pending", document_type: "manual_adjustment" })),
      getDocumentLines: vi.fn(async () => [lineRow()])
    });

    await expect(service.approve("doc_1", "reviewer_1")).rejects.toThrow("Unsupported documentType: manual_adjustment");

    expect(repo.approveWithPostings).not.toHaveBeenCalled();
    expect(audit.prepareRecordWhen).not.toHaveBeenCalled();
  });

  it("rejects exchange approval until FIFO approval effects are implemented", async () => {
    const { repo, audit, service } = createMocks({
      getDocument: vi.fn(async () => documentRow({ status: "pending", document_type: "exchange" }))
    });

    await expect(service.approve("doc_1", "reviewer_1")).rejects.toThrow("FIFO approval effects are not implemented for exchange");

    expect(repo.getDocumentLines).not.toHaveBeenCalled();
    expect(repo.approveWithPostings).not.toHaveBeenCalled();
    expect(audit.prepareRecordWhen).not.toHaveBeenCalled();
  });

  it("uses the first borrower when approving loan documents", async () => {
    const { repo, service } = createMocks({
      getDocument: vi.fn(async () => documentRow({ status: "pending", document_type: "loan_out" })),
      getDocumentLines: vi.fn(async () => [
        lineRow({ borrower_person_id: null, amount_minor: 5000 }),
        lineRow({ id: "line_2", line_no: 2, borrower_person_id: "person_1", amount_minor: 7000 })
      ])
    });

    await service.approve("doc_1", "reviewer_1");

    expect(repo.approveWithPostings).toHaveBeenCalledWith({
      documentId: "doc_1",
      period: "2026-04",
      reviewer: "reviewer_1",
      accountEntries: [
        { accountId: "acct_usdt", currencyCode: "USDT", amountMinor: -5000, entryDate: "2026-04-24" },
        { accountId: "acct_usdt", currencyCode: "USDT", amountMinor: -7000, entryDate: "2026-04-24" }
      ],
      loanEntries: [
        { borrowerPersonId: "person_1", currencyCode: "USDT", amountMinor: 5000, entryDate: "2026-04-24" },
        { borrowerPersonId: "person_1", currencyCode: "USDT", amountMinor: 7000, entryDate: "2026-04-24" }
      ],
      auditLogStatement: { statement: "audit" }
    });
  });
});
