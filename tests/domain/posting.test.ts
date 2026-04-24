import { describe, expect, it } from "vitest";
import { entriesForApprovedDocument } from "../../src/domain/posting";

describe("entriesForApprovedDocument", () => {
  it("creates a positive account entry for project income", () => {
    const entries = entriesForApprovedDocument({
      id: "doc_1",
      documentType: "project_income",
      actionType: "normal",
      businessDate: "2026-04-01",
      lines: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 10000 }]
    });
    expect(entries.accountEntries).toEqual([{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 10000, entryDate: "2026-04-01" }]);
  });

  it("creates a negative account entry and positive loan entry for loan out", () => {
    const entries = entriesForApprovedDocument({
      id: "doc_2",
      documentType: "loan_out",
      actionType: "normal",
      businessDate: "2026-04-01",
      borrowerPersonId: "person_1",
      lines: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 5000 }]
    });
    expect(entries.accountEntries[0].amountMinor).toBe(-5000);
    expect(entries.loanEntries[0].amountMinor).toBe(5000);
  });

  it("throws for unsupported document types", () => {
    expect(() =>
      entriesForApprovedDocument({
        id: "doc_3",
        documentType: "account_transfer",
        actionType: "normal",
        businessDate: "2026-04-01",
        lines: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 5000 }]
      })
    ).toThrow("Unsupported documentType: account_transfer");
  });

  it("throws when supported posting documents have no lines", () => {
    expect(() =>
      entriesForApprovedDocument({
        id: "doc_4",
        documentType: "project_income",
        actionType: "normal",
        businessDate: "2026-04-01",
        lines: []
      })
    ).toThrow("lines are required");
  });

  it("throws for non-positive line amounts", () => {
    for (const amountMinor of [0, -5000]) {
      expect(() =>
        entriesForApprovedDocument({
          id: "doc_5",
          documentType: "loan_out",
          actionType: "normal",
          businessDate: "2026-04-01",
          borrowerPersonId: "person_1",
          lines: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor }]
        })
      ).toThrow("line amountMinor must be a positive safe integer");
    }
  });

  it("throws for unsafe or non-integer line amounts", () => {
    for (const amountMinor of [Number.NaN, Number.POSITIVE_INFINITY, 10.5, Number.MAX_SAFE_INTEGER + 1]) {
      expect(() =>
        entriesForApprovedDocument({
          id: "doc_6",
          documentType: "project_income",
          actionType: "normal",
          businessDate: "2026-04-01",
          lines: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor }]
        })
      ).toThrow("line amountMinor must be a positive safe integer");
    }
  });

  it("throws when loan out borrower is blank", () => {
    expect(() =>
      entriesForApprovedDocument({
        id: "doc_7",
        documentType: "loan_out",
        actionType: "normal",
        businessDate: "2026-04-01",
        borrowerPersonId: "   ",
        lines: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 5000 }]
      })
    ).toThrow("borrowerPersonId is required for loan_out");
  });

  it("throws for blank account IDs or currency codes", () => {
    expect(() =>
      entriesForApprovedDocument({
        id: "doc_8",
        documentType: "project_income",
        actionType: "normal",
        businessDate: "2026-04-01",
        lines: [{ accountId: "   ", currencyCode: "USDT", amountMinor: 5000 }]
      })
    ).toThrow("line accountId is required");

    expect(() =>
      entriesForApprovedDocument({
        id: "doc_9",
        documentType: "project_income",
        actionType: "normal",
        businessDate: "2026-04-01",
        lines: [{ accountId: "acct_usdt", currencyCode: "   ", amountMinor: 5000 }]
      })
    ).toThrow("line currencyCode is required");
  });

  it("creates opposite-direction entries for project income reversals", () => {
    const entries = entriesForApprovedDocument({
      id: "doc_10",
      documentType: "project_income",
      actionType: "reversal",
      businessDate: "2026-04-02",
      lines: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 10000 }]
    });

    expect(entries.accountEntries).toEqual([{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: -10000, entryDate: "2026-04-02" }]);
    expect(entries.loanEntries).toEqual([]);
  });

  it("creates opposite-direction entries for loan out reversals", () => {
    const entries = entriesForApprovedDocument({
      id: "doc_11",
      documentType: "loan_out",
      actionType: "reversal",
      businessDate: "2026-04-02",
      borrowerPersonId: "person_1",
      lines: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 5000 }]
    });

    expect(entries.accountEntries).toEqual([{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 5000, entryDate: "2026-04-02" }]);
    expect(entries.loanEntries).toEqual([{ borrowerPersonId: "person_1", currencyCode: "USDT", amountMinor: -5000, entryDate: "2026-04-02" }]);
  });

  it.each(["correction", "repost"] as const)("rejects unsupported %s action types", (actionType) => {
    expect(() =>
      entriesForApprovedDocument({
        id: "doc_12",
        documentType: "project_income",
        actionType,
        businessDate: "2026-04-02",
        lines: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 10000 }]
      })
    ).toThrow(`Unsupported actionType for posting: ${actionType}`);
  });

  it("creates positive account and negative loan entries for loan repayments", () => {
    const entries = entriesForApprovedDocument({
      id: "doc_13",
      documentType: "loan_repayment",
      actionType: "normal",
      businessDate: "2026-04-03",
      borrowerPersonId: "person_1",
      lines: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 2500 }]
    });

    expect(entries.accountEntries).toEqual([{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 2500, entryDate: "2026-04-03" }]);
    expect(entries.loanEntries).toEqual([{ borrowerPersonId: "person_1", currencyCode: "USDT", amountMinor: -2500, entryDate: "2026-04-03" }]);
  });

  it("creates opposite-direction entries for loan repayment reversals", () => {
    const entries = entriesForApprovedDocument({
      id: "doc_14",
      documentType: "loan_repayment",
      actionType: "reversal",
      businessDate: "2026-04-03",
      borrowerPersonId: "person_1",
      lines: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 2500 }]
    });

    expect(entries.accountEntries).toEqual([{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: -2500, entryDate: "2026-04-03" }]);
    expect(entries.loanEntries).toEqual([{ borrowerPersonId: "person_1", currencyCode: "USDT", amountMinor: 2500, entryDate: "2026-04-03" }]);
  });

  it.each([
    ["blank", "   "],
    ["missing", undefined]
  ] as const)("throws when loan repayment borrower is %s", (_caseName, borrowerPersonId) => {
    expect(() =>
      entriesForApprovedDocument({
        id: "doc_15",
        documentType: "loan_repayment",
        actionType: "normal",
        businessDate: "2026-04-03",
        borrowerPersonId,
        lines: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 2500 }]
      })
    ).toThrow("borrowerPersonId is required for loan_repayment");
  });

  it("posts exchange as USDT out and received currency in", () => {
    expect(
      entriesForApprovedDocument({
        id: "doc_fx",
        documentType: "exchange",
        actionType: "normal",
        businessDate: "2026-04-24",
        lines: [
          {
            accountId: "acct_aed_reserve",
            counterpartyAccountId: "acct_usdt_main",
            currencyCode: "AED",
            amountMinor: 367000,
            usdtAmountMinor: 100000
          }
        ]
      })
    ).toEqual({
      accountEntries: [
        { accountId: "acct_usdt_main", currencyCode: "USDT", amountMinor: -100000, entryDate: "2026-04-24" },
        { accountId: "acct_aed_reserve", currencyCode: "AED", amountMinor: 367000, entryDate: "2026-04-24" }
      ],
      loanEntries: []
    });
  });

  it("posts petty cash issue as reserve out and staff petty cash in", () => {
    expect(
      entriesForApprovedDocument({
        id: "doc_issue",
        documentType: "petty_cash_issue",
        actionType: "normal",
        businessDate: "2026-04-24",
        lines: [
          {
            accountId: "acct_aed_reserve",
            counterpartyAccountId: "acct_petty_bob",
            personId: "person_bob",
            currencyCode: "AED",
            amountMinor: 200000
          }
        ]
      })
    ).toEqual({
      accountEntries: [
        { accountId: "acct_aed_reserve", currencyCode: "AED", amountMinor: -200000, entryDate: "2026-04-24" },
        { accountId: "acct_petty_bob", currencyCode: "AED", amountMinor: 200000, entryDate: "2026-04-24" }
      ],
      loanEntries: []
    });
  });

  it("posts petty cash reimbursement as staff petty cash out", () => {
    expect(
      entriesForApprovedDocument({
        id: "doc_reim",
        documentType: "petty_cash_reimbursement",
        actionType: "normal",
        businessDate: "2026-04-24",
        lines: [
          {
            accountId: "acct_petty_bob",
            personId: "person_bob",
            currencyCode: "AED",
            amountMinor: 215000
          }
        ]
      })
    ).toEqual({
      accountEntries: [
        { accountId: "acct_petty_bob", currencyCode: "AED", amountMinor: -215000, entryDate: "2026-04-24" }
      ],
      loanEntries: []
    });
  });

  it("requires exchange source account and USDT cost", () => {
    expect(() =>
      entriesForApprovedDocument({
        id: "doc_fx",
        documentType: "exchange",
        actionType: "normal",
        businessDate: "2026-04-24",
        lines: [{ accountId: "acct_aed", currencyCode: "AED", amountMinor: 1000 }]
      })
    ).toThrow("line counterpartyAccountId is required for exchange");

    expect(() =>
      entriesForApprovedDocument({
        id: "doc_fx",
        documentType: "exchange",
        actionType: "normal",
        businessDate: "2026-04-24",
        lines: [{ accountId: "acct_aed", counterpartyAccountId: "acct_usdt", currencyCode: "AED", amountMinor: 1000 }]
      })
    ).toThrow("line usdtAmountMinor is required for exchange");
  });

  it("rejects exchange reversals until FIFO restoration is implemented", () => {
    expect(() =>
      entriesForApprovedDocument({
        id: "doc_fx_reversal",
        documentType: "exchange",
        actionType: "reversal",
        businessDate: "2026-04-24",
        lines: [
          {
            accountId: "acct_aed_reserve",
            counterpartyAccountId: "acct_usdt_main",
            currencyCode: "AED",
            amountMinor: 367000,
            usdtAmountMinor: 100000
          }
        ]
      })
    ).toThrow("Unsupported actionType for posting: reversal");
  });

  it("rejects petty cash issue reversals until FIFO restoration is implemented", () => {
    expect(() =>
      entriesForApprovedDocument({
        id: "doc_issue_reversal",
        documentType: "petty_cash_issue",
        actionType: "reversal",
        businessDate: "2026-04-24",
        lines: [
          {
            accountId: "acct_aed_reserve",
            counterpartyAccountId: "acct_petty_bob",
            personId: "person_bob",
            currencyCode: "AED",
            amountMinor: 200000
          }
        ]
      })
    ).toThrow("Unsupported actionType for posting: reversal");
  });

  it("rejects petty cash reimbursement reversals until FIFO restoration is implemented", () => {
    expect(() =>
      entriesForApprovedDocument({
        id: "doc_reim_reversal",
        documentType: "petty_cash_reimbursement",
        actionType: "reversal",
        businessDate: "2026-04-24",
        lines: [
          {
            accountId: "acct_petty_bob",
            personId: "person_bob",
            currencyCode: "AED",
            amountMinor: 215000
          }
        ]
      })
    ).toThrow("Unsupported actionType for posting: reversal");
  });
});
