import { describe, expect, it } from "vitest";
import {
  documentRuleMessages,
  validateDocumentMasterData,
  validateDocumentStructure,
  type DocumentMasterDataSnapshot,
  type DocumentRuleDocument,
  type DocumentRuleLine
} from "../../src/domain/documentRules";

function document(overrides: Partial<DocumentRuleDocument> = {}): DocumentRuleDocument {
  return {
    id: "doc_1",
    documentType: "project_income",
    actionType: "normal",
    operatorPersonId: "person_ops",
    projectId: "proj_1",
    merchantId: "merchant_1",
    categoryId: "cat_income",
    originalDocumentId: null,
    summary: "Merchant income",
    businessDate: "2026-04-24",
    period: "2026-04",
    ...overrides
  };
}

function line(overrides: Partial<DocumentRuleLine> = {}): DocumentRuleLine {
  return {
    accountId: "acct_company_aed",
    counterpartyAccountId: null,
    personId: null,
    borrowerPersonId: null,
    currencyCode: "AED",
    amountMinor: 12050,
    usdtAmountMinor: null,
    ...overrides
  };
}

function masterData(overrides: Partial<DocumentMasterDataSnapshot> = {}): DocumentMasterDataSnapshot {
  return {
    people: new Map([
      ["person_ops", { id: "person_ops", is_enabled: 1 }],
      ["person_bob", { id: "person_bob", is_enabled: 1 }]
    ]),
    projects: new Map([["proj_1", { id: "proj_1", status: "active" }]]),
    merchants: new Map([["merchant_1", { id: "merchant_1", project_id: "proj_1", status: "active" }]]),
    accounts: new Map([
      [
        "acct_company_aed",
        {
          id: "acct_company_aed",
          account_type: "currency_reserve",
          currency_code: "AED",
          owner_person_id: null,
          is_company_account: 1,
          status: "active"
        }
      ],
      [
        "acct_petty_bob",
        {
          id: "acct_petty_bob",
          account_type: "petty_cash",
          currency_code: "AED",
          owner_person_id: "person_bob",
          is_company_account: 0,
          status: "active"
        }
      ],
      [
        "acct_usdt",
        {
          id: "acct_usdt",
          account_type: "usdt_wallet",
          currency_code: "USDT",
          owner_person_id: null,
          is_company_account: 1,
          status: "active"
        }
      ]
    ]),
    categories: new Map([
      [
        "cat_income",
        {
          id: "cat_income",
          category_type: "income",
          direction: "in",
          affects_expense_report: 0,
          requires_merchant: 1,
          requires_person: 0,
          requires_borrower: 0,
          is_enabled: 1
        }
      ],
      [
        "cat_expense_person",
        {
          id: "cat_expense_person",
          category_type: "expense",
          direction: "out",
          affects_expense_report: 1,
          requires_merchant: 0,
          requires_person: 1,
          requires_borrower: 0,
          is_enabled: 1
        }
      ],
      [
        "cat_loss",
        {
          id: "cat_loss",
          category_type: "loss",
          direction: "out",
          affects_expense_report: 1,
          requires_merchant: 0,
          requires_person: 0,
          requires_borrower: 1,
          is_enabled: 1
        }
      ],
      [
        "cat_exchange",
        {
          id: "cat_exchange",
          category_type: "exchange",
          direction: "neutral",
          affects_expense_report: 0,
          requires_merchant: 0,
          requires_person: 0,
          requires_borrower: 0,
          is_enabled: 1
        }
      ]
    ]),
    currencies: new Map([
      ["AED", { code: "AED", is_enabled: 1 }],
      ["USDT", { code: "USDT", is_enabled: 1 }]
    ]),
    ...overrides
  };
}

describe("document structure rules", () => {
  it("allows header-only draft documents", () => {
    expect(validateDocumentStructure({ stage: "draft", document: document(), lines: [] })).toEqual([]);
  });

  it("requires project income merchant on submit", () => {
    const errors = validateDocumentStructure({
      stage: "submit",
      document: document({ merchantId: null }),
      lines: [line()]
    });

    expect(errors.map((error) => error.message)).toContain(documentRuleMessages.merchantRequired);
  });

  it("requires exchange counterparty account and USDT cost", () => {
    const errors = validateDocumentStructure({
      stage: "submit",
      document: document({ documentType: "exchange", categoryId: "cat_exchange" }),
      lines: [line({ counterpartyAccountId: null, usdtAmountMinor: null })]
    });

    expect(errors.map((error) => error.message)).toEqual([
      documentRuleMessages.counterpartyAccountRequired,
      documentRuleMessages.usdtCostRequired
    ]);
  });

  it("allows loan writeoff lines without cash account", () => {
    const errors = validateDocumentStructure({
      stage: "submit",
      document: document({
        documentType: "loan_writeoff",
        borrowerPersonId: "person_bob",
        originalDocumentId: "doc_loan",
        categoryId: "cat_loss"
      }),
      lines: [line({ accountId: null, borrowerPersonId: "person_bob" })]
    });

    expect(errors).toEqual([]);
  });

  it("requires only original document and summary for reversal", () => {
    const errors = validateDocumentStructure({
      stage: "submit",
      document: document({ actionType: "reversal", originalDocumentId: "doc_original", summary: "Reverse" }),
      lines: []
    });

    expect(errors).toEqual([]);
  });
});

describe("document master data rules", () => {
  it("rejects merchant outside the selected project", () => {
    const snapshot = masterData({
      merchants: new Map([["merchant_1", { id: "merchant_1", project_id: "proj_2", status: "active" }]])
    });

    const errors = validateDocumentMasterData({
      document: document(),
      lines: [line()],
      masterData: snapshot
    });

    expect(errors.map((error) => error.message)).toContain(documentRuleMessages.merchantProject);
  });

  it("rejects disabled accounts before posting", () => {
    const snapshot = masterData({
      accounts: new Map([
        [
          "acct_company_aed",
          {
            id: "acct_company_aed",
            account_type: "currency_reserve",
            currency_code: "AED",
            owner_person_id: null,
            is_company_account: 1,
            status: "archived"
          }
        ]
      ])
    });

    const errors = validateDocumentMasterData({
      document: document(),
      lines: [line()],
      masterData: snapshot
    });

    expect(errors.map((error) => error.message)).toContain(documentRuleMessages.accountActive);
  });

  it("requires petty cash accounts to belong to the selected person", () => {
    const errors = validateDocumentMasterData({
      document: document({ documentType: "petty_cash_reimbursement", categoryId: "cat_expense_person" }),
      lines: [line({ accountId: "acct_petty_bob", personId: "person_ops" })],
      masterData: masterData()
    });

    expect(errors.map((error) => error.message)).toContain(documentRuleMessages.pettyCashAccount);
  });

  it("rejects loan settlement when original document is not approved loan_out", () => {
    const errors = validateDocumentMasterData({
      document: document({
        documentType: "loan_repayment",
        borrowerPersonId: "person_bob",
        originalDocumentId: "doc_income",
        categoryId: null
      }),
      lines: [line({ borrowerPersonId: "person_bob" })],
      masterData: masterData(),
      originalDocument: {
        id: "doc_income",
        documentType: "project_income",
        status: "approved",
        borrowerPersonId: null
      },
      originalLines: [line()]
    });

    expect(errors.map((error) => error.message)).toContain(documentRuleMessages.originalMustBeApprovedLoanOut);
  });

  it("rejects loan settlement borrower mismatches", () => {
    const errors = validateDocumentMasterData({
      document: document({
        documentType: "loan_repayment",
        borrowerPersonId: "person_bob",
        originalDocumentId: "doc_loan",
        categoryId: null
      }),
      lines: [line({ borrowerPersonId: "person_bob" })],
      masterData: masterData(),
      originalDocument: {
        id: "doc_loan",
        documentType: "loan_out",
        status: "approved",
        borrowerPersonId: "person_ops"
      },
      originalLines: [line({ borrowerPersonId: "person_ops", currencyCode: "AED" })]
    });

    expect(errors.map((error) => error.message)).toContain(documentRuleMessages.loanBorrowerMatch);
  });

  it("rejects loan settlement currency mismatches", () => {
    const errors = validateDocumentMasterData({
      document: document({
        documentType: "loan_writeoff",
        borrowerPersonId: "person_bob",
        originalDocumentId: "doc_loan",
        categoryId: "cat_loss"
      }),
      lines: [line({ accountId: null, borrowerPersonId: "person_bob", currencyCode: "USDT" })],
      masterData: masterData(),
      originalDocument: {
        id: "doc_loan",
        documentType: "loan_out",
        status: "approved",
        borrowerPersonId: "person_bob"
      },
      originalLines: [line({ borrowerPersonId: "person_bob", currencyCode: "AED" })]
    });

    expect(errors.map((error) => error.message)).toContain(documentRuleMessages.loanCurrencyMatch);
  });

  it("does not require original historical master data to stay active for reversal", () => {
    const errors = validateDocumentMasterData({
      document: document({ actionType: "reversal", originalDocumentId: "doc_original" }),
      lines: [],
      masterData: masterData({
        accounts: new Map(),
        categories: new Map(),
        merchants: new Map(),
        projects: new Map()
      }),
      originalDocument: {
        id: "doc_original",
        documentType: "project_income",
        status: "approved",
        borrowerPersonId: null
      },
      originalLines: []
    });

    expect(errors).toEqual([]);
  });
});
