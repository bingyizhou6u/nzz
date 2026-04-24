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

  it("rejects invalid line elements", () => {
    expect(() => normalizeDocumentLines([null])).toThrow("line must be an object");
    expect(() => normalizeDocumentLines([123])).toThrow("line must be an object");
    expect(() => normalizeDocumentLines([[]])).toThrow("line must be an object");
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

  it("defaults missing and blank line types to main", () => {
    expect(
      normalizeDocumentLines([
        { accountId: "acct_1", currencyCode: "AED", amountMinor: 100 },
        { lineType: " ", accountId: "acct_2", currencyCode: "USDT", amountMinor: 200 }
      ]).map((line) => line.lineType)
    ).toEqual(["main", "main"]);
  });

  it("assigns sequential line numbers to multiple lines", () => {
    expect(
      normalizeDocumentLines([
        { accountId: "acct_1", currencyCode: "AED", amountMinor: 100 },
        { accountId: "acct_2", currencyCode: "USDT", amountMinor: 200 }
      ]).map((line) => line.lineNo)
    ).toEqual([1, 2]);
  });

  it("normalizes optional text fields to null", () => {
    expect(
      normalizeDocumentLines([
        {
          accountId: "acct_1",
          counterpartyAccountId: " ",
          personId: null,
          borrowerPersonId: 123,
          currencyCode: "AED",
          amountMinor: 100,
          exchangeRateText: "",
          note: undefined
        }
      ])[0]
    ).toMatchObject({
      counterpartyAccountId: null,
      personId: null,
      borrowerPersonId: null,
      exchangeRateText: null,
      note: null
    });
  });
});
