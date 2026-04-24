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
});
