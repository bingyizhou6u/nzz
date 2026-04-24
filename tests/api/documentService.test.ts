import { describe, expect, it, vi } from "vitest";
import { DocumentService } from "../../src/services/documentService";
import type { DocumentDetailRow, DocumentLineRow, LotRow, PendingCostMatchRow } from "../../src/repositories/documentRepository";

type DocumentRepoMock = ConstructorParameters<typeof DocumentService>[0];
type AuditRepoMock = ConstructorParameters<typeof DocumentService>[1];
type AtomicDocumentRepoMock = DocumentRepoMock & {
  createDraft: ReturnType<typeof vi.fn>;
  listOpenLotsForAccount: ReturnType<typeof vi.fn>;
  listOpenPendingCostMatches: ReturnType<typeof vi.fn>;
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
      lotCreations: [],
      lotUpdates: [],
      lotMovements: [],
      pendingCostCreations: [],
      pendingCostUpdates: [],
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

  it("approves exchange documents with lot creation effects", async () => {
    const { repo, service } = createMocks({
      getDocument: vi.fn(async () => documentRow({ status: "pending", document_type: "exchange" })),
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
      getDocument: vi.fn(async () => documentRow({ status: "pending", document_type: "petty_cash_reimbursement" })),
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
      getDocument: vi.fn(async () => documentRow({ status: "pending", document_type: "exchange" })),
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

    await expect(service.approve("doc_1", "reviewer_1")).rejects.toThrow("line usdtAmountMinor is required for exchange");

    expect(repo.approveWithPostings).not.toHaveBeenCalled();
  });

  it("rejects multi-line FIFO approvals before approval writes", async () => {
    const { repo, audit, service } = createMocks({
      getDocument: vi.fn(async () => documentRow({ status: "pending", document_type: "exchange" })),
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

    await expect(service.approve("doc_1", "reviewer_1")).rejects.toThrow("exchange requires exactly one line");

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
      lotCreations: [],
      lotUpdates: [],
      lotMovements: [],
      pendingCostCreations: [],
      pendingCostUpdates: [],
      auditLogStatement: { statement: "audit" }
    });
  });

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
});
