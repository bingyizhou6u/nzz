import { describe, expect, it } from "vitest";
import {
  buildDocumentPayload,
  formatLocalDateInputValue,
  formatLocalMonthInputValue,
  isOriginalDocumentRequired
} from "./documents/documentEntryModel";
import {
  canApproveDocument,
  canSubmitDocument,
  isLineAccountRequired,
  isSelectedOriginalDocumentValid,
  originalDocumentQueryType,
  supportedDraftActionTypes,
  supportedDraftDocumentTypes,
  workflowActionBody
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

  it("exposes only workflow-supported document and action choices for new drafts", () => {
    expect(supportedDraftDocumentTypes).toEqual([
      "project_income",
      "exchange",
      "account_transfer",
      "petty_cash_issue",
      "petty_cash_return",
      "petty_cash_reimbursement",
      "loan_out",
      "loan_repayment",
      "loan_writeoff"
    ]);
    expect(supportedDraftActionTypes).toEqual(["normal", "reversal"]);
  });

  it("does not require a line account for loan writeoffs", () => {
    expect(isLineAccountRequired("loan_writeoff")).toBe(false);
    expect(isLineAccountRequired("loan_out")).toBe(true);
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
        operatorPersonId: "",
        projectId: "proj_1",
        merchantId: "merchant_1",
        categoryId: "cat_income",
        accountId: "acct_usdt",
        currencyCode: "USDT",
        amountMajor: "100.50",
        borrowerPersonId: "",
        counterpartyAccountId: "",
        personId: "",
        usdtAmountMajor: ""
      }, "user_1")
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

  it("includes counterparty account and USDT cost on exchange lines", () => {
    expect(
      buildDocumentPayload({
        documentType: "exchange",
        actionType: "normal",
        businessDate: "2026-04-24",
        period: "2026-04",
        originalDocumentId: "",
        summary: "Exchange",
        operatorPersonId: "",
        projectId: "",
        merchantId: "",
        categoryId: "",
        accountId: "acct_aed",
        currencyCode: "AED",
        amountMajor: "367.25",
        borrowerPersonId: "",
        counterpartyAccountId: " acct_usdt ",
        personId: "",
        usdtAmountMajor: "100.25"
      }, "user_1")
    ).toEqual({
      documentType: "exchange",
      actionType: "normal",
      businessDate: "2026-04-24",
      period: "2026-04",
      summary: "Exchange",
      createdBy: "user_1",
      lines: [
        {
          lineType: "main",
          accountId: "acct_aed",
          currencyCode: "AED",
          amountMinor: 36725,
          counterpartyAccountId: "acct_usdt",
          usdtAmountMinor: 10025
        }
      ]
    });
  });

  it("includes person ID and omits blank FIFO line fields on petty cash reimbursements", () => {
    expect(
      buildDocumentPayload({
        documentType: "petty_cash_reimbursement",
        actionType: "normal",
        businessDate: "2026-04-24",
        period: "2026-04",
        originalDocumentId: "",
        summary: "Reimbursement",
        operatorPersonId: "",
        projectId: "",
        merchantId: "",
        categoryId: "cat_travel",
        accountId: "acct_cash",
        currencyCode: "AED",
        amountMajor: "42",
        borrowerPersonId: "",
        counterpartyAccountId: " ",
        personId: " person_1 ",
        usdtAmountMajor: " "
      }, "user_1")
    ).toEqual({
      documentType: "petty_cash_reimbursement",
      actionType: "normal",
      businessDate: "2026-04-24",
      period: "2026-04",
      summary: "Reimbursement",
      createdBy: "user_1",
      categoryId: "cat_travel",
      lines: [
        {
          lineType: "main",
          accountId: "acct_cash",
          currencyCode: "AED",
          amountMinor: 4200,
          personId: "person_1"
        }
      ]
    });
  });

  it("omits account ID when building loan writeoff payloads", () => {
    expect(
      buildDocumentPayload({
        documentType: "loan_writeoff",
        actionType: "normal",
        businessDate: "2026-04-24",
        period: "2026-04",
        originalDocumentId: "doc_loan",
        summary: "Write off bad loan",
        operatorPersonId: "",
        projectId: "proj_1",
        merchantId: "",
        categoryId: "cat_bad_debt",
        accountId: "acct_should_not_be_sent",
        currencyCode: "AED",
        amountMajor: "120",
        borrowerPersonId: " person_1 ",
        counterpartyAccountId: "",
        personId: "",
        usdtAmountMajor: ""
      }, "user_1")
    ).toEqual({
      documentType: "loan_writeoff",
      actionType: "normal",
      businessDate: "2026-04-24",
      period: "2026-04",
      originalDocumentId: "doc_loan",
      summary: "Write off bad loan",
      createdBy: "user_1",
      projectId: "proj_1",
      categoryId: "cat_bad_debt",
      lines: [{ lineType: "main", currencyCode: "AED", amountMinor: 12000, borrowerPersonId: "person_1" }]
    });
  });

  it("shows workflow actions by status", () => {
    expect(canSubmitDocument("draft")).toBe(true);
    expect(canSubmitDocument("rejected")).toBe(true);
    expect(canSubmitDocument("pending")).toBe(false);
    expect(canApproveDocument("pending")).toBe(true);
    expect(canApproveDocument("approved")).toBe(false);
  });

  it("uses selected people ids for workflow actions", () => {
    expect(workflowActionBody("submit", "person_finance")).toEqual({ actor: "person_finance" });
    expect(workflowActionBody("approve", "person_manager")).toEqual({ reviewer: "person_manager" });
    expect(workflowActionBody("reject", "person_manager")).toEqual({ actor: "person_manager", reason: "退回修改" });
  });

  it("loads loan origin documents for normal loan settlement documents", () => {
    expect(originalDocumentQueryType("loan_repayment", "normal")).toBe("loan_out");
    expect(originalDocumentQueryType("loan_writeoff", "normal")).toBe("loan_out");
    expect(originalDocumentQueryType("project_income", "reversal")).toBe("project_income");
    expect(originalDocumentQueryType("project_income", "normal")).toBeNull();
  });

  it("accepts only original document ids from the loaded options", () => {
    const originalDocuments = [{ id: "doc_1" }];

    expect(isSelectedOriginalDocumentValid("doc_1", originalDocuments)).toBe(true);
    expect(isSelectedOriginalDocumentValid("stale_doc", originalDocuments)).toBe(false);
    expect(isSelectedOriginalDocumentValid("", originalDocuments)).toBe(true);
  });
});
