import { describe, expect, it } from "vitest";
import {
  buildDocumentPayload,
  canApproveDocument,
  canSubmitDocument,
  formatLocalDateInputValue,
  formatLocalMonthInputValue,
  isOriginalDocumentRequired
} from "./DocumentsPage";

describe("document date defaults", () => {
  it("formats date inputs from local calendar fields", () => {
    const date = {
      getFullYear: () => 2026,
      getMonth: () => 0,
      getDate: () => 5
    } as Date;

    expect(formatLocalDateInputValue(date)).toBe("2026-01-05");
  });

  it("formats month inputs from local calendar fields", () => {
    const date = {
      getFullYear: () => 2026,
      getMonth: () => 8,
      getDate: () => 30
    } as Date;

    expect(formatLocalMonthInputValue(date)).toBe("2026-09");
  });

  it("requires original document IDs for correction and reversal drafts", () => {
    expect(isOriginalDocumentRequired("correction")).toBe(true);
    expect(isOriginalDocumentRequired("reversal")).toBe(true);
    expect(isOriginalDocumentRequired("normal")).toBe(false);
    expect(isOriginalDocumentRequired("repost")).toBe(false);
  });

  it("builds a document payload with one line", () => {
    expect(
      buildDocumentPayload({
        documentType: "project_income",
        actionType: "normal",
        businessDate: "2026-04-24",
        period: "2026-04",
        originalDocumentId: "",
        summary: "Income",
        createdBy: "user_1",
        operatorPersonId: "",
        projectId: "proj_1",
        merchantId: "merchant_1",
        categoryId: "cat_income",
        accountId: "acct_usdt",
        currencyCode: "USDT",
        amountMajor: "100.50",
        borrowerPersonId: ""
      })
    ).toEqual({
      documentType: "project_income",
      actionType: "normal",
      businessDate: "2026-04-24",
      period: "2026-04",
      summary: "Income",
      createdBy: "user_1",
      projectId: "proj_1",
      merchantId: "merchant_1",
      categoryId: "cat_income",
      lines: [{ lineType: "main", accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 10050 }]
    });
  });

  it("shows workflow actions by status", () => {
    expect(canSubmitDocument("draft")).toBe(true);
    expect(canSubmitDocument("rejected")).toBe(true);
    expect(canSubmitDocument("pending")).toBe(false);
    expect(canApproveDocument("pending")).toBe(true);
    expect(canApproveDocument("approved")).toBe(false);
  });
});
