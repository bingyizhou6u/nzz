import { describe, expect, it } from "vitest";
import { createInitialDocumentForm } from "./documentEntryModel";
import { deriveDocumentEntryState } from "./documentEntryRules";
import type { DocumentEntryOptions } from "./documentEntryTypes";

const options: DocumentEntryOptions = {
  people: [
    { id: "person_ops", name: "Ops", alias: null, roles_json: "[]", is_enabled: 1 },
    { id: "person_bob", name: "Bob", alias: null, roles_json: "[]", is_enabled: 1 }
  ],
  projects: [{ id: "proj_1", code: "P1", name: "Project", owner_person_id: null, status: "active" }],
  merchants: [
    { id: "merchant_1", code: "M1", name: "Merchant", project_id: "proj_1", merchant_type: "site", status: "active" }
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
      id: "acct_usdt",
      name: "USDT Wallet",
      account_type: "usdt_wallet",
      currency_code: "USDT",
      owner_person_id: null,
      is_company_account: 1,
      allow_negative: 0,
      status: "active"
    },
    {
      id: "acct_petty_bob",
      name: "Bob AED Petty",
      account_type: "petty_cash",
      currency_code: "AED",
      owner_person_id: "person_bob",
      is_company_account: 0,
      allow_negative: 1,
      status: "active"
    }
  ],
  currencies: [
    { code: "AED", name: "Dirham", minor_units: 2, is_enabled: 1 },
    { code: "USDT", name: "Tether", minor_units: 2, is_enabled: 1 }
  ],
  categories: [
    {
      id: "cat_reimburse_person",
      name: "Staff Expense",
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
      id: "cat_reimburse_plain",
      name: "General Expense",
      parent_id: null,
      category_type: "expense",
      direction: "out",
      affects_expense_report: 1,
      affects_project_report: 0,
      requires_merchant: 0,
      requires_person: 0,
      requires_borrower: 0,
      is_enabled: 1
    },
    {
      id: "cat_reimburse_merchant",
      name: "Merchant Expense",
      parent_id: null,
      category_type: "expense",
      direction: "out",
      affects_expense_report: 1,
      affects_project_report: 1,
      requires_merchant: 1,
      requires_person: 0,
      requires_borrower: 0,
      is_enabled: 1
    },
    {
      id: "cat_reimburse_borrower",
      name: "Borrower Expense",
      parent_id: null,
      category_type: "expense",
      direction: "out",
      affects_expense_report: 1,
      affects_project_report: 0,
      requires_merchant: 0,
      requires_person: 0,
      requires_borrower: 1,
      is_enabled: 1
    }
  ]
};

describe("document entry derived rules", () => {
  it("adds project and merchant fields from reimbursement merchant category flags", () => {
    const form = {
      ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
      documentType: "petty_cash_reimbursement" as const,
      categoryId: "cat_reimburse_merchant"
    };

    const state = deriveDocumentEntryState(form, options, []);

    expect(state.visibleFields).toContain("projectId");
    expect(state.visibleFields).toContain("merchantId");
    expect(state.requiredFields).toContain("projectId");
    expect(state.requiredFields).toContain("merchantId");
  });

  it("keeps reimbursement person required as the account owner when category requires person", () => {
    const form = {
      ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
      documentType: "petty_cash_reimbursement" as const,
      categoryId: "cat_reimburse_person"
    };

    const state = deriveDocumentEntryState(form, options, []);

    expect(state.visibleFields).toContain("personId");
    expect(state.requiredFields).toContain("personId");
  });

  it("adds borrower fields from reimbursement borrower category flags", () => {
    const form = {
      ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
      documentType: "petty_cash_reimbursement" as const,
      categoryId: "cat_reimburse_borrower"
    };

    const state = deriveDocumentEntryState(form, options, []);

    expect(state.visibleFields).toContain("borrowerPersonId");
    expect(state.requiredFields).toContain("borrowerPersonId");
  });

  it("does not require optional reimbursement context fields without category flags", () => {
    const form = {
      ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
      documentType: "petty_cash_reimbursement" as const,
      categoryId: "cat_reimburse_plain"
    };

    const state = deriveDocumentEntryState(form, options, []);

    expect(state.visibleFields).not.toContain("projectId");
    expect(state.visibleFields).not.toContain("merchantId");
    expect(state.visibleFields).not.toContain("borrowerPersonId");
    expect(state.requiredFields).not.toContain("projectId");
    expect(state.requiredFields).not.toContain("merchantId");
    expect(state.requiredFields).not.toContain("borrowerPersonId");
  });

  it("filters merchant options by selected project", () => {
    const form = {
      ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
      projectId: "proj_1"
    };

    const state = deriveDocumentEntryState(form, options, []);

    expect(state.optionsByField.merchantId?.map((merchant) => merchant.id)).toEqual(["merchant_1"]);
  });

  it("filters petty cash accounts by selected person", () => {
    const form = {
      ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
      documentType: "petty_cash_reimbursement" as const,
      personId: "person_bob"
    };

    const state = deriveDocumentEntryState(form, options, []);

    expect(state.optionsByField.accountId?.map((account) => account.id)).toEqual(["acct_petty_bob"]);
  });

  it("reports residual merchant selections after project changes", () => {
    const form = {
      ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
      projectId: "",
      merchantId: "merchant_1"
    };

    const state = deriveDocumentEntryState(form, options, []);

    expect(state.validationErrors).toContain("商户必须属于所选项目");
  });

  it("disables currency when primary account is selected", () => {
    const form = {
      ...createInitialDocumentForm(new Date("2026-04-24T10:00:00Z")),
      accountId: "acct_company_aed"
    };

    const state = deriveDocumentEntryState(form, options, []);

    expect(state.disabledFields).toContain("currencyCode");
  });
});
