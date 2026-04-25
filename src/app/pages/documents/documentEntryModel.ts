import type { ActionType, DocumentType } from "../../../domain/types";
import type {
  AccountOption,
  CategoryOption,
  DocumentEntryForm,
  DocumentEntryOptions,
  DocumentFieldKey,
  MerchantOption
} from "./documentEntryTypes";

function padCalendarPart(value: number) {
  return String(value).padStart(2, "0");
}

export function formatLocalDateInputValue(date: Date) {
  return `${date.getFullYear()}-${padCalendarPart(date.getMonth() + 1)}-${padCalendarPart(date.getDate())}`;
}

export function formatLocalMonthInputValue(date: Date) {
  return `${date.getFullYear()}-${padCalendarPart(date.getMonth() + 1)}`;
}

export function createInitialDocumentForm(date = new Date()): DocumentEntryForm {
  return {
    documentType: "project_income",
    actionType: "normal",
    businessDate: formatLocalDateInputValue(date),
    period: formatLocalMonthInputValue(date),
    originalDocumentId: "",
    operatorPersonId: "",
    projectId: "",
    merchantId: "",
    categoryId: "",
    accountId: "",
    counterpartyAccountId: "",
    currencyCode: "AED",
    amountMajor: "",
    usdtAmountMajor: "",
    personId: "",
    borrowerPersonId: "",
    summary: ""
  };
}

export function isOriginalDocumentRequired(actionType: ActionType) {
  return actionType === "correction" || actionType === "reversal";
}

export function isOriginalDocumentFieldRequired(documentType: DocumentType, actionType: ActionType) {
  return (
    isOriginalDocumentRequired(actionType) ||
    (actionType === "normal" && (documentType === "loan_repayment" || documentType === "loan_writeoff"))
  );
}

const baseFieldsByType: Record<DocumentType, DocumentFieldKey[]> = {
  project_income: [
    "operatorPersonId",
    "projectId",
    "merchantId",
    "categoryId",
    "accountId",
    "currencyCode",
    "amountMajor",
    "usdtAmountMajor",
    "summary"
  ],
  exchange: [
    "operatorPersonId",
    "counterpartyAccountId",
    "accountId",
    "currencyCode",
    "amountMajor",
    "usdtAmountMajor",
    "categoryId",
    "summary"
  ],
  account_transfer: ["operatorPersonId", "accountId", "counterpartyAccountId", "currencyCode", "amountMajor", "summary"],
  petty_cash_issue: [
    "operatorPersonId",
    "personId",
    "accountId",
    "counterpartyAccountId",
    "currencyCode",
    "amountMajor",
    "summary"
  ],
  petty_cash_return: [
    "operatorPersonId",
    "personId",
    "accountId",
    "counterpartyAccountId",
    "currencyCode",
    "amountMajor",
    "summary"
  ],
  petty_cash_reimbursement: [
    "personId",
    "projectId",
    "merchantId",
    "categoryId",
    "accountId",
    "currencyCode",
    "amountMajor",
    "summary"
  ],
  loan_out: [
    "operatorPersonId",
    "borrowerPersonId",
    "accountId",
    "currencyCode",
    "amountMajor",
    "usdtAmountMajor",
    "categoryId",
    "summary"
  ],
  loan_repayment: [
    "operatorPersonId",
    "borrowerPersonId",
    "accountId",
    "currencyCode",
    "amountMajor",
    "originalDocumentId",
    "summary"
  ],
  loan_writeoff: [
    "operatorPersonId",
    "borrowerPersonId",
    "projectId",
    "categoryId",
    "currencyCode",
    "amountMajor",
    "originalDocumentId",
    "summary"
  ],
  manual_adjustment: [
    "operatorPersonId",
    "projectId",
    "categoryId",
    "accountId",
    "currencyCode",
    "amountMajor",
    "usdtAmountMajor",
    "summary"
  ]
};

export function getVisibleFieldKeys(documentType: DocumentType, actionType: ActionType): DocumentFieldKey[] {
  if (actionType === "reversal") return ["originalDocumentId", "summary"];

  const fields = baseFieldsByType[documentType];
  if (isOriginalDocumentRequired(actionType) && !fields.includes("originalDocumentId")) {
    return ["originalDocumentId", ...fields];
  }
  return fields;
}

export function merchantOptionsForProject(options: DocumentEntryOptions, projectId: string): MerchantOption[] {
  return options.merchants.filter((merchant) => merchant.project_id === projectId);
}

export function pettyCashAccountsForPerson(options: DocumentEntryOptions, personId: string): AccountOption[] {
  return options.accounts.filter((account) => account.account_type === "petty_cash" && account.owner_person_id === personId);
}

export function companyAccounts(options: DocumentEntryOptions): AccountOption[] {
  return options.accounts.filter((account) => account.is_company_account);
}

export function accountCurrencyCode(options: DocumentEntryOptions, accountId: string) {
  return options.accounts.find((account) => account.id === accountId)?.currency_code ?? "";
}

export function categoryOptionsForDocumentType(
  options: DocumentEntryOptions,
  documentType: DocumentType
): CategoryOption[] {
  if (documentType === "project_income") {
    return options.categories.filter((category) => category.category_type === "income");
  }
  if (documentType === "petty_cash_reimbursement") {
    return options.categories.filter((category) => category.affects_expense_report);
  }
  if (documentType === "loan_writeoff") {
    return options.categories.filter((category) => category.category_type === "expense" || category.category_type === "loss");
  }
  if (documentType === "exchange") {
    return options.categories.filter((category) => category.category_type === "exchange");
  }
  if (documentType === "loan_out" || documentType === "loan_repayment") {
    return options.categories.filter((category) => category.category_type === "loan");
  }
  return options.categories;
}

const fieldLabels: Record<DocumentFieldKey, string> = {
  originalDocumentId: "原单据",
  operatorPersonId: "经办人",
  projectId: "项目",
  merchantId: "商户",
  categoryId: "科目",
  accountId: "账户",
  counterpartyAccountId: "对方账户",
  currencyCode: "币种",
  amountMajor: "金额",
  usdtAmountMajor: "USDT成本",
  personId: "人员",
  borrowerPersonId: "借款人",
  summary: "摘要"
};

function optionalString(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function amountMajorToMinor(value: string) {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error("金额格式必须最多两位小数");
  const [major, minor = ""] = normalized.split(".");
  return Number(major) * 100 + Number(minor.padEnd(2, "0"));
}

export function validateDocumentForm(
  form: DocumentEntryForm,
  options: DocumentEntryOptions,
  currentActorId: string,
  entryState?: { requiredFields: DocumentFieldKey[]; validationErrors: string[] }
): string[] {
  const errors: string[] = [];
  if (!currentActorId.trim()) errors.push("请选择当前操作人");
  if (options.people.length === 0) errors.push("请先到基础资料维护人员");
  if (options.currencies.length === 0) errors.push("请先到基础资料维护币种");
  if (isOriginalDocumentFieldRequired(form.documentType, form.actionType) && !form.originalDocumentId.trim()) {
    errors.push("请选择原单据");
  }

  const requiredFields = entryState?.requiredFields ?? getVisibleFieldKeys(form.documentType, form.actionType);
  for (const field of requiredFields) {
    if (!entryState && field === "merchantId" && form.documentType === "petty_cash_reimbursement") continue;
    if (!entryState && field === "operatorPersonId" && form.documentType === "petty_cash_reimbursement") continue;
    if (!entryState && field === "projectId" && form.documentType === "loan_writeoff") continue;
    if (field === "originalDocumentId") continue;
    if (!form[field].trim()) errors.push(`请选择或填写${fieldLabels[field]}`);
  }
  if (
    form.documentType === "account_transfer" &&
    form.accountId.trim() &&
    form.counterpartyAccountId.trim() &&
    form.accountId.trim() === form.counterpartyAccountId.trim()
  ) {
    errors.push("转出账户和转入账户不能相同");
  }
  const selectedAccountCurrency = accountCurrencyCode(options, form.accountId.trim());
  if (
    selectedAccountCurrency &&
    form.currencyCode.trim() &&
    selectedAccountCurrency.toUpperCase() !== form.currencyCode.trim().toUpperCase()
  ) {
    errors.push("币种必须与账户币种一致");
  }
  return [...errors, ...(entryState?.validationErrors ?? [])];
}

export function buildDocumentPayload(form: DocumentEntryForm, currentActorId: string) {
  if (form.actionType === "reversal") {
    return {
      documentType: form.documentType,
      actionType: form.actionType,
      businessDate: form.businessDate,
      period: form.period,
      originalDocumentId: form.originalDocumentId.trim(),
      summary: form.summary.trim(),
      createdBy: currentActorId.trim()
    };
  }

  const line: Record<string, unknown> = {
    lineType: "main",
    currencyCode: form.currencyCode.trim().toUpperCase(),
    amountMinor: amountMajorToMinor(form.amountMajor)
  };

  if (form.documentType !== "loan_writeoff") line.accountId = form.accountId.trim();
  if (optionalString(form.counterpartyAccountId)) line.counterpartyAccountId = form.counterpartyAccountId.trim();
  if (optionalString(form.personId)) line.personId = form.personId.trim();
  if (optionalString(form.borrowerPersonId)) line.borrowerPersonId = form.borrowerPersonId.trim();
  if (optionalString(form.usdtAmountMajor)) line.usdtAmountMinor = amountMajorToMinor(form.usdtAmountMajor);

  const payload: Record<string, unknown> = {
    documentType: form.documentType,
    actionType: form.actionType,
    businessDate: form.businessDate,
    period: form.period,
    summary: form.summary.trim(),
    createdBy: currentActorId.trim(),
    lines: [line]
  };

  for (const [key, value] of Object.entries({
    originalDocumentId: optionalString(form.originalDocumentId),
    operatorPersonId: optionalString(form.operatorPersonId),
    projectId: optionalString(form.projectId),
    merchantId: optionalString(form.merchantId),
    categoryId: optionalString(form.categoryId)
  })) {
    if (value) payload[key] = value;
  }

  return payload;
}
