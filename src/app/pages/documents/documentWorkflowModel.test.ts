import { describe, expect, it } from "vitest";
import { createInitialDocumentForm } from "./documentEntryModel";
import type { DocumentEntryForm } from "./documentEntryTypes";
import {
  documentScenarioCards,
  documentTypeGroup,
  entryStepState,
  nextStepLabel
} from "./documentWorkflowModel";

function baseForm(overrides: Partial<DocumentEntryForm> = {}): DocumentEntryForm {
  return {
    ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
    businessDate: "2026-04-24",
    period: "2026-04",
    ...overrides
  };
}

describe("document workflow model", () => {
  it("groups document types by formal business scenario", () => {
    expect(documentTypeGroup("project_income")).toBe("income");
    expect(documentTypeGroup("exchange")).toBe("funds");
    expect(documentTypeGroup("account_transfer")).toBe("funds");
    expect(documentTypeGroup("petty_cash_issue")).toBe("petty_cash");
    expect(documentTypeGroup("petty_cash_reimbursement")).toBe("petty_cash");
    expect(documentTypeGroup("loan_out")).toBe("loan");
    expect(documentTypeGroup("loan_writeoff")).toBe("loan");
    expect(documentTypeGroup("project_income", "reversal")).toBe("correction");
    expect(documentTypeGroup("manual_adjustment")).toBe("correction");
  });

  it("returns scenario cards with required hints and representative document types", () => {
    const cards = documentScenarioCards();

    expect(cards.map((card) => card.id)).toEqual(["income", "funds", "petty_cash", "loan", "correction"]);
    expect(cards.map((card) => card.title)).toEqual(["项目收入", "资金业务", "备用金业务", "借款业务", "冲正/修正"]);
    expect(cards.find((card) => card.id === "funds")?.documentTypes).toEqual(["exchange", "account_transfer"]);
    expect(cards.find((card) => card.id === "petty_cash")?.requiredHint).toContain("发放、退回、报销");
    expect(cards.find((card) => card.id === "correction")?.requiredHint).toContain("原单据");
  });

  it("marks details as current and review as blocked when required fields are missing", () => {
    const form = baseForm({ documentType: "project_income", actionType: "normal" });
    const steps = entryStepState(form, ["projectId", "merchantId", "amountMajor", "summary"]);

    expect(steps).toMatchObject([
      { id: "type", status: "complete", canProceed: true },
      {
        id: "details",
        status: "current",
        canProceed: false,
        missingFieldLabels: ["项目", "商户", "金额", "摘要"]
      },
      { id: "review", status: "blocked", canProceed: false }
    ]);
  });

  it("opens review when all required fields are present", () => {
    const form = baseForm({
      documentType: "petty_cash_reimbursement",
      personId: "person_ops",
      accountId: "acct_petty_ops",
      currencyCode: "AED",
      amountMajor: "20",
      summary: "Daily expense"
    });
    const steps = entryStepState(form, ["personId", "accountId", "currencyCode", "amountMajor", "summary"]);

    expect(steps).toMatchObject([
      { id: "type", status: "complete", canProceed: true },
      { id: "details", status: "complete", canProceed: true, missingFields: [] },
      {
        id: "review",
        status: "current",
        canProceed: true,
        summary: "预览备用金报销单据，确认后保存。"
      }
    ]);
  });

  it("keeps validation errors ahead of review even when fields are present", () => {
    const form = baseForm({
      documentType: "account_transfer",
      operatorPersonId: "person_ops",
      accountId: "acct_company_aed",
      counterpartyAccountId: "acct_company_aed",
      currencyCode: "AED",
      amountMajor: "20",
      summary: "Move reserve"
    });
    const steps = entryStepState(
      form,
      ["operatorPersonId", "accountId", "counterpartyAccountId", "currencyCode", "amountMajor", "summary"],
      ["转出账户和转入账户不能相同"]
    );

    expect(steps[1]).toMatchObject({
      id: "details",
      status: "current",
      canProceed: false,
      validationErrors: ["转出账户和转入账户不能相同"]
    });
    expect(steps[2]).toMatchObject({ id: "review", status: "blocked", canProceed: false });
  });

  it("generates next step labels from missing fields and validation state", () => {
    const reversalForm = baseForm({
      documentType: "project_income",
      actionType: "reversal",
      summary: "Reverse original"
    });
    const readyForm = baseForm({
      documentType: "loan_repayment",
      actionType: "normal",
      originalDocumentId: "doc_original",
      operatorPersonId: "person_ops",
      borrowerPersonId: "person_ops",
      accountId: "acct_company_aed",
      currencyCode: "AED",
      amountMajor: "100",
      summary: "Loan repayment"
    });

    expect(nextStepLabel(reversalForm, ["originalDocumentId", "summary"])).toBe("继续填写：原单据");
    expect(nextStepLabel(readyForm, ["originalDocumentId", "amountMajor", "summary"])).toBe("预览并保存");
    expect(nextStepLabel(readyForm, ["originalDocumentId", "amountMajor", "summary"], ["原单据已被冲正"])).toBe(
      "处理校验提示"
    );
  });
});
