import { describe, expect, it } from "vitest";
import { entriesForApprovedDocument } from "../../src/domain/posting";

describe("entriesForApprovedDocument", () => {
  it("creates a positive account entry for project income", () => {
    const entries = entriesForApprovedDocument({
      id: "doc_1",
      documentType: "project_income",
      businessDate: "2026-04-01",
      lines: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 10000 }]
    });
    expect(entries.accountEntries).toEqual([{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 10000, entryDate: "2026-04-01" }]);
  });

  it("creates a negative account entry and positive loan entry for loan out", () => {
    const entries = entriesForApprovedDocument({
      id: "doc_2",
      documentType: "loan_out",
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
        documentType: "exchange",
        businessDate: "2026-04-01",
        lines: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 5000 }]
      })
    ).toThrow("Unsupported documentType: exchange");
  });

  it("throws when supported posting documents have no lines", () => {
    expect(() =>
      entriesForApprovedDocument({
        id: "doc_4",
        documentType: "project_income",
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
        businessDate: "2026-04-01",
        lines: [{ accountId: "   ", currencyCode: "USDT", amountMinor: 5000 }]
      })
    ).toThrow("line accountId is required");

    expect(() =>
      entriesForApprovedDocument({
        id: "doc_9",
        documentType: "project_income",
        businessDate: "2026-04-01",
        lines: [{ accountId: "acct_usdt", currencyCode: "   ", amountMinor: 5000 }]
      })
    ).toThrow("line currencyCode is required");
  });
});
