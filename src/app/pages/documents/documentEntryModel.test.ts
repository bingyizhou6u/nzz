import { describe, expect, it } from "vitest";
import {
  amountMajorToMinor,
  buildDocumentPayload,
  categoryOptionsForDocumentType,
  createInitialDocumentForm,
  getVisibleFieldKeys,
  merchantOptionsForProject,
  pettyCashAccountsForPerson,
  validateDocumentForm
} from "./documentEntryModel";
import { deriveDocumentEntryState } from "./documentEntryRules";
import type { DocumentEntryOptions } from "./documentEntryTypes";

const options: DocumentEntryOptions = {
  people: [{ id: "person_ops", name: "Ops User", alias: "ops", roles_json: "[\"logistics\"]", is_enabled: 1 }],
  projects: [{ id: "proj_1", code: "P1", name: "Project One", owner_person_id: null, status: "active" }],
  merchants: [
    { id: "merchant_1", code: "M1", name: "Merchant One", project_id: "proj_1", merchant_type: "site", status: "active" },
    { id: "merchant_2", code: "M2", name: "Merchant Two", project_id: "proj_2", merchant_type: "site", status: "active" }
  ],
  accounts: [
    {
      id: "acct_company_aed",
      name: "AED Reserve",
      account_type: "currency_reserve",
      currency_code: "AED",
      owner_person_id: null,
      is_company_account: 1,
      allow_negative: 0,
      status: "active"
    },
    {
      id: "acct_petty_ops",
      name: "Ops AED Petty",
      account_type: "petty_cash",
      currency_code: "AED",
      owner_person_id: "person_ops",
      is_company_account: 0,
      allow_negative: 1,
      status: "active"
    }
  ],
  currencies: [
    { code: "AED", name: "迪拉姆", minor_units: 2, is_enabled: 1 },
    { code: "USDT", name: "Tether", minor_units: 2, is_enabled: 1 }
  ],
  categories: [
    {
      id: "cat_income",
      name: "Income",
      parent_id: null,
      category_type: "income",
      direction: "in",
      affects_expense_report: 0,
      affects_project_report: 1,
      requires_merchant: 1,
      requires_person: 0,
      requires_borrower: 0,
      is_enabled: 1
    },
    {
      id: "cat_expense",
      name: "Expense",
      parent_id: null,
      category_type: "expense",
      direction: "out",
      affects_expense_report: 1,
      affects_project_report: 0,
      requires_merchant: 0,
      requires_person: 1,
      requires_borrower: 0,
      is_enabled: 1
    },
    {
      id: "cat_plain_expense",
      name: "Plain Expense",
      parent_id: null,
      category_type: "expense",
      direction: "out",
      affects_expense_report: 1,
      affects_project_report: 0,
      requires_merchant: 0,
      requires_person: 0,
      requires_borrower: 0,
      is_enabled: 1
    }
  ]
};

describe("document entry model", () => {
  it("keeps project income fields business-specific", () => {
    expect(getVisibleFieldKeys("project_income", "normal")).toEqual([
      "operatorPersonId",
      "projectId",
      "merchantId",
      "categoryId",
      "accountId",
      "currencyCode",
      "amountMajor",
      "usdtAmountMajor",
      "summary"
    ]);
  });

  it("adds original document selection for correction actions", () => {
    expect(getVisibleFieldKeys("project_income", "correction")[0]).toBe("originalDocumentId");
  });

  it("limits reversal entry fields to the original document and summary", () => {
    expect(getVisibleFieldKeys("project_income", "reversal")).toEqual(["originalDocumentId", "summary"]);
  });

  it("keeps reimbursement visible fields compatible with the current legacy UI", () => {
    expect(getVisibleFieldKeys("petty_cash_reimbursement", "normal")).toEqual([
      "personId",
      "projectId",
      "merchantId",
      "categoryId",
      "accountId",
      "currencyCode",
      "amountMajor",
      "summary"
    ]);
  });

  it("filters merchants by selected project", () => {
    expect(merchantOptionsForProject(options, "proj_1").map((merchant) => merchant.id)).toEqual(["merchant_1"]);
  });

  it("filters petty cash accounts by selected person", () => {
    expect(pettyCashAccountsForPerson(options, "person_ops").map((account) => account.id)).toEqual([
      "acct_petty_ops"
    ]);
  });

  it("filters categories for reimbursement documents", () => {
    expect(categoryOptionsForDocumentType(options, "petty_cash_reimbursement").map((category) => category.id)).toEqual([
      "cat_expense",
      "cat_plain_expense"
    ]);
  });

  it("requires current actor before creating payloads", () => {
    const form = createInitialDocumentForm(new Date("2026-04-24T10:00:00Z"));
    expect(validateDocumentForm(form, options, "")).toContain("请选择当前操作人");
  });

  it("rejects account transfers with the same source and destination account", () => {
    const errors = validateDocumentForm(
      {
        ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
        documentType: "account_transfer",
        operatorPersonId: "person_ops",
        accountId: "acct_company_aed",
        counterpartyAccountId: " acct_company_aed ",
        currencyCode: "AED",
        amountMajor: "20",
        summary: "Move reserve"
      },
      options,
      "person_ops"
    );

    expect(errors).toContain("转出账户和转入账户不能相同");
  });

  it("requires currency to match the selected account currency", () => {
    const errors = validateDocumentForm(
      {
        ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
        documentType: "project_income",
        operatorPersonId: "person_ops",
        projectId: "proj_1",
        merchantId: "merchant_1",
        categoryId: "cat_income",
        accountId: "acct_company_aed",
        currencyCode: "USDT",
        amountMajor: "120.50",
        usdtAmountMajor: "32.84",
        summary: "Merchant income"
      },
      options,
      "person_ops"
    );

    expect(errors).toContain("币种必须与账户币种一致");
  });

  it("reports a single original document error when reversal is missing the original document", () => {
    const errors = validateDocumentForm(
      {
        ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
        documentType: "project_income",
        actionType: "reversal",
        operatorPersonId: "person_ops",
        projectId: "proj_1",
        merchantId: "merchant_1",
        categoryId: "cat_income",
        accountId: "acct_company_aed",
        currencyCode: "AED",
        amountMajor: "120.50",
        usdtAmountMajor: "32.84",
        summary: "Reverse merchant income"
      },
      options,
      "person_ops"
    );

    expect(errors.filter((error) => error.includes("原单据"))).toHaveLength(1);
  });

  it("requires original loan documents for normal loan settlement drafts", () => {
    const loanRepaymentErrors = validateDocumentForm(
      {
        ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
        documentType: "loan_repayment",
        actionType: "normal",
        operatorPersonId: "person_ops",
        borrowerPersonId: "person_ops",
        accountId: "acct_company_aed",
        currencyCode: "AED",
        amountMajor: "20",
        summary: "Repay loan"
      },
      options,
      "person_ops"
    );
    const loanWriteoffErrors = validateDocumentForm(
      {
        ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
        documentType: "loan_writeoff",
        actionType: "normal",
        operatorPersonId: "person_ops",
        borrowerPersonId: "person_ops",
        categoryId: "cat_expense",
        currencyCode: "AED",
        amountMajor: "20",
        summary: "Write off loan"
      },
      options,
      "person_ops"
    );

    expect(loanRepaymentErrors).toContain("请选择原单据");
    expect(loanWriteoffErrors).toContain("请选择原单据");
  });

  it("uses derived entry state when validating required fields and residual selections", () => {
    const errors = validateDocumentForm(
      {
        ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
        documentType: "petty_cash_reimbursement",
        personId: "person_ops",
        projectId: "proj_1",
        categoryId: "cat_expense",
        accountId: "acct_petty_ops",
        currencyCode: "AED",
        amountMajor: "20",
        summary: "Borrower-specific reimbursement"
      },
      options,
      "person_ops",
      {
        requiredFields: ["borrowerPersonId"],
        validationErrors: ["科目类型不适用于当前单据类型"]
      }
    );

    expect(errors).toContain("请选择或填写借款人");
    expect(errors).toContain("科目类型不适用于当前单据类型");
  });

  it("does not require non-applicable reimbursement fields when derived state omits them", () => {
    const form = {
      ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
      documentType: "petty_cash_reimbursement" as const,
      personId: "person_ops",
      categoryId: "cat_plain_expense",
      accountId: "acct_petty_ops",
      currencyCode: "AED",
      amountMajor: "20",
      summary: "Plain reimbursement"
    };

    const errors = validateDocumentForm(form, options, "person_ops", deriveDocumentEntryState(form, options, []));

    expect(errors).not.toContain("请选择或填写项目");
    expect(errors).not.toContain("请选择或填写商户");
    expect(errors).not.toContain("请选择或填写借款人");
  });

  it("preserves legacy reimbursement validation when derived state is not supplied", () => {
    const errors = validateDocumentForm(
      {
        ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
        documentType: "petty_cash_reimbursement",
        personId: "person_ops",
        categoryId: "cat_plain_expense",
        accountId: "acct_petty_ops",
        currencyCode: "AED",
        amountMajor: "20",
        summary: "Legacy validation"
      },
      options,
      "person_ops"
    );

    expect(errors).toContain("请选择或填写项目");
    expect(errors).not.toContain("请选择或填写商户");
  });

  it("builds project income payload using current actor person id", () => {
    const payload = buildDocumentPayload(
      {
        ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
        documentType: "project_income",
        actionType: "normal",
        businessDate: "2026-04-24",
        period: "2026-04",
        operatorPersonId: "person_ops",
        projectId: "proj_1",
        merchantId: "merchant_1",
        categoryId: "cat_income",
        accountId: "acct_company_aed",
        currencyCode: "AED",
        amountMajor: "120.50",
        usdtAmountMajor: "32.84",
        summary: "Merchant income"
      },
      "person_ops"
    );

    expect(payload).toEqual({
      documentType: "project_income",
      actionType: "normal",
      businessDate: "2026-04-24",
      period: "2026-04",
      operatorPersonId: "person_ops",
      projectId: "proj_1",
      merchantId: "merchant_1",
      categoryId: "cat_income",
      summary: "Merchant income",
      createdBy: "person_ops",
      lines: [
        {
          lineType: "main",
          accountId: "acct_company_aed",
          currencyCode: "AED",
          amountMinor: 12050,
          usdtAmountMinor: 3284
        }
      ]
    });
  });

  it("builds reversal payloads without requiring amount lines", () => {
    const payload = buildDocumentPayload(
      {
        ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
        documentType: "project_income",
        actionType: "reversal",
        businessDate: "2026-04-24",
        period: "2026-04",
        originalDocumentId: "doc_original",
        amountMajor: "",
        summary: "Reverse original document"
      },
      "person_ops"
    );

    expect(payload).toEqual({
      documentType: "project_income",
      actionType: "reversal",
      businessDate: "2026-04-24",
      period: "2026-04",
      originalDocumentId: "doc_original",
      summary: "Reverse original document",
      createdBy: "person_ops"
    });
  });

  it("omits account id for loan writeoff payloads", () => {
    const payload = buildDocumentPayload(
      {
        ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
        documentType: "loan_writeoff",
        businessDate: "2026-04-24",
        period: "2026-04",
        borrowerPersonId: "person_ops",
        categoryId: "cat_expense",
        currencyCode: "AED",
        amountMajor: "50",
        summary: "Write off"
      },
      "person_ops"
    );

    expect(payload).toEqual({
      documentType: "loan_writeoff",
      actionType: "normal",
      businessDate: "2026-04-24",
      period: "2026-04",
      categoryId: "cat_expense",
      summary: "Write off",
      createdBy: "person_ops",
      lines: [{ lineType: "main", currencyCode: "AED", amountMinor: 5000, borrowerPersonId: "person_ops" }]
    });
  });

  it("converts decimal amounts to minor units", () => {
    expect(amountMajorToMinor("10.05")).toBe(1005);
    expect(() => amountMajorToMinor("10.005")).toThrow("金额格式必须最多两位小数");
  });
});
