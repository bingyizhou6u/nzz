import { describe, expect, it, vi } from "vitest";
import { DocumentService } from "../../src/services/documentService";
import type { DocumentDetailRow, DocumentLineRow, LotRow, PendingCostMatchRow } from "../../src/repositories/documentRepository";

type DocumentRepoMock = ConstructorParameters<typeof DocumentService>[0];
type AuditRepoMock = ConstructorParameters<typeof DocumentService>[1];
type MasterDataRepoMock = {
  getPeopleByIds: ReturnType<typeof vi.fn>;
  getProjectsByIds: ReturnType<typeof vi.fn>;
  getMerchantsByIds: ReturnType<typeof vi.fn>;
  getAccountsByIds: ReturnType<typeof vi.fn>;
  getCategoriesByIds: ReturnType<typeof vi.fn>;
  getCurrenciesByCodes: ReturnType<typeof vi.fn>;
};
type AtomicDocumentRepoMock = DocumentRepoMock & {
  createDraft: ReturnType<typeof vi.fn>;
  listOpenLotsForAccount: ReturnType<typeof vi.fn>;
  listOpenPendingCostMatches: ReturnType<typeof vi.fn>;
  listOpenLoanItems: ReturnType<typeof vi.fn>;
  listAccountEntriesForDocument: ReturnType<typeof vi.fn>;
  listLoanEntriesForDocument: ReturnType<typeof vi.fn>;
  listLotMovementsForDocument: ReturnType<typeof vi.fn>;
  listLotsCreatedByDocument: ReturnType<typeof vi.fn>;
  listPendingCostMatchesForDocument: ReturnType<typeof vi.fn>;
  listLotsByIds: ReturnType<typeof vi.fn>;
  listLaterMovementLotIds: ReturnType<typeof vi.fn>;
  listLoanItemsCreatedByDocument: ReturnType<typeof vi.fn>;
  listLoanAllocationsForDocument: ReturnType<typeof vi.fn>;
  listLoanItemsByIds: ReturnType<typeof vi.fn>;
  listLaterLoanAllocationItemIds: ReturnType<typeof vi.fn>;
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
    operator_person_id: "person_bob",
    project_id: "proj_1",
    merchant_id: "merchant_1",
    category_id: "cat_income",
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

function lotRow(overrides: Partial<LotRow> = {}): LotRow {
  return {
    id: "lot_a",
    currency_code: "AED",
    remaining_amount_minor: 150000,
    remaining_usdt_cost_minor: 41000,
    lot_date: "2026-04-20",
    ...overrides
  };
}

function pendingCostMatchRow(overrides: Partial<PendingCostMatchRow> = {}): PendingCostMatchRow {
  return {
    id: "pending_old",
    remaining_amount_minor: 120000,
    expense_date: "2026-04-22",
    created_at: "2026-04-22T10:00:00.000Z",
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
    listOpenLotsForAccount: vi.fn(async () => []),
    listOpenPendingCostMatches: vi.fn(async () => []),
    listOpenLoanItems: vi.fn(async () => []),
    listAccountEntriesForDocument: vi.fn(async () => []),
    listLoanEntriesForDocument: vi.fn(async () => []),
    listLotMovementsForDocument: vi.fn(async () => []),
    listLotsCreatedByDocument: vi.fn(async () => []),
    listPendingCostMatchesForDocument: vi.fn(async () => []),
    listLotsByIds: vi.fn(async () => []),
    listLaterMovementLotIds: vi.fn(async () => []),
    listLoanItemsCreatedByDocument: vi.fn(async () => []),
    listLoanAllocationsForDocument: vi.fn(async () => []),
    listLoanItemsByIds: vi.fn(async () => []),
    listLaterLoanAllocationItemIds: vi.fn(async () => []),
    approveWithPostings: vi.fn(async () => undefined),
    ...overrides
  } satisfies AtomicDocumentRepoMock;
  const audit = {
    record: vi.fn(async () => undefined),
    prepareRecordWhen: vi.fn(() => ({ statement: "audit" }) as unknown as D1PreparedStatement)
  } satisfies AtomicAuditRepoMock;
  const masterData = {
    getPeopleByIds: vi.fn(async () => [
      { id: "creator_1", name: "Creator", alias: null, roles_json: "[]", is_enabled: 1 },
      { id: "submitter_1", name: "Submitter", alias: null, roles_json: "[]", is_enabled: 1 },
      { id: "reviewer_1", name: "Reviewer", alias: null, roles_json: "[]", is_enabled: 1 },
      { id: "person_bob", name: "Bob", alias: null, roles_json: "[]", is_enabled: 1 },
      { id: "person_borrower", name: "Borrower", alias: null, roles_json: "[]", is_enabled: 1 },
      { id: "person_1", name: "Person 1", alias: null, roles_json: "[]", is_enabled: 1 },
      { id: "person_2", name: "Person 2", alias: null, roles_json: "[]", is_enabled: 1 }
    ]),
    getProjectsByIds: vi.fn(async () => [
      { id: "proj_1", code: "P1", name: "Project", owner_person_id: null, status: "active" }
    ]),
    getMerchantsByIds: vi.fn(async () => [
      {
        id: "merchant_1",
        code: "M1",
        name: "Merchant",
        project_id: "proj_1",
        merchant_type: "site",
        status: "active"
      }
    ]),
    getAccountsByIds: vi.fn(async () => [
      {
        id: "acct_usdt",
        name: "USDT Wallet",
        account_type: "usdt_wallet",
        currency_code: "USDT",
        owner_person_id: null,
        is_company_account: 1,
        allow_negative: 0,
        status: "active"
      },
      {
        id: "acct_usdt_main",
        name: "USDT Main",
        account_type: "usdt_wallet",
        currency_code: "USDT",
        owner_person_id: null,
        is_company_account: 1,
        allow_negative: 0,
        status: "active"
      },
      {
        id: "acct_usdt_backup",
        name: "USDT Backup",
        account_type: "usdt_wallet",
        currency_code: "USDT",
        owner_person_id: null,
        is_company_account: 1,
        allow_negative: 0,
        status: "active"
      },
      {
        id: "acct_aed_reserve",
        name: "AED Reserve",
        account_type: "currency_reserve",
        currency_code: "AED",
        owner_person_id: null,
        is_company_account: 1,
        allow_negative: 0,
        status: "active"
      },
      {
        id: "acct_aed_bank",
        name: "AED Bank",
        account_type: "currency_reserve",
        currency_code: "AED",
        owner_person_id: null,
        is_company_account: 1,
        allow_negative: 0,
        status: "active"
      },
      {
        id: "acct_aed",
        name: "AED Account",
        account_type: "currency_reserve",
        currency_code: "AED",
        owner_person_id: null,
        is_company_account: 1,
        allow_negative: 0,
        status: "active"
      },
      {
        id: "acct_aed_cash",
        name: "AED Cash",
        account_type: "currency_reserve",
        currency_code: "AED",
        owner_person_id: null,
        is_company_account: 1,
        allow_negative: 0,
        status: "active"
      },
      {
        id: "acct_petty_bob",
        name: "Bob AED Petty",
        account_type: "petty_cash",
        currency_code: "AED",
        owner_person_id: "person_bob",
        is_company_account: 0,
        allow_negative: 1,
        status: "active"
      }
    ]),
    getCategoriesByIds: vi.fn(async () => [
      {
        id: "cat_income",
        name: "Income",
        parent_id: null,
        category_type: "income",
        direction: "in",
        affects_expense_report: 0,
        affects_project_report: 1,
        requires_merchant: 1,
        requires_person: 0,
        requires_borrower: 0,
        is_enabled: 1
      },
      {
        id: "cat_exchange",
        name: "Exchange",
        parent_id: null,
        category_type: "exchange",
        direction: "in",
        affects_expense_report: 0,
        affects_project_report: 0,
        requires_merchant: 0,
        requires_person: 0,
        requires_borrower: 0,
        is_enabled: 1
      },
      {
        id: "cat_loan",
        name: "Loan",
        parent_id: null,
        category_type: "loan",
        direction: "out",
        affects_expense_report: 0,
        affects_project_report: 0,
        requires_merchant: 0,
        requires_person: 0,
        requires_borrower: 1,
        is_enabled: 1
      },
      {
        id: "cat_expense",
        name: "Expense",
        parent_id: null,
        category_type: "expense",
        direction: "out",
        affects_expense_report: 1,
        affects_project_report: 0,
        requires_merchant: 0,
        requires_person: 0,
        requires_borrower: 0,
        is_enabled: 1
      },
      {
        id: "cat_bad_debt",
        name: "Bad Debt",
        parent_id: null,
        category_type: "loss",
        direction: "out",
        affects_expense_report: 1,
        affects_project_report: 0,
        requires_merchant: 0,
        requires_person: 0,
        requires_borrower: 1,
        is_enabled: 1
      }
    ]),
    getCurrenciesByCodes: vi.fn(async () => [
      { code: "USDT", name: "Tether", minor_units: 2, is_enabled: 1 },
      { code: "AED", name: "Dirham", minor_units: 2, is_enabled: 1 }
    ])
  } satisfies MasterDataRepoMock;

  return { repo, audit, masterData, service: new DocumentService(repo, audit, masterData) };
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
      merchantId: "merchant_1",
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
      merchantId: "merchant_1",
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

  it("keeps header-only draft creation flexible", async () => {
    const { repo, masterData, service } = createMocks();

    await service.createDraft({
      documentType: "project_income",
      businessDate: "2026-04-24",
      period: "2026-04",
      summary: "Header draft",
      createdBy: "creator_1"
    });

    expect(repo.createDraft).toHaveBeenCalled();
    expect(masterData.getAccountsByIds).not.toHaveBeenCalled();
  });

  it("rejects draft creation when provided exchange lines are structurally invalid", async () => {
    const { repo, service } = createMocks();

    await expect(
      service.createDraft({
        documentType: "exchange",
        businessDate: "2026-04-24",
        period: "2026-04",
        categoryId: "cat_exchange",
        summary: "Exchange",
        createdBy: "creator_1",
        lines: [{ accountId: "acct_aed_reserve", currencyCode: "AED", amountMinor: 10000 }]
      })
    ).rejects.toThrow("必须选择对方账户");

    expect(repo.createDraftWithLines).not.toHaveBeenCalled();
  });

  it("rejects submit when a draft is incomplete", async () => {
    const { repo, audit, service } = createMocks({
      getDocument: vi.fn(async () => documentRow({ status: "draft", merchant_id: null })),
      getDocumentLines: vi.fn(async () => [lineRow()])
    });

    await expect(service.submit("doc_1", "submitter_1")).rejects.toThrow("项目收入必须选择商户");

    expect(repo.markSubmitted).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("rejects submit when referenced account is archived", async () => {
    const { repo, audit, masterData, service } = createMocks({
      getDocument: vi.fn(async () =>
        documentRow({
          status: "draft",
          operator_person_id: "person_bob",
          project_id: "proj_1",
          merchant_id: "merchant_1",
          category_id: "cat_income"
        })
      ),
      getDocumentLines: vi.fn(async () => [lineRow()])
    });
    masterData.getAccountsByIds.mockResolvedValueOnce([
      {
        id: "acct_usdt",
        name: "Old USDT",
        account_type: "usdt_wallet",
        currency_code: "USDT",
        owner_person_id: null,
        is_company_account: 1,
        allow_negative: 0,
        status: "archived"
      }
    ]);

    await expect(service.submit("doc_1", "submitter_1")).rejects.toThrow("账户必须是启用状态");

    expect(repo.markSubmitted).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("ignores stale optional original linkage for normal documents that do not require it", async () => {
    const getDocument = vi
      .fn()
      .mockResolvedValueOnce(documentRow({ status: "draft", original_document_id: "doc_stale" }))
      .mockResolvedValueOnce(null);
    const { repo, service } = createMocks({ getDocument });

    await service.submit("doc_1", "submitter_1");

    expect(getDocument).toHaveBeenCalledTimes(1);
    expect(repo.markSubmitted).toHaveBeenCalledWith("doc_1");
  });

  it("requests persisted submit master data for referenced ids", async () => {
    const { masterData, service } = createMocks({
      getDocument: vi.fn(async () =>
        documentRow({
          status: "draft",
          document_type: "loan_out",
          operator_person_id: "person_1",
          project_id: null,
          merchant_id: null,
          category_id: "cat_loan"
        })
      ),
      getDocumentLines: vi.fn(async () => [
        lineRow({
          account_id: "acct_aed",
          person_id: "person_bob",
          borrower_person_id: "person_borrower",
          currency_code: "AED",
          amount_minor: 10000,
          usdt_amount_minor: 10000
        })
      ])
    });

    await service.submit("doc_1", "submitter_1");

    expect(masterData.getPeopleByIds).toHaveBeenCalledWith(["person_1", "person_bob", "person_borrower"]);
    expect(masterData.getProjectsByIds).toHaveBeenCalledWith([]);
    expect(masterData.getMerchantsByIds).toHaveBeenCalledWith([]);
    expect(masterData.getAccountsByIds).toHaveBeenCalledWith(["acct_aed"]);
    expect(masterData.getCategoriesByIds).toHaveBeenCalledWith(["cat_loan"]);
    expect(masterData.getCurrenciesByCodes).toHaveBeenCalledWith(["AED"]);
  });

  it("requests persisted approve master data for referenced ids", async () => {
    const { masterData, service } = createMocks({
      getDocument: vi.fn(async () =>
        documentRow({
          status: "pending",
          document_type: "loan_out",
          operator_person_id: "person_1",
          project_id: null,
          merchant_id: null,
          category_id: "cat_loan"
        })
      ),
      getDocumentLines: vi.fn(async () => [
        lineRow({
          account_id: "acct_aed",
          person_id: "person_bob",
          borrower_person_id: "person_borrower",
          currency_code: "AED",
          amount_minor: 10000,
          usdt_amount_minor: 10000
        })
      ])
    });

    await service.approve("doc_1", "reviewer_1");

    expect(masterData.getPeopleByIds).toHaveBeenCalledWith(["person_1", "person_bob", "person_borrower"]);
    expect(masterData.getProjectsByIds).toHaveBeenCalledWith([]);
    expect(masterData.getMerchantsByIds).toHaveBeenCalledWith([]);
    expect(masterData.getAccountsByIds).toHaveBeenCalledWith(["acct_aed"]);
    expect(masterData.getCategoriesByIds).toHaveBeenCalledWith(["cat_loan"]);
    expect(masterData.getCurrenciesByCodes).toHaveBeenCalledWith(["AED"]);
  });

  it("rejects approve before posting when master data validation fails", async () => {
    const { repo, masterData, service } = createMocks({
      getDocument: vi.fn(async () =>
        documentRow({
          status: "pending",
          operator_person_id: "person_bob",
          project_id: "proj_1",
          merchant_id: "merchant_1",
          category_id: "cat_income"
        })
      ),
      getDocumentLines: vi.fn(async () => [lineRow()])
    });
    masterData.getMerchantsByIds.mockResolvedValueOnce([
      {
        id: "merchant_1",
        code: "M1",
        name: "Merchant",
        project_id: "proj_other",
        merchant_type: "site",
        status: "active"
      }
    ]);

    await expect(service.approve("doc_1", "reviewer_1")).rejects.toThrow("商户必须属于所选项目");

    expect(repo.approveWithPostings).not.toHaveBeenCalled();
  });

  it("approves reversal without checking historical master data active status", async () => {
    const { repo, masterData, service } = createMocks({
      getDocument: vi
        .fn()
        .mockResolvedValueOnce(
          documentRow({
            id: "doc_reversal",
            status: "pending",
            action_type: "reversal",
            original_document_id: "doc_original"
          })
        )
        .mockResolvedValueOnce(documentRow({ id: "doc_original", status: "approved" })),
      listAccountEntriesForDocument: vi.fn(async () => [
        { account_id: "acct_usdt", currency_code: "USDT", amount_minor: 10000 }
      ])
    });
    masterData.getAccountsByIds.mockResolvedValueOnce([]);

    await service.approve("doc_reversal", "reviewer_1");

    expect(repo.approveWithPostings).toHaveBeenCalled();
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
      lotCreations: [],
      lotUpdates: [],
      lotMovements: [],
      pendingCostCreations: [],
      pendingCostUpdates: [],
      pendingCostApplications: [],
      loanItemCreations: [],
      loanItemUpdates: [],
      loanAllocations: [],
      auditLogStatement: { statement: "audit" }
    });
    expect(repo.insertAccountEntries).not.toHaveBeenCalled();
    expect(repo.insertLoanEntries).not.toHaveBeenCalled();
    expect(repo.markApproved).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("previews pending project income approval without posting or audit writes", async () => {
    const { repo, audit, service } = createMocks({
      getDocument: vi.fn(async () => documentRow({ status: "pending" })),
      getDocumentLines: vi.fn(async () => [lineRow({ amount_minor: 15000 })])
    });

    const preview = await service.previewApproval("doc_1");

    expect(repo.isPeriodLocked).toHaveBeenCalledWith("2026-04");
    expect(preview).toEqual({
      accountEntries: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 15000, entryDate: "2026-04-24" }],
      loanEntries: [],
      lotCreations: [],
      lotUpdates: [],
      lotMovements: [],
      pendingCostCreations: [],
      pendingCostUpdates: [],
      pendingCostApplications: [],
      loanItemCreations: [],
      loanItemUpdates: [],
      loanAllocations: []
    });
    expect(repo.approveWithPostings).not.toHaveBeenCalled();
    expect(repo.markApproved).not.toHaveBeenCalled();
    expect(audit.prepareRecordWhen).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("previews normal exchange approval effects", async () => {
    const { service } = createMocks({
      getDocument: vi.fn(async () =>
        documentRow({ status: "pending", document_type: "exchange", category_id: "cat_exchange" })
      ),
      getDocumentLines: vi.fn(async () => [
        lineRow({
          account_id: "acct_aed_reserve",
          counterparty_account_id: "acct_usdt_main",
          currency_code: "AED",
          amount_minor: 367000,
          usdt_amount_minor: 100000
        })
      ])
    });

    const preview = await service.previewApproval("doc_1");

    expect(preview.accountEntries).toEqual([
      { accountId: "acct_usdt_main", currencyCode: "USDT", amountMinor: -100000, entryDate: "2026-04-24" },
      { accountId: "acct_aed_reserve", currencyCode: "AED", amountMinor: 367000, entryDate: "2026-04-24" }
    ]);
    expect(preview.lotCreations).toEqual([
      expect.objectContaining({
        clientLotId: "doc_1:lot:1",
        currentAccountId: "acct_aed_reserve",
        currencyCode: "AED",
        remainingAmountMinor: 367000,
        remainingUsdtCostMinor: 100000
      })
    ]);
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

    await expect(service.approve("doc_1", "reviewer_1")).rejects.toThrow("单据类型暂不支持创建或审核");

    expect(repo.approveWithPostings).not.toHaveBeenCalled();
    expect(audit.prepareRecordWhen).not.toHaveBeenCalled();
  });

  it("approves exchange documents with lot creation effects", async () => {
    const { repo, service } = createMocks({
      getDocument: vi.fn(async () =>
        documentRow({ status: "pending", document_type: "exchange", category_id: "cat_exchange" })
      ),
      getDocumentLines: vi.fn(async () => [
        lineRow({
          account_id: "acct_aed_reserve",
          counterparty_account_id: "acct_usdt_main",
          currency_code: "AED",
          amount_minor: 367000,
          usdt_amount_minor: 100000
        })
      ])
    });

    await service.approve("doc_1", "reviewer_1");

    expect(repo.approveWithPostings).toHaveBeenCalledWith(expect.objectContaining({
      documentId: "doc_1",
      accountEntries: [
        { accountId: "acct_usdt_main", currencyCode: "USDT", amountMinor: -100000, entryDate: "2026-04-24" },
        { accountId: "acct_aed_reserve", currencyCode: "AED", amountMinor: 367000, entryDate: "2026-04-24" }
      ],
      lotCreations: [
        {
          clientLotId: "doc_1:lot:1",
          currencyCode: "AED",
          originalAmountMinor: 367000,
          remainingAmountMinor: 367000,
          originalUsdtCostMinor: 100000,
          remainingUsdtCostMinor: 100000,
          sourceDocumentId: "doc_1",
          currentAccountId: "acct_aed_reserve",
          currentPersonId: null,
          lotDate: "2026-04-24"
        }
      ],
      lotMovements: [
        {
          lotId: "doc_1:lot:1",
          movementType: "exchange_in",
          fromAccountId: null,
          toAccountId: "acct_aed_reserve",
          fromPersonId: null,
          toPersonId: null,
          amountMinor: 367000,
          usdtCostMinor: 100000,
          movementDate: "2026-04-24"
        }
      ],
      pendingCostCreations: [],
      pendingCostUpdates: []
    }));
  });

  it("approves petty cash reimbursements with staff lot reads and pending cost creations for unmatched amount", async () => {
    const { repo, service } = createMocks({
      getDocument: vi.fn(async () =>
        documentRow({ status: "pending", document_type: "petty_cash_reimbursement", category_id: "cat_expense" })
      ),
      getDocumentLines: vi.fn(async () => [
        lineRow({
          account_id: "acct_petty_bob",
          person_id: "person_bob",
          currency_code: "AED",
          amount_minor: 215000
        })
      ]),
      listOpenLotsForAccount: vi.fn(async () => [
        lotRow({ id: "lot_staff", remaining_amount_minor: 150000, remaining_usdt_cost_minor: 41000 })
      ])
    });

    await service.approve("doc_1", "reviewer_1");

    expect(repo.listOpenLotsForAccount).toHaveBeenCalledWith({
      accountId: "acct_petty_bob",
      personId: "person_bob",
      currencyCode: "AED"
    });
    expect(repo.approveWithPostings).toHaveBeenCalledWith(expect.objectContaining({
      lotUpdates: [
        {
          lotId: "lot_staff",
          amountDeltaMinor: -150000,
          usdtCostDeltaMinor: -41000,
          expectedRemainingAmountMinor: 150000,
          expectedRemainingUsdtCostMinor: 41000
        }
      ],
      lotMovements: [
        {
          lotId: "lot_staff",
          movementType: "petty_cash_reimbursement",
          fromAccountId: "acct_petty_bob",
          toAccountId: null,
          fromPersonId: "person_bob",
          toPersonId: null,
          amountMinor: 150000,
          usdtCostMinor: 41000,
          movementDate: "2026-04-24"
        }
      ],
      pendingCostCreations: [
        {
          documentId: "doc_1",
          personId: "person_bob",
          accountId: "acct_petty_bob",
          currencyCode: "AED",
          amountMinor: 65000,
          remainingAmountMinor: 65000,
          expenseDate: "2026-04-24"
        }
      ],
      pendingCostUpdates: []
    }));
  });

  it("approves petty cash issues with reserve lots and staff pending cost matches", async () => {
    const { repo, service } = createMocks({
      getDocument: vi.fn(async () => documentRow({ status: "pending", document_type: "petty_cash_issue" })),
      getDocumentLines: vi.fn(async () => [
        lineRow({
          account_id: "acct_aed_reserve",
          counterparty_account_id: "acct_petty_bob",
          person_id: "person_bob",
          currency_code: "AED",
          amount_minor: 200000
        })
      ]),
      listOpenLotsForAccount: vi.fn(async () => [
        lotRow({ id: "lot_a", remaining_amount_minor: 150000, remaining_usdt_cost_minor: 41000, lot_date: "2026-04-20" }),
        lotRow({ id: "lot_b", remaining_amount_minor: 100000, remaining_usdt_cost_minor: 27300, lot_date: "2026-04-21" })
      ]),
      listOpenPendingCostMatches: vi.fn(async () => [
        pendingCostMatchRow({ id: "pending_old", remaining_amount_minor: 160000 })
      ])
    });

    await service.approve("doc_1", "reviewer_1");

    expect(repo.listOpenLotsForAccount).toHaveBeenCalledWith({
      accountId: "acct_aed_reserve",
      personId: null,
      currencyCode: "AED"
    });
    expect(repo.listOpenPendingCostMatches).toHaveBeenCalledWith({
      accountId: "acct_petty_bob",
      personId: "person_bob",
      currencyCode: "AED"
    });
    expect(repo.approveWithPostings).toHaveBeenCalledWith(expect.objectContaining({
      lotCreations: [
        expect.objectContaining({
          clientLotId: "doc_1:issue:1",
          remainingAmountMinor: 0,
          remainingUsdtCostMinor: 0,
          currentAccountId: "acct_petty_bob",
          currentPersonId: "person_bob"
        }),
        expect.objectContaining({
          clientLotId: "doc_1:issue:2",
          remainingAmountMinor: 40000,
          remainingUsdtCostMinor: 10920,
          currentAccountId: "acct_petty_bob",
          currentPersonId: "person_bob"
        })
      ],
      lotUpdates: [
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
      ],
      lotMovements: expect.arrayContaining([
        {
          lotId: "lot_a",
          movementType: "petty_cash_issue",
          fromAccountId: "acct_aed_reserve",
          toAccountId: "acct_petty_bob",
          fromPersonId: null,
          toPersonId: "person_bob",
          amountMinor: 150000,
          usdtCostMinor: 41000,
          movementDate: "2026-04-24"
        },
        {
          lotId: "doc_1:issue:2",
          movementType: "pending_cost_match",
          fromAccountId: "acct_petty_bob",
          toAccountId: null,
          fromPersonId: "person_bob",
          toPersonId: null,
          amountMinor: 10000,
          usdtCostMinor: 2730,
          movementDate: "2026-04-24"
        }
      ]),
      pendingCostCreations: [],
      pendingCostUpdates: [
        { pendingCostMatchId: "pending_old", amountDeltaMinor: -160000, expectedRemainingAmountMinor: 160000 }
      ]
    }));
  });

  it("rejects exchange approval without a USDT cost before approval writes", async () => {
    const { repo, service } = createMocks({
      getDocument: vi.fn(async () =>
        documentRow({ status: "pending", document_type: "exchange", category_id: "cat_exchange" })
      ),
      getDocumentLines: vi.fn(async () => [
        lineRow({
          account_id: "acct_aed_reserve",
          counterparty_account_id: "acct_usdt_main",
          currency_code: "AED",
          amount_minor: 367000,
          usdt_amount_minor: null
        })
      ])
    });

    await expect(service.approve("doc_1", "reviewer_1")).rejects.toThrow("必须填写 USDT 成本");

    expect(repo.approveWithPostings).not.toHaveBeenCalled();
  });

  it("rejects multi-line FIFO approvals before approval writes", async () => {
    const { repo, audit, service } = createMocks({
      getDocument: vi.fn(async () =>
        documentRow({ status: "pending", document_type: "exchange", category_id: "cat_exchange" })
      ),
      getDocumentLines: vi.fn(async () => [
        lineRow({
          account_id: "acct_aed_reserve",
          counterparty_account_id: "acct_usdt_main",
          currency_code: "AED",
          amount_minor: 367000,
          usdt_amount_minor: 100000
        }),
        lineRow({
          id: "line_2",
          line_no: 2,
          account_id: "acct_aed_reserve",
          counterparty_account_id: "acct_usdt_main",
          currency_code: "AED",
          amount_minor: 100000,
          usdt_amount_minor: 27248
        })
      ])
    });

    await expect(service.approve("doc_1", "reviewer_1")).rejects.toThrow("当前单据类型必须只有一条明细");

    expect(repo.approveWithPostings).not.toHaveBeenCalled();
    expect(audit.prepareRecordWhen).not.toHaveBeenCalled();
  });

  it("creates loan items when approving loan out", async () => {
    const { repo, service } = createMocks({
      getDocument: vi.fn(async () =>
        documentRow({
          status: "pending",
          document_type: "loan_out",
          business_date: "2026-04-25",
          category_id: "cat_loan"
        })
      ),
      getDocumentLines: vi.fn(async () => [
        lineRow({
          id: "line_1",
          account_id: "acct_aed",
          borrower_person_id: "person_borrower",
          currency_code: "AED",
          amount_minor: 367000,
          usdt_amount_minor: 100000
        })
      ])
    });

    await service.approve("doc_1", "reviewer_1");

    expect(repo.listOpenLoanItems).not.toHaveBeenCalled();
    expect(repo.approveWithPostings).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc_1",
        accountEntries: [
          { accountId: "acct_aed", currencyCode: "AED", amountMinor: -367000, entryDate: "2026-04-25" }
        ],
        loanEntries: [
          {
            borrowerPersonId: "person_borrower",
            currencyCode: "AED",
            amountMinor: 367000,
            usdtCostMinor: 100000,
            entryDate: "2026-04-25"
          }
        ],
        loanItemCreations: [
          {
            clientLoanItemId: "doc_1:loan:1",
            sourceDocumentId: "doc_1",
            sourceLineId: "line_1",
            borrowerPersonId: "person_borrower",
            currencyCode: "AED",
            originalAmountMinor: 367000,
            remainingAmountMinor: 367000,
            originalUsdtCostMinor: 100000,
            remainingUsdtCostMinor: 100000,
            loanDate: "2026-04-25"
          }
        ],
        loanItemUpdates: [],
        loanAllocations: []
      })
    );
  });

  it("allocates loan repayment to open loan items", async () => {
    const { repo, service } = createMocks({
      getDocument: vi
        .fn()
        .mockResolvedValueOnce(
          documentRow({
            id: "doc_repay",
            status: "pending",
            document_type: "loan_repayment",
            business_date: "2026-04-25",
            original_document_id: "doc_loan"
          })
        )
        .mockResolvedValueOnce(documentRow({ id: "doc_loan", status: "approved", document_type: "loan_out" })),
      getDocumentLines: vi
        .fn()
        .mockResolvedValueOnce([
          lineRow({
            account_id: "acct_aed",
            borrower_person_id: "person_borrower",
            currency_code: "AED",
            amount_minor: 100000,
            usdt_amount_minor: null
          })
        ])
        .mockResolvedValueOnce([
          lineRow({
            document_id: "doc_loan",
            account_id: "acct_aed",
            borrower_person_id: "person_borrower",
            currency_code: "AED",
            amount_minor: 367000,
            usdt_amount_minor: 100000
          })
        ]),
      listOpenLoanItems: vi.fn(async () => [
        {
          id: "loan_item_1",
          source_document_id: "doc_loan",
          borrower_person_id: "person_borrower",
          currency_code: "AED",
          remaining_amount_minor: 100000,
          remaining_usdt_cost_minor: 27000,
          loan_date: "2026-04-01",
          created_at: "2026-04-01T10:00:00.000Z"
        }
      ])
    });

    await service.approve("doc_repay", "reviewer_1");

    expect(repo.listOpenLoanItems).toHaveBeenCalledWith({
      borrowerPersonId: "person_borrower",
      currencyCode: "AED",
      targetSourceDocumentId: "doc_loan"
    });
    expect(repo.approveWithPostings).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc_repay",
        accountEntries: [{ accountId: "acct_aed", currencyCode: "AED", amountMinor: 100000, entryDate: "2026-04-25" }],
        loanEntries: [
          {
            borrowerPersonId: "person_borrower",
            currencyCode: "AED",
            amountMinor: -100000,
            usdtCostMinor: -27000,
            entryDate: "2026-04-25"
          }
        ],
        loanItemUpdates: [
          {
            loanItemId: "loan_item_1",
            amountDeltaMinor: -100000,
            usdtCostDeltaMinor: -27000,
            expectedRemainingAmountMinor: 100000,
            expectedRemainingUsdtCostMinor: 27000
          }
        ],
        loanAllocations: [
          {
            loanItemId: "loan_item_1",
            allocationType: "repayment",
            amountMinor: 100000,
            usdtCostMinor: 27000,
            allocationDate: "2026-04-25"
          }
        ]
      })
    );
  });

  it("approves loan writeoff with loan allocation effects and no account entries", async () => {
    const { repo, service } = createMocks({
      getDocument: vi
        .fn()
        .mockResolvedValueOnce(
          documentRow({
            id: "doc_writeoff",
            status: "pending",
            document_type: "loan_writeoff",
            business_date: "2026-04-25",
            category_id: "cat_bad_debt",
            original_document_id: "doc_loan"
          })
        )
        .mockResolvedValueOnce(documentRow({ id: "doc_loan", status: "approved", document_type: "loan_out" })),
      getDocumentLines: vi
        .fn()
        .mockResolvedValueOnce([
          lineRow({
            account_id: null,
            borrower_person_id: "person_borrower",
            currency_code: "AED",
            amount_minor: 25000,
            usdt_amount_minor: null
          })
        ])
        .mockResolvedValueOnce([
          lineRow({
            document_id: "doc_loan",
            account_id: "acct_aed",
            borrower_person_id: "person_borrower",
            currency_code: "AED",
            amount_minor: 100000,
            usdt_amount_minor: 27000
          })
        ]),
      listOpenLoanItems: vi.fn(async () => [
        {
          id: "loan_item_1",
          source_document_id: "doc_loan",
          borrower_person_id: "person_borrower",
          currency_code: "AED",
          remaining_amount_minor: 100000,
          remaining_usdt_cost_minor: 27000,
          loan_date: "2026-04-01",
          created_at: "2026-04-01T10:00:00.000Z"
        }
      ])
    });

    await service.approve("doc_writeoff", "reviewer_1");

    expect(repo.approveWithPostings).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: "doc_writeoff",
        accountEntries: [],
        loanEntries: [
          {
            borrowerPersonId: "person_borrower",
            currencyCode: "AED",
            amountMinor: -25000,
            usdtCostMinor: -6750,
            entryDate: "2026-04-25"
          }
        ],
        loanAllocations: [
          expect.objectContaining({
            loanItemId: "loan_item_1",
            allocationType: "writeoff",
            amountMinor: 25000,
            usdtCostMinor: 6750
          })
        ]
      })
    );
  });

  it("requires category for loan writeoff approval", async () => {
    const { repo, service } = createMocks({
      getDocument: vi.fn(async () => documentRow({ status: "pending", document_type: "loan_writeoff", category_id: null })),
      getDocumentLines: vi.fn(async () => [
        lineRow({ account_id: null, borrower_person_id: "person_borrower", currency_code: "AED", amount_minor: 10000 })
      ])
    });

    await expect(service.approve("doc_writeoff", "reviewer_1")).rejects.toThrow("必须选择科目");

    expect(repo.approveWithPostings).not.toHaveBeenCalled();
  });

  it.each(["loan_repayment", "loan_writeoff"] as const)("rejects multi-line %s approvals", async (documentType) => {
    const { repo, service } = createMocks({
      getDocument: vi.fn(async () =>
        documentRow({
          status: "pending",
          document_type: documentType,
          category_id: documentType === "loan_writeoff" ? "cat_bad_debt" : null,
          original_document_id: "doc_loan"
        })
      ),
      getDocumentLines: vi.fn(async () => [
        lineRow({ borrower_person_id: "person_borrower", currency_code: "AED", amount_minor: 5000 }),
        lineRow({ id: "line_2", line_no: 2, borrower_person_id: "person_borrower", currency_code: "AED", amount_minor: 7000 })
      ])
    });

    await expect(service.approve("doc_1", "reviewer_1")).rejects.toThrow("当前单据类型必须只有一条明细");

    expect(repo.listOpenLoanItems).not.toHaveBeenCalled();
    expect(repo.approveWithPostings).not.toHaveBeenCalled();
  });

  it("rejects loan approvals when any line is missing borrower", async () => {
    const { repo, service } = createMocks({
      getDocument: vi.fn(async () =>
        documentRow({ status: "pending", document_type: "loan_out", category_id: "cat_loan" })
      ),
      getDocumentLines: vi.fn(async () => [
        lineRow({ borrower_person_id: null, amount_minor: 5000, usdt_amount_minor: 5000 }),
        lineRow({ id: "line_2", line_no: 2, borrower_person_id: "person_1", amount_minor: 7000, usdt_amount_minor: 7000 })
      ])
    });

    await expect(service.approve("doc_1", "reviewer_1")).rejects.toThrow("borrowerPersonId is required for loan_out");

    expect(repo.approveWithPostings).not.toHaveBeenCalled();
  });

  it.each(["loan_repayment", "loan_writeoff"] as const)(
    "rejects %s approvals when borrower is missing",
    async (documentType) => {
      const { repo, service } = createMocks({
        getDocument: vi.fn(async () =>
          documentRow({
            status: "pending",
            document_type: documentType,
            category_id: documentType === "loan_writeoff" ? "cat_bad_debt" : null,
            original_document_id: "doc_loan"
          })
        ),
        getDocumentLines: vi.fn(async () => [
          lineRow({ borrower_person_id: null, currency_code: "AED", amount_minor: 5000 })
        ])
      });

      await expect(service.approve("doc_1", "reviewer_1")).rejects.toThrow("必须选择借款人");

      expect(repo.approveWithPostings).not.toHaveBeenCalled();
    }
  );

  it("rejects loan approvals with mixed borrowers", async () => {
    const { repo, service } = createMocks({
      getDocument: vi.fn(async () =>
        documentRow({ status: "pending", document_type: "loan_out", category_id: "cat_loan" })
      ),
      getDocumentLines: vi.fn(async () => [
        lineRow({ borrower_person_id: "person_1", amount_minor: 5000, usdt_amount_minor: 5000 }),
        lineRow({ id: "line_2", line_no: 2, borrower_person_id: "person_2", amount_minor: 7000, usdt_amount_minor: 7000 })
      ])
    });

    await expect(service.approve("doc_1", "reviewer_1")).rejects.toThrow("借款人必须与原借款单一致");

    expect(repo.approveWithPostings).not.toHaveBeenCalled();
  });

  it.each(["loan_repayment", "loan_writeoff"] as const)(
    "rejects %s approvals with mixed borrowers",
    async (documentType) => {
      const { repo, service } = createMocks({
        getDocument: vi.fn(async () =>
          documentRow({
            status: "pending",
            document_type: documentType,
            category_id: documentType === "loan_writeoff" ? "cat_bad_debt" : null,
            original_document_id: "doc_loan"
          })
        ),
        getDocumentLines: vi.fn(async () => [
          lineRow({ borrower_person_id: "person_1", currency_code: "AED", amount_minor: 5000 }),
          lineRow({ id: "line_2", line_no: 2, borrower_person_id: "person_2", currency_code: "AED", amount_minor: 7000 })
        ])
      });

      await expect(service.approve("doc_1", "reviewer_1")).rejects.toThrow("当前单据类型必须只有一条明细");

      expect(repo.approveWithPostings).not.toHaveBeenCalled();
    }
  );

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
        accountEntries: [
          { accountId: "acct_usdt_main", currencyCode: "USDT", amountMinor: -50000, entryDate: "2026-04-24" },
          { accountId: "acct_usdt_backup", currencyCode: "USDT", amountMinor: 50000, entryDate: "2026-04-24" }
        ],
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

  it("approves reversals from original approved account and loan entries", async () => {
    const { repo, audit, service } = createMocks({
      getDocument: vi
        .fn()
        .mockResolvedValueOnce(documentRow({
          id: "doc_rev",
          status: "pending",
          action_type: "reversal",
          document_type: "loan_out",
          original_document_id: "doc_original",
          business_date: "2026-04-25"
        }))
        .mockResolvedValueOnce(documentRow({
          id: "doc_original",
          status: "approved",
          document_type: "loan_out",
          action_type: "normal",
          business_date: "2026-04-20"
        })),
      listAccountEntriesForDocument: vi.fn(async () => [
        { account_id: "acct_usdt_main", currency_code: "USDT", amount_minor: -120000 }
      ]),
      listLoanEntriesForDocument: vi.fn(async () => [
        { borrower_person_id: "person_borrower", currency_code: "USDT", amount_minor: 120000, usdt_cost_minor: 120000 }
      ]),
      listLoanItemsCreatedByDocument: vi.fn(async () => [
        {
          id: "loan_item_original",
          original_amount_minor: 120000,
          remaining_amount_minor: 120000,
          original_usdt_cost_minor: 120000,
          remaining_usdt_cost_minor: 120000
        }
      ])
    });

    await service.approve("doc_rev", "reviewer_1");

    expect(repo.getDocument).toHaveBeenCalledWith("doc_rev");
    expect(repo.getDocument).toHaveBeenCalledWith("doc_original");
    expect(repo.getDocumentLines).toHaveBeenCalledWith("doc_rev");
    expect(repo.getDocumentLines).toHaveBeenCalledWith("doc_original");
    expect(audit.prepareRecordWhen).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        sql: expect.stringContaining("original_document_id = ?"),
        bindings: expect.arrayContaining(["doc_original", "doc_rev"])
      })
    );
    const auditCalls = audit.prepareRecordWhen.mock.calls as unknown as Array<
      [unknown, { sql: string; bindings: unknown[] }]
    >;
    const auditCondition = auditCalls[0][1];
    expect(auditCondition.sql).toContain("action_type = 'reversal'");
    expect(auditCondition.sql).toContain("status = 'approved'");
    expect(repo.approveWithPostings).toHaveBeenCalledWith(expect.objectContaining({
      documentId: "doc_rev",
      period: "2026-04",
      reversalOriginalDocumentId: "doc_original",
      accountEntries: [
        { accountId: "acct_usdt_main", currencyCode: "USDT", amountMinor: 120000, entryDate: "2026-04-25" }
      ],
      loanEntries: [
        {
          borrowerPersonId: "person_borrower",
          currencyCode: "USDT",
          amountMinor: -120000,
          usdtCostMinor: -120000,
          entryDate: "2026-04-25"
        }
      ],
      lotCreations: [],
      lotUpdates: [],
      lotMovements: [],
      loanItemUpdates: [
        {
          loanItemId: "loan_item_original",
          amountDeltaMinor: -120000,
          usdtCostDeltaMinor: -120000,
          expectedRemainingAmountMinor: 120000,
          expectedRemainingUsdtCostMinor: 120000
        }
      ],
      loanAllocations: [
        {
          loanItemId: "loan_item_original",
          allocationType: "reversal",
          amountMinor: 120000,
          usdtCostMinor: 120000,
          allocationDate: "2026-04-25"
        }
      ]
    }));
  });

  it("previews reversals from original approved entries without posting or audit writes", async () => {
    const { repo, audit, service } = createMocks({
      getDocument: vi
        .fn()
        .mockResolvedValueOnce(documentRow({
          id: "doc_rev",
          status: "pending",
          action_type: "reversal",
          document_type: "loan_out",
          original_document_id: "doc_original",
          business_date: "2026-04-25"
        }))
        .mockResolvedValueOnce(documentRow({
          id: "doc_original",
          status: "approved",
          document_type: "loan_out",
          action_type: "normal",
          business_date: "2026-04-20"
        })),
      listAccountEntriesForDocument: vi.fn(async () => [
        { account_id: "acct_usdt_main", currency_code: "USDT", amount_minor: -120000 }
      ]),
      listLoanEntriesForDocument: vi.fn(async () => [
        { borrower_person_id: "person_borrower", currency_code: "USDT", amount_minor: 120000, usdt_cost_minor: 120000 }
      ]),
      listLoanItemsCreatedByDocument: vi.fn(async () => [
        {
          id: "loan_item_original",
          original_amount_minor: 120000,
          remaining_amount_minor: 120000,
          original_usdt_cost_minor: 120000,
          remaining_usdt_cost_minor: 120000
        }
      ])
    });

    const preview = await service.previewApproval("doc_rev");

    expect(preview.accountEntries).toEqual([
      { accountId: "acct_usdt_main", currencyCode: "USDT", amountMinor: 120000, entryDate: "2026-04-25" }
    ]);
    expect(preview.loanEntries).toEqual([
      {
        borrowerPersonId: "person_borrower",
        currencyCode: "USDT",
        amountMinor: -120000,
        usdtCostMinor: -120000,
        entryDate: "2026-04-25"
      }
    ]);
    expect(preview.loanItemUpdates).toEqual([
      {
        loanItemId: "loan_item_original",
        amountDeltaMinor: -120000,
        usdtCostDeltaMinor: -120000,
        expectedRemainingAmountMinor: 120000,
        expectedRemainingUsdtCostMinor: 120000
      }
    ]);
    expect(repo.approveWithPostings).not.toHaveBeenCalled();
    expect(audit.prepareRecordWhen).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("rejects loan reversals when loan item snapshots are missing", async () => {
    const { repo, service } = createMocks({
      getDocument: vi
        .fn()
        .mockResolvedValueOnce(documentRow({
          id: "doc_rev",
          status: "pending",
          action_type: "reversal",
          document_type: "loan_out",
          original_document_id: "doc_original",
          business_date: "2026-04-25"
        }))
        .mockResolvedValueOnce(documentRow({
          id: "doc_original",
          status: "approved",
          document_type: "loan_out",
          action_type: "normal",
          business_date: "2026-04-20"
        })),
      listLoanEntriesForDocument: vi.fn(async () => [
        { borrower_person_id: "person_borrower", currency_code: "USDT", amount_minor: 120000, usdt_cost_minor: 120000 }
      ]),
      listLoanItemsCreatedByDocument: vi.fn(async () => [])
    });

    await expect(service.approve("doc_rev", "reviewer_1")).rejects.toThrow(
      "Complex loan reversal requires manual review: loan item snapshots are missing"
    );

    expect(repo.approveWithPostings).not.toHaveBeenCalled();
  });

  it("approves safe exchange reversals with fifo restoration effects", async () => {
    const { repo, service } = createMocks({
      getDocument: vi
        .fn()
        .mockResolvedValueOnce(documentRow({
          id: "doc_rev",
          status: "pending",
          action_type: "reversal",
          document_type: "exchange",
          original_document_id: "doc_fx",
          business_date: "2026-04-25"
        }))
        .mockResolvedValueOnce(documentRow({
          id: "doc_fx",
          status: "approved",
          document_type: "exchange",
          action_type: "normal"
        })),
      listAccountEntriesForDocument: vi.fn(async () => [
        { account_id: "acct_usdt_main", currency_code: "USDT", amount_minor: -100000 },
        { account_id: "acct_aed_reserve", currency_code: "AED", amount_minor: 367000 }
      ]),
      listLotMovementsForDocument: vi.fn(async () => [
        {
          id: "move_fx",
          lot_id: "lot_fx",
          movement_type: "exchange_in",
          from_account_id: null,
          to_account_id: "acct_aed_reserve",
          from_person_id: null,
          to_person_id: null,
          amount_minor: 367000,
          usdt_cost_minor: 100000,
          created_at: "2026-04-24T10:00:00.000Z"
        }
      ]),
      listLotsCreatedByDocument: vi.fn(async () => [
        {
          id: "lot_fx",
          original_amount_minor: 367000,
          remaining_amount_minor: 367000,
          original_usdt_cost_minor: 100000,
          remaining_usdt_cost_minor: 100000,
          source_document_id: "doc_fx",
          current_account_id: "acct_aed_reserve",
          current_person_id: null
        }
      ])
    });

    await service.approve("doc_rev", "reviewer_1");

    expect(repo.listLaterMovementLotIds).toHaveBeenCalledWith({ lotIds: ["lot_fx"], originalDocumentId: "doc_fx" });
    expect(repo.approveWithPostings).toHaveBeenCalledWith(expect.objectContaining({
      accountEntries: [
        { accountId: "acct_usdt_main", currencyCode: "USDT", amountMinor: 100000, entryDate: "2026-04-25" },
        { accountId: "acct_aed_reserve", currencyCode: "AED", amountMinor: -367000, entryDate: "2026-04-25" }
      ],
      lotUpdates: [
        {
          lotId: "lot_fx",
          amountDeltaMinor: -367000,
          usdtCostDeltaMinor: -100000,
          expectedRemainingAmountMinor: 367000,
          expectedRemainingUsdtCostMinor: 100000
        }
      ],
      lotMovements: [
        expect.objectContaining({ lotId: "lot_fx", movementType: "fifo_reversal" })
      ]
    }));
  });

  it("approves safe loan_out reversals with loan item restoration effects", async () => {
    const { repo, service } = createMocks({
      getDocument: vi
        .fn()
        .mockResolvedValueOnce(documentRow({
          id: "doc_rev",
          status: "pending",
          action_type: "reversal",
          document_type: "loan_out",
          original_document_id: "doc_loan",
          business_date: "2026-04-26"
        }))
        .mockResolvedValueOnce(documentRow({
          id: "doc_loan",
          status: "approved",
          document_type: "loan_out",
          action_type: "normal",
          business_date: "2026-04-25"
        })),
      listAccountEntriesForDocument: vi.fn(async () => [
        { account_id: "acct_aed_cash", currency_code: "AED", amount_minor: -100000 }
      ]),
      listLoanEntriesForDocument: vi.fn(async () => [
        { borrower_person_id: "person_borrower", currency_code: "AED", amount_minor: 100000, usdt_cost_minor: 27000 }
      ]),
      listLoanItemsCreatedByDocument: vi.fn(async () => [
        {
          id: "loan_item_1",
          original_amount_minor: 100000,
          remaining_amount_minor: 100000,
          original_usdt_cost_minor: 27000,
          remaining_usdt_cost_minor: 27000
        }
      ]),
      listLoanItemsByIds: vi.fn(async () => [
        {
          id: "loan_item_1",
          original_amount_minor: 100000,
          remaining_amount_minor: 100000,
          original_usdt_cost_minor: 27000,
          remaining_usdt_cost_minor: 27000
        }
      ])
    });

    await service.approve("doc_rev", "reviewer_1");

    expect(repo.listLoanItemsCreatedByDocument).toHaveBeenCalledWith("doc_loan");
    expect(repo.listLoanAllocationsForDocument).toHaveBeenCalledWith("doc_loan");
    expect(repo.listLoanItemsByIds).toHaveBeenCalledWith(["loan_item_1"]);
    expect(repo.listLaterLoanAllocationItemIds).toHaveBeenCalledWith({
      loanItemIds: ["loan_item_1"],
      originalDocumentId: "doc_loan"
    });
    expect(repo.approveWithPostings).toHaveBeenCalledWith(expect.objectContaining({
      loanItemUpdates: [
        {
          loanItemId: "loan_item_1",
          amountDeltaMinor: -100000,
          usdtCostDeltaMinor: -27000,
          expectedRemainingAmountMinor: 100000,
          expectedRemainingUsdtCostMinor: 27000
        }
      ],
      loanAllocations: [
        {
          loanItemId: "loan_item_1",
          allocationType: "reversal",
          amountMinor: 100000,
          usdtCostMinor: 27000,
          allocationDate: "2026-04-26"
        }
      ]
    }));
  });

  it("rejects loan reversals when later loan allocations exist", async () => {
    const { repo, service } = createMocks({
      getDocument: vi
        .fn()
        .mockResolvedValueOnce(documentRow({
          id: "doc_rev",
          status: "pending",
          action_type: "reversal",
          document_type: "loan_repayment",
          original_document_id: "doc_repay",
          business_date: "2026-04-26"
        }))
        .mockResolvedValueOnce(documentRow({
          id: "doc_repay",
          status: "approved",
          document_type: "loan_repayment",
          action_type: "normal"
        })),
      listLoanEntriesForDocument: vi.fn(async () => [
        { borrower_person_id: "person_borrower", currency_code: "AED", amount_minor: -40000, usdt_cost_minor: -10800 }
      ]),
      listLoanAllocationsForDocument: vi.fn(async () => [
        {
          loan_item_id: "loan_item_1",
          allocation_type: "repayment",
          amount_minor: 40000,
          usdt_cost_minor: 10800,
          created_at: "2026-04-25T10:00:00.000Z"
        }
      ]),
      listLoanItemsByIds: vi.fn(async () => [
        {
          id: "loan_item_1",
          original_amount_minor: 100000,
          remaining_amount_minor: 60000,
          original_usdt_cost_minor: 27000,
          remaining_usdt_cost_minor: 16200
        }
      ]),
      listLaterLoanAllocationItemIds: vi.fn(async () => [{ loan_item_id: "loan_item_1" }])
    });

    await expect(service.approve("doc_rev", "reviewer_1")).rejects.toThrow(
      "Complex loan reversal requires manual review: affected loan items have later allocations"
    );
    expect(repo.approveWithPostings).not.toHaveBeenCalled();
  });

  it("rejects fifo reversals when later lot movements exist", async () => {
    const { repo, service } = createMocks({
      getDocument: vi
        .fn()
        .mockResolvedValueOnce(documentRow({
          id: "doc_rev",
          status: "pending",
          action_type: "reversal",
          document_type: "account_transfer",
          original_document_id: "doc_transfer"
        }))
        .mockResolvedValueOnce(documentRow({
          id: "doc_transfer",
          status: "approved",
          document_type: "account_transfer",
          action_type: "normal"
        })),
      listAccountEntriesForDocument: vi.fn(async () => [
        { account_id: "acct_aed_reserve", currency_code: "AED", amount_minor: -50000 },
        { account_id: "acct_aed_bank", currency_code: "AED", amount_minor: 50000 }
      ]),
      listLotMovementsForDocument: vi.fn(async () => [
        {
          id: "move_transfer",
          lot_id: "lot_source",
          movement_type: "account_transfer",
          from_account_id: "acct_aed_reserve",
          to_account_id: "acct_aed_bank",
          from_person_id: null,
          to_person_id: null,
          amount_minor: 50000,
          usdt_cost_minor: 13650,
          created_at: "2026-04-24T10:00:00.000Z"
        }
      ]),
      listLaterMovementLotIds: vi.fn(async () => [{ lot_id: "lot_source" }])
    });

    await expect(service.approve("doc_rev", "reviewer_1")).rejects.toThrow(
      "Complex FIFO reversal requires manual review: affected lots have later movements"
    );
    expect(repo.approveWithPostings).not.toHaveBeenCalled();
  });

  it("rejects reversals when the original document is not approved", async () => {
    const { repo, service } = createMocks({
      getDocument: vi
        .fn()
        .mockResolvedValueOnce(documentRow({
          id: "doc_rev",
          status: "pending",
          action_type: "reversal",
          original_document_id: "doc_original"
        }))
        .mockResolvedValueOnce(documentRow({ id: "doc_original", status: "pending" }))
    });

    await expect(service.approve("doc_rev", "reviewer_1")).rejects.toThrow("冲正必须关联已审核原单据");
    expect(repo.approveWithPostings).not.toHaveBeenCalled();
  });

  it("rejects reversals when the document type differs from the original document", async () => {
    const { repo, service } = createMocks({
      getDocument: vi
        .fn()
        .mockResolvedValueOnce(documentRow({
          id: "doc_rev",
          status: "pending",
          action_type: "reversal",
          document_type: "project_income",
          original_document_id: "doc_original"
        }))
        .mockResolvedValueOnce(documentRow({
          id: "doc_original",
          status: "approved",
          document_type: "loan_out"
        }))
    });

    await expect(service.approve("doc_rev", "reviewer_1")).rejects.toThrow(
      "冲正单据类型必须与原单据一致"
    );
    expect(repo.approveWithPostings).not.toHaveBeenCalled();
  });
});
