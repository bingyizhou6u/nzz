import { describe, expect, it } from "vitest";
import { entriesForReversalDocument } from "../../src/domain/reversalPosting";

describe("entriesForReversalDocument", () => {
  it("negates original account entries using the reversal business date", () => {
    expect(
      entriesForReversalDocument({
        reversalDate: "2026-04-25",
        originalAccountEntries: [
          { accountId: "acct_aed_reserve", currencyCode: "AED", amountMinor: 367000 },
          { accountId: "acct_usdt_main", currencyCode: "USDT", amountMinor: -100000 }
        ],
        originalLoanEntries: []
      })
    ).toEqual({
      accountEntries: [
        { accountId: "acct_aed_reserve", currencyCode: "AED", amountMinor: -367000, entryDate: "2026-04-25" },
        { accountId: "acct_usdt_main", currencyCode: "USDT", amountMinor: 100000, entryDate: "2026-04-25" }
      ],
      loanEntries: []
    });
  });

  it("negates original loan entries using the reversal business date", () => {
    expect(
      entriesForReversalDocument({
        reversalDate: "2026-04-25",
        originalAccountEntries: [{ accountId: "acct_usdt_main", currencyCode: "USDT", amountMinor: -120000 }],
        originalLoanEntries: [{ borrowerPersonId: "person_borrower", currencyCode: "USDT", amountMinor: 120000 }]
      })
    ).toEqual({
      accountEntries: [
        { accountId: "acct_usdt_main", currencyCode: "USDT", amountMinor: 120000, entryDate: "2026-04-25" }
      ],
      loanEntries: [
        { borrowerPersonId: "person_borrower", currencyCode: "USDT", amountMinor: -120000, entryDate: "2026-04-25" }
      ]
    });
  });

  it("preserves original posting identifiers while validating trimmed non-empty values", () => {
    expect(
      entriesForReversalDocument({
        reversalDate: "2026-04-25",
        originalAccountEntries: [{ accountId: "  acct_usdt_main  ", currencyCode: "  USDT  ", amountMinor: -120000 }],
        originalLoanEntries: [{ borrowerPersonId: "  person_borrower  ", currencyCode: "  USDT  ", amountMinor: 120000 }]
      })
    ).toEqual({
      accountEntries: [
        { accountId: "  acct_usdt_main  ", currencyCode: "  USDT  ", amountMinor: 120000, entryDate: "2026-04-25" }
      ],
      loanEntries: [
        {
          borrowerPersonId: "  person_borrower  ",
          currencyCode: "  USDT  ",
          amountMinor: -120000,
          entryDate: "2026-04-25"
        }
      ]
    });
  });

  it("rejects reversals with no original posting effects", () => {
    expect(() =>
      entriesForReversalDocument({
        reversalDate: "2026-04-25",
        originalAccountEntries: [],
        originalLoanEntries: []
      })
    ).toThrow("Original document has no posting entries to reverse");
  });
});
