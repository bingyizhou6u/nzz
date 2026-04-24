import { describe, expect, it } from "vitest";
import { normalizeDocumentLines } from "../../src/domain/documentLines";

describe("normalizeDocumentLines", () => {
  it("normalizes a valid project-income line", () => {
    expect(
      normalizeDocumentLines([
        {
          lineType: "main",
          accountId: " acct_usdt ",
          currencyCode: " usdt ",
          amountMinor: 10000,
          usdtAmountMinor: 10000,
          note: " Merchant income "
        }
      ])
    ).toEqual([
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
        note: "Merchant income"
      }
    ]);
  });

  it("rejects empty line arrays", () => {
    expect(() => normalizeDocumentLines([])).toThrow("At least one document line is required");
  });

  it("rejects non-positive and unsafe amounts", () => {
    expect(() => normalizeDocumentLines([{ lineType: "main", accountId: "acct_1", currencyCode: "AED", amountMinor: 0 }])).toThrow(
      "line amountMinor must be a positive safe integer"
    );
    expect(() =>
      normalizeDocumentLines([{ lineType: "main", accountId: "acct_1", currencyCode: "AED", amountMinor: 10.5 }])
    ).toThrow("line amountMinor must be a positive safe integer");
  });

  it("requires account and currency on every line", () => {
    expect(() => normalizeDocumentLines([{ lineType: "main", accountId: " ", currencyCode: "AED", amountMinor: 100 }])).toThrow(
      "line accountId is required"
    );
    expect(() =>
      normalizeDocumentLines([{ lineType: "main", accountId: "acct_1", currencyCode: " ", amountMinor: 100 }])
    ).toThrow("line currencyCode is required");
  });
});
