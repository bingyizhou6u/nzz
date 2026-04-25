import {
  accountCurrencyCode,
  categoryOptionsForDocumentType,
  companyAccounts,
  getVisibleFieldKeys,
  isOriginalDocumentFieldRequired,
  merchantOptionsForProject,
  pettyCashAccountsForPerson
} from "./documentEntryModel";
import type {
  AccountOption,
  CategoryOption,
  DocumentEntryForm,
  DocumentEntryOptions,
  DocumentFieldKey,
  MerchantOption,
  OriginalDocumentOption
} from "./documentEntryTypes";

export interface DocumentEntryState {
  visibleFields: DocumentFieldKey[];
  requiredFields: DocumentFieldKey[];
  disabledFields: DocumentFieldKey[];
  optionsByField: {
    originalDocumentId?: OriginalDocumentOption[];
    operatorPersonId?: DocumentEntryOptions["people"];
    personId?: DocumentEntryOptions["people"];
    borrowerPersonId?: DocumentEntryOptions["people"];
    projectId?: DocumentEntryOptions["projects"];
    merchantId?: MerchantOption[];
    categoryId?: CategoryOption[];
    accountId?: AccountOption[];
    counterpartyAccountId?: AccountOption[];
    currencyCode?: DocumentEntryOptions["currencies"];
  };
  validationErrors: string[];
}

export function deriveDocumentEntryState(
  form: DocumentEntryForm,
  options: DocumentEntryOptions,
  originalDocuments: OriginalDocumentOption[]
): DocumentEntryState {
  const selectedCategory = options.categories.find((category) => category.id === form.categoryId);
  const visibleFields = dynamicVisibleFields(form, selectedCategory);
  const requiredFields = dynamicRequiredFields(form, visibleFields, selectedCategory);
  const selectedAccountCurrency = accountCurrencyCode(options, form.accountId);
  const companyAccountOptions = companyAccounts(options);
  const personPettyCashAccountOptions = pettyCashAccountsForPerson(options, form.personId);
  const accountOptions = primaryAccountOptions(form, options);
  const counterpartyAccountOptions = counterpartyOptions(
    form,
    companyAccountOptions,
    personPettyCashAccountOptions,
    selectedAccountCurrency
  );
  const merchantOptions = merchantOptionsForProject(options, form.projectId);

  const state: DocumentEntryState = {
    visibleFields,
    requiredFields,
    disabledFields: form.accountId ? ["currencyCode"] : [],
    optionsByField: {
      originalDocumentId: originalDocuments,
      operatorPersonId: options.people,
      personId: options.people,
      borrowerPersonId: options.people,
      projectId: options.projects,
      merchantId: merchantOptions,
      categoryId: categoryOptionsForDocumentType(options, form.documentType),
      accountId: accountOptions,
      counterpartyAccountId: counterpartyAccountOptions,
      currencyCode: options.currencies
    },
    validationErrors: []
  };

  state.validationErrors = residualSelectionErrors(form, state);
  return state;
}

function dynamicVisibleFields(form: DocumentEntryForm, selectedCategory: CategoryOption | undefined): DocumentFieldKey[] {
  const fields = new Set(getVisibleFieldKeys(form.documentType, form.actionType));
  if (form.documentType === "petty_cash_reimbursement" && selectedCategory?.requires_merchant) {
    fields.add("projectId");
    fields.add("merchantId");
  }
  if (form.documentType === "petty_cash_reimbursement" && selectedCategory?.requires_person) {
    fields.add("personId");
  }
  if (form.documentType === "petty_cash_reimbursement" && selectedCategory?.requires_borrower) {
    fields.add("borrowerPersonId");
  }
  return [...fields];
}

function dynamicRequiredFields(
  form: DocumentEntryForm,
  visibleFields: DocumentFieldKey[],
  selectedCategory: CategoryOption | undefined
): DocumentFieldKey[] {
  const required = new Set<DocumentFieldKey>();
  for (const field of visibleFields) {
    if (field === "originalDocumentId" && !isOriginalDocumentFieldRequired(form.documentType, form.actionType)) continue;
    if (field === "projectId" && form.documentType === "loan_writeoff") continue;
    if (field === "merchantId" && form.documentType !== "project_income" && !selectedCategory?.requires_merchant) continue;
    if (field === "operatorPersonId" && form.documentType === "petty_cash_reimbursement") continue;
    required.add(field);
  }
  return [...required];
}

function primaryAccountOptions(form: DocumentEntryForm, options: DocumentEntryOptions) {
  if (form.documentType === "petty_cash_return" || form.documentType === "petty_cash_reimbursement") {
    return pettyCashAccountsForPerson(options, form.personId);
  }
  return companyAccounts(options);
}

function accountsWithCurrency(accounts: AccountOption[], currencyCode: string) {
  if (!currencyCode) return accounts;
  return accounts.filter((account) => account.currency_code === currencyCode);
}

function counterpartyOptions(
  form: DocumentEntryForm,
  companyAccountOptions: AccountOption[],
  personPettyCashAccountOptions: AccountOption[],
  selectedAccountCurrency: string
) {
  if (form.documentType === "exchange") return accountsWithCurrency(companyAccountOptions, "USDT");
  if (form.documentType === "account_transfer") {
    return accountsWithCurrency(companyAccountOptions, selectedAccountCurrency).filter(
      (account) => account.id !== form.accountId
    );
  }
  if (form.documentType === "petty_cash_issue") return accountsWithCurrency(personPettyCashAccountOptions, selectedAccountCurrency);
  if (form.documentType === "petty_cash_return") return accountsWithCurrency(companyAccountOptions, selectedAccountCurrency);
  return accountsWithCurrency(companyAccountOptions, selectedAccountCurrency);
}

function residualSelectionErrors(form: DocumentEntryForm, state: DocumentEntryState) {
  const errors: string[] = [];
  if (form.merchantId && !state.optionsByField.merchantId?.some((merchant) => merchant.id === form.merchantId)) {
    errors.push("商户必须属于所选项目");
  }
  if (form.accountId && !state.optionsByField.accountId?.some((account) => account.id === form.accountId)) {
    errors.push("账户不适用于当前单据类型");
  }
  if (
    form.counterpartyAccountId &&
    !state.optionsByField.counterpartyAccountId?.some((account) => account.id === form.counterpartyAccountId)
  ) {
    errors.push("对方账户不适用于当前单据类型");
  }
  if (form.categoryId && !state.optionsByField.categoryId?.some((category) => category.id === form.categoryId)) {
    errors.push("科目类型不适用于当前单据类型");
  }
  return errors;
}
