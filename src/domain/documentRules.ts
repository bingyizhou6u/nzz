import type { ActionType, DocumentStatus, DocumentType } from "./types";

export const documentRuleMessages = {
  unsupportedDocumentType: "单据类型暂不支持创建或审核",
  lineRequired: "单据必须至少有一条明细",
  singleLineRequired: "当前单据类型必须只有一条明细",
  originalRequired: "必须选择原单据",
  originalMustBeApprovedLoanOut: "借款还款或核销必须关联已审核借款发放单",
  loanBorrowerMatch: "借款人必须与原借款单一致",
  loanCurrencyMatch: "还款或核销币种必须与原借款单一致",
  projectRequired: "必须选择项目",
  merchantRequired: "项目收入必须选择商户",
  categoryRequired: "必须选择科目",
  accountRequired: "必须选择账户",
  counterpartyAccountRequired: "必须选择对方账户",
  personRequired: "必须选择人员",
  borrowerRequired: "必须选择借款人",
  currencyRequired: "必须选择币种",
  amountRequired: "金额必须大于 0",
  usdtCostRequired: "必须填写 USDT 成本",
  projectActive: "项目必须是启用状态",
  merchantActive: "商户必须是启用状态",
  merchantProject: "商户必须属于所选项目",
  accountActive: "账户必须是启用状态",
  companyAccount: "账户必须是公司账户",
  pettyCashAccount: "备用金账户必须属于所选人员",
  sameCurrency: "币种必须与账户币种一致",
  transferSameAccount: "转出账户和转入账户不能相同",
  currencyEnabled: "币种必须是启用状态",
  personEnabled: "人员必须是启用状态",
  categoryEnabled: "科目必须是启用状态",
  categoryType: "科目类型不适用于当前单据类型",
  categoryDirection: "科目方向不适用于当前单据类型",
  categoryRequiresMerchant: "该科目要求选择商户",
  categoryRequiresPerson: "该科目要求选择人员",
  categoryRequiresBorrower: "该科目要求选择借款人",
  reversalTypeMatch: "冲正单据类型必须与原单据一致",
  reversalOriginalApproved: "冲正必须关联已审核原单据",
  summaryRequired: "必须填写摘要",
  unexpectedRuleError: "单据规则校验失败"
} as const;

export interface DocumentRuleViolation {
  field: string;
  message: string;
}

export interface DocumentRuleDocument {
  id?: string;
  documentType: DocumentType;
  actionType: ActionType;
  operatorPersonId?: string | null;
  projectId?: string | null;
  merchantId?: string | null;
  categoryId?: string | null;
  originalDocumentId?: string | null;
  borrowerPersonId?: string | null;
  summary?: string | null;
  businessDate?: string;
  period?: string;
}

export interface DocumentRuleLine {
  accountId?: string | null;
  counterpartyAccountId?: string | null;
  personId?: string | null;
  borrowerPersonId?: string | null;
  currencyCode?: string | null;
  amountMinor?: number | null;
  usdtAmountMinor?: number | null;
}

export interface DocumentRuleOriginalDocument {
  id: string;
  documentType: DocumentType;
  status: DocumentStatus;
  borrowerPersonId?: string | null;
}

export interface DocumentMasterDataSnapshot {
  people: Map<string, { id: string; is_enabled: number }>;
  projects: Map<string, { id: string; status: string }>;
  merchants: Map<string, { id: string; project_id: string; status: string }>;
  accounts: Map<
    string,
    {
      id: string;
      account_type: string;
      currency_code: string;
      owner_person_id: string | null;
      is_company_account: number;
      status: string;
    }
  >;
  categories: Map<
    string,
    {
      id: string;
      category_type: string;
      direction: string;
      affects_expense_report: number;
      requires_merchant: number;
      requires_person: number;
      requires_borrower: number;
      is_enabled: number;
    }
  >;
  currencies: Map<string, { code: string; is_enabled: number }>;
}

export interface ValidateDocumentStructureInput {
  stage: "draft" | "submit" | "approve";
  document: DocumentRuleDocument;
  lines: DocumentRuleLine[];
}

export interface ValidateDocumentMasterDataInput {
  document: DocumentRuleDocument;
  lines: DocumentRuleLine[];
  masterData: DocumentMasterDataSnapshot;
  originalDocument?: DocumentRuleOriginalDocument | null;
  originalLines?: DocumentRuleLine[];
}

export type DocumentRuleHeaderField =
  | "operatorPersonId"
  | "projectId"
  | "merchantId"
  | "categoryId"
  | "originalDocumentId"
  | "personId"
  | "borrowerPersonId"
  | "summary";
export type DocumentRuleLineField =
  | "accountId"
  | "counterpartyAccountId"
  | "personId"
  | "currencyCode"
  | "amountMinor"
  | "usdtAmountMinor";

export interface DocumentRuleDefinition {
  headerFields: DocumentRuleHeaderField[];
  lineFields: DocumentRuleLineField[];
  singleLine: boolean;
}

export const SUPPORTED_DOCUMENT_TYPES = new Set<DocumentType>([
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

const SUPPORTED_ACTION_TYPES = new Set<ActionType>(["normal", "reversal"]);

export const DOCUMENT_RULES: Record<DocumentType, DocumentRuleDefinition> = {
  project_income: {
    headerFields: ["operatorPersonId", "projectId", "merchantId", "categoryId", "summary"],
    lineFields: ["accountId", "currencyCode", "amountMinor"],
    singleLine: false
  },
  exchange: {
    headerFields: ["operatorPersonId", "categoryId", "summary"],
    lineFields: ["accountId", "counterpartyAccountId", "currencyCode", "amountMinor", "usdtAmountMinor"],
    singleLine: true
  },
  account_transfer: {
    headerFields: ["operatorPersonId", "summary"],
    lineFields: ["accountId", "counterpartyAccountId", "currencyCode", "amountMinor"],
    singleLine: true
  },
  petty_cash_issue: {
    headerFields: ["operatorPersonId", "summary"],
    lineFields: ["accountId", "counterpartyAccountId", "personId", "currencyCode", "amountMinor"],
    singleLine: true
  },
  petty_cash_return: {
    headerFields: ["operatorPersonId", "summary"],
    lineFields: ["accountId", "counterpartyAccountId", "personId", "currencyCode", "amountMinor"],
    singleLine: true
  },
  petty_cash_reimbursement: {
    headerFields: ["personId", "categoryId", "summary"],
    lineFields: ["accountId", "currencyCode", "amountMinor"],
    singleLine: true
  },
  loan_out: {
    headerFields: ["operatorPersonId", "borrowerPersonId", "categoryId", "summary"],
    lineFields: ["accountId", "currencyCode", "amountMinor", "usdtAmountMinor"],
    singleLine: false
  },
  loan_repayment: {
    headerFields: ["operatorPersonId", "borrowerPersonId", "originalDocumentId", "summary"],
    lineFields: ["accountId", "currencyCode", "amountMinor"],
    singleLine: true
  },
  loan_writeoff: {
    headerFields: ["operatorPersonId", "borrowerPersonId", "categoryId", "originalDocumentId", "summary"],
    lineFields: ["currencyCode", "amountMinor"],
    singleLine: true
  },
  manual_adjustment: {
    headerFields: [],
    lineFields: [],
    singleLine: false
  }
};

const messageByHeaderField: Record<DocumentRuleHeaderField, string> = {
  operatorPersonId: documentRuleMessages.personRequired,
  projectId: documentRuleMessages.projectRequired,
  merchantId: documentRuleMessages.merchantRequired,
  categoryId: documentRuleMessages.categoryRequired,
  originalDocumentId: documentRuleMessages.originalRequired,
  personId: documentRuleMessages.personRequired,
  borrowerPersonId: documentRuleMessages.borrowerRequired,
  summary: documentRuleMessages.summaryRequired
};

const messageByLineField: Record<DocumentRuleLineField, string> = {
  accountId: documentRuleMessages.accountRequired,
  counterpartyAccountId: documentRuleMessages.counterpartyAccountRequired,
  personId: documentRuleMessages.personRequired,
  currencyCode: documentRuleMessages.currencyRequired,
  amountMinor: documentRuleMessages.amountRequired,
  usdtAmountMinor: documentRuleMessages.usdtCostRequired
};

export function validateDocumentStructure(input: ValidateDocumentStructureInput): DocumentRuleViolation[] {
  try {
    return validateDocumentStructureUnsafe(input);
  } catch {
    return [violation("document", documentRuleMessages.unexpectedRuleError)];
  }
}

export function validateDocumentMasterData(input: ValidateDocumentMasterDataInput): DocumentRuleViolation[] {
  try {
    return validateDocumentMasterDataUnsafe(input);
  } catch {
    return [violation("document", documentRuleMessages.unexpectedRuleError)];
  }
}

export function assertNoDocumentRuleViolations(violations: DocumentRuleViolation[]) {
  if (violations.length > 0) {
    throw new Error(violations[0].message);
  }
}

export function isOriginalRequiredForDocument(documentType: DocumentType, actionType: ActionType) {
  return actionType === "reversal" || (actionType === "normal" && isLoanSettlementDocumentType(documentType));
}

export function requiredHeaderFieldsFor(documentType: DocumentType, actionType: ActionType): DocumentRuleHeaderField[] {
  if (!isSupportedDocumentType(documentType) || !isSupportedActionType(actionType)) return [];
  if (actionType === "reversal") return ["originalDocumentId", "summary"];

  const fields = [...DOCUMENT_RULES[documentType].headerFields];
  if (isOriginalRequiredForDocument(documentType, actionType) && !fields.includes("originalDocumentId")) {
    fields.unshift("originalDocumentId");
  }
  return fields;
}

export function requiredLineFieldsFor(documentType: DocumentType, actionType: ActionType): DocumentRuleLineField[] {
  if (!isSupportedDocumentType(documentType) || !isSupportedActionType(actionType)) return [];
  if (actionType === "reversal") return [];
  return [...DOCUMENT_RULES[documentType].lineFields];
}

function validateDocumentStructureUnsafe(input: ValidateDocumentStructureInput): DocumentRuleViolation[] {
  const errors: DocumentRuleViolation[] = [];
  const { document, stage } = input;
  const lines = Array.isArray(input.lines) ? input.lines : [];

  if (!isSupportedDocumentType(document.documentType)) {
    addViolation(errors, "documentType", documentRuleMessages.unsupportedDocumentType);
    return errors;
  }
  if (!isSupportedActionType(document.actionType)) {
    addViolation(errors, "actionType", documentRuleMessages.unsupportedDocumentType);
    return errors;
  }

  if (document.actionType === "reversal") {
    validateRequiredHeaderFields(errors, document, lines, requiredHeaderFieldsFor(document.documentType, document.actionType));
    return errors;
  }

  if (stage === "draft" && lines.length === 0) {
    return errors;
  }

  validateRequiredHeaderFields(errors, document, lines, requiredHeaderFieldsFor(document.documentType, document.actionType));

  if (stage === "submit" || stage === "approve") {
    if (lines.length === 0) {
      addViolation(errors, "lines", documentRuleMessages.lineRequired);
      return errors;
    }
    if (DOCUMENT_RULES[document.documentType].singleLine && lines.length !== 1) {
      addViolation(errors, "lines", documentRuleMessages.singleLineRequired);
    }
  }

  const requiredLineFields = requiredLineFieldsFor(document.documentType, document.actionType);
  lines.forEach((line, index) => {
    for (const field of requiredLineFields) {
      if (!hasLineField(line, field)) {
        addViolation(errors, lineFieldName(index, field), messageByLineField[field]);
      }
    }
  });

  return errors;
}

function validateDocumentMasterDataUnsafe(input: ValidateDocumentMasterDataInput): DocumentRuleViolation[] {
  const errors: DocumentRuleViolation[] = [];
  const { document, masterData } = input;
  const lines = Array.isArray(input.lines) ? input.lines : [];

  if (!isSupportedDocumentType(document.documentType)) {
    addViolation(errors, "documentType", documentRuleMessages.unsupportedDocumentType);
    return errors;
  }
  if (!isSupportedActionType(document.actionType)) {
    addViolation(errors, "actionType", documentRuleMessages.unsupportedDocumentType);
    return errors;
  }

  if (document.actionType === "reversal") {
    validateReversalOriginal(errors, document, input.originalDocument);
    return errors;
  }

  validatePeople(errors, document, lines, masterData);
  validateProjectAndMerchant(errors, document, masterData);
  validateCategory(errors, document, lines, masterData);
  validateCurrencies(errors, lines, masterData);
  validateAccounts(errors, document.documentType, lines, masterData);
  validateLoanBorrowers(errors, document, lines);
  validateLoanSettlement(errors, document, lines, input.originalDocument, input.originalLines ?? []);

  return errors;
}

function validateRequiredHeaderFields(
  errors: DocumentRuleViolation[],
  document: DocumentRuleDocument,
  lines: DocumentRuleLine[],
  fields: DocumentRuleHeaderField[]
) {
  for (const field of fields) {
    if (!hasHeaderField(document, lines, field)) {
      addViolation(errors, field, messageByHeaderField[field]);
    }
  }
}

function validateReversalOriginal(
  errors: DocumentRuleViolation[],
  document: DocumentRuleDocument,
  originalDocument: DocumentRuleOriginalDocument | null | undefined
) {
  if (!originalDocument || originalDocument.status !== "approved") {
    addViolation(errors, "originalDocumentId", documentRuleMessages.reversalOriginalApproved);
    return;
  }
  if (originalDocument.documentType !== document.documentType) {
    addViolation(errors, "documentType", documentRuleMessages.reversalTypeMatch);
  }
}

function validatePeople(
  errors: DocumentRuleViolation[],
  document: DocumentRuleDocument,
  lines: DocumentRuleLine[],
  masterData: DocumentMasterDataSnapshot
) {
  for (const personId of uniqueText([
    document.operatorPersonId,
    document.borrowerPersonId,
    ...lines.flatMap((line) => [line.personId, line.borrowerPersonId])
  ])) {
    const person = mapGet(masterData.people, personId);
    if (!person || person.is_enabled !== 1) {
      addViolation(errors, "personId", documentRuleMessages.personEnabled);
    }
  }
}

function validateProjectAndMerchant(
  errors: DocumentRuleViolation[],
  document: DocumentRuleDocument,
  masterData: DocumentMasterDataSnapshot
) {
  const projectId = text(document.projectId);
  if (projectId) {
    const project = mapGet(masterData.projects, projectId);
    if (!project || project.status !== "active") {
      addViolation(errors, "projectId", documentRuleMessages.projectActive);
    }
  }

  const merchantId = text(document.merchantId);
  if (!merchantId) return;

  const merchant = mapGet(masterData.merchants, merchantId);
  if (!merchant || merchant.status !== "active") {
    addViolation(errors, "merchantId", documentRuleMessages.merchantActive);
    return;
  }
  if (projectId && merchant.project_id !== projectId) {
    addViolation(errors, "merchantId", documentRuleMessages.merchantProject);
  }
}

function validateCategory(
  errors: DocumentRuleViolation[],
  document: DocumentRuleDocument,
  lines: DocumentRuleLine[],
  masterData: DocumentMasterDataSnapshot
) {
  const categoryId = text(document.categoryId);
  if (!categoryId) return;

  const category = mapGet(masterData.categories, categoryId);
  if (!category || category.is_enabled !== 1) {
    addViolation(errors, "categoryId", documentRuleMessages.categoryEnabled);
    return;
  }

  if (document.documentType === "project_income") {
    requireCategoryType(errors, category.category_type === "income");
    requireCategoryDirection(errors, category.direction === "in");
  }
  if (document.documentType === "exchange") {
    requireCategoryType(errors, category.category_type === "exchange");
  }
  if (document.documentType === "petty_cash_reimbursement") {
    requireCategoryType(errors, category.affects_expense_report === 1);
    requireCategoryDirection(errors, category.direction === "out");
  }
  if (document.documentType === "loan_out") {
    requireCategoryType(errors, category.category_type === "loan");
  }
  if (document.documentType === "loan_writeoff") {
    requireCategoryType(errors, category.category_type === "expense" || category.category_type === "loss");
    requireCategoryDirection(errors, category.direction === "out");
  }

  if (category.requires_merchant === 1 && (!text(document.projectId) || !text(document.merchantId))) {
    addViolation(errors, "merchantId", documentRuleMessages.categoryRequiresMerchant);
  }
  if (category.requires_person === 1 && !currentPersonId(lines)) {
    addViolation(errors, "personId", documentRuleMessages.categoryRequiresPerson);
  }
  if (category.requires_borrower === 1 && !currentBorrowerPersonId(document, lines)) {
    addViolation(errors, "borrowerPersonId", documentRuleMessages.categoryRequiresBorrower);
  }
}

function validateCurrencies(
  errors: DocumentRuleViolation[],
  lines: DocumentRuleLine[],
  masterData: DocumentMasterDataSnapshot
) {
  for (const currencyCode of uniqueText(lines.map((line) => line.currencyCode))) {
    const currency = mapGet(masterData.currencies, currencyCode);
    if (!currency || currency.is_enabled !== 1) {
      addViolation(errors, "currencyCode", documentRuleMessages.currencyEnabled);
    }
  }
}

function validateAccounts(
  errors: DocumentRuleViolation[],
  documentType: DocumentType,
  lines: DocumentRuleLine[],
  masterData: DocumentMasterDataSnapshot
) {
  lines.forEach((line, index) => {
    const account = accountForLine(errors, masterData, line.accountId, lineFieldName(index, "accountId"));
    const counterpartyAccount = accountForLine(
      errors,
      masterData,
      line.counterpartyAccountId,
      lineFieldName(index, "counterpartyAccountId")
    );
    const lineCurrencyCode = text(line.currencyCode);

    if (account && lineCurrencyCode && account.currency_code !== lineCurrencyCode) {
      addViolation(errors, lineFieldName(index, "currencyCode"), documentRuleMessages.sameCurrency);
    }

    if (documentType === "exchange" || documentType === "account_transfer") {
      requireCompanyAccount(errors, account, lineFieldName(index, "accountId"));
      requireCompanyAccount(errors, counterpartyAccount, lineFieldName(index, "counterpartyAccountId"));
      requireDifferentAccounts(errors, line, index);
    }

    if (documentType === "exchange") {
      if (counterpartyAccount && counterpartyAccount.currency_code !== "USDT") {
        addViolation(errors, lineFieldName(index, "counterpartyAccountId"), documentRuleMessages.sameCurrency);
      }
    }

    if (documentType === "account_transfer") {
      requireSameAccountCurrency(errors, account, counterpartyAccount, index);
    }

    if (documentType === "project_income" || documentType === "loan_out" || documentType === "loan_repayment") {
      requireCompanyAccount(errors, account, lineFieldName(index, "accountId"));
    }

    if (documentType === "petty_cash_issue") {
      requireCompanyAccount(errors, account, lineFieldName(index, "accountId"));
      requirePettyCashAccount(errors, counterpartyAccount, line.personId, lineFieldName(index, "counterpartyAccountId"));
      requireSameAccountCurrency(errors, account, counterpartyAccount, index);
    }

    if (documentType === "petty_cash_return") {
      requirePettyCashAccount(errors, account, line.personId, lineFieldName(index, "accountId"));
      requireCompanyAccount(errors, counterpartyAccount, lineFieldName(index, "counterpartyAccountId"));
      requireSameAccountCurrency(errors, account, counterpartyAccount, index);
    }

    if (documentType === "petty_cash_reimbursement") {
      requirePettyCashAccount(errors, account, line.personId, lineFieldName(index, "accountId"));
    }
  });
}

function validateLoanSettlement(
  errors: DocumentRuleViolation[],
  document: DocumentRuleDocument,
  lines: DocumentRuleLine[],
  originalDocument: DocumentRuleOriginalDocument | null | undefined,
  originalLines: DocumentRuleLine[]
) {
  if (!isLoanSettlementDocumentType(document.documentType)) return;

  if (!originalDocument || originalDocument.documentType !== "loan_out" || originalDocument.status !== "approved") {
    addViolation(errors, "originalDocumentId", documentRuleMessages.originalMustBeApprovedLoanOut);
    return;
  }

  const settlementBorrower = currentBorrowerPersonId(document, lines);
  const originalBorrower = text(originalDocument.borrowerPersonId) || currentBorrowerPersonId({}, originalLines);
  if (settlementBorrower && originalBorrower && settlementBorrower !== originalBorrower) {
    addViolation(errors, "borrowerPersonId", documentRuleMessages.loanBorrowerMatch);
  }

  const settlementCurrency = text(lines[0]?.currencyCode);
  const originalCurrencies = new Set(uniqueText(originalLines.map((line) => line.currencyCode)));
  if (settlementCurrency && !originalCurrencies.has(settlementCurrency)) {
    addViolation(errors, "currencyCode", documentRuleMessages.loanCurrencyMatch);
  }
}

function validateLoanBorrowers(errors: DocumentRuleViolation[], document: DocumentRuleDocument, lines: DocumentRuleLine[]) {
  if (!isLoanDocumentType(document.documentType)) return;

  const borrowerPersonId = currentBorrowerPersonId(document, lines);
  if (!borrowerPersonId) return;

  for (const line of lines) {
    const lineBorrowerPersonId = text(line.borrowerPersonId);
    if (lineBorrowerPersonId && lineBorrowerPersonId !== borrowerPersonId) {
      addViolation(errors, "borrowerPersonId", documentRuleMessages.loanBorrowerMatch);
      return;
    }
  }
}

function accountForLine(
  errors: DocumentRuleViolation[],
  masterData: DocumentMasterDataSnapshot,
  accountId: string | null | undefined,
  field: string
) {
  const id = text(accountId);
  if (!id) return null;

  const account = mapGet(masterData.accounts, id);
  if (!account || account.status !== "active") {
    addViolation(errors, field, documentRuleMessages.accountActive);
    return null;
  }
  return account;
}

function requireCategoryType(errors: DocumentRuleViolation[], valid: boolean) {
  if (!valid) addViolation(errors, "categoryId", documentRuleMessages.categoryType);
}

function requireCategoryDirection(errors: DocumentRuleViolation[], valid: boolean) {
  if (!valid) addViolation(errors, "categoryId", documentRuleMessages.categoryDirection);
}

function requireCompanyAccount(
  errors: DocumentRuleViolation[],
  account: { is_company_account: number } | null,
  field: string
) {
  if (account && account.is_company_account !== 1) {
    addViolation(errors, field, documentRuleMessages.companyAccount);
  }
}

function requirePettyCashAccount(
  errors: DocumentRuleViolation[],
  account: { account_type: string; owner_person_id: string | null } | null,
  personId: string | null | undefined,
  field: string
) {
  if (!account) return;
  if (account.account_type !== "petty_cash" || account.owner_person_id !== text(personId)) {
    addViolation(errors, field, documentRuleMessages.pettyCashAccount);
  }
}

function requireSameAccountCurrency(
  errors: DocumentRuleViolation[],
  account: { currency_code: string } | null,
  counterpartyAccount: { currency_code: string } | null,
  index: number
) {
  if (account && counterpartyAccount && account.currency_code !== counterpartyAccount.currency_code) {
    addViolation(errors, lineFieldName(index, "counterpartyAccountId"), documentRuleMessages.sameCurrency);
  }
}

function requireDifferentAccounts(errors: DocumentRuleViolation[], line: DocumentRuleLine, index: number) {
  const accountId = text(line.accountId);
  const counterpartyAccountId = text(line.counterpartyAccountId);
  if (accountId && counterpartyAccountId && accountId === counterpartyAccountId) {
    addViolation(errors, lineFieldName(index, "counterpartyAccountId"), documentRuleMessages.transferSameAccount);
  }
}

function hasHeaderField(document: DocumentRuleDocument, lines: DocumentRuleLine[], field: DocumentRuleHeaderField) {
  if (field === "personId") return Boolean(currentPersonId(lines));
  if (field === "borrowerPersonId") return Boolean(currentBorrowerPersonId(document, lines));
  return hasText(document[field]);
}

function hasLineField(line: DocumentRuleLine, field: DocumentRuleLineField) {
  if (field === "amountMinor" || field === "usdtAmountMinor") {
    const value = line[field];
    return Number.isSafeInteger(value) && (value as number) > 0;
  }
  return hasText(line[field]);
}

function currentPersonId(lines: DocumentRuleLine[]) {
  return firstText(lines.map((line) => line.personId));
}

function currentBorrowerPersonId(document: Pick<DocumentRuleDocument, "borrowerPersonId">, lines: DocumentRuleLine[]) {
  return text(document.borrowerPersonId) || firstText(lines.map((line) => line.borrowerPersonId));
}

function isLoanSettlementDocumentType(documentType: DocumentType) {
  return documentType === "loan_repayment" || documentType === "loan_writeoff";
}

function isLoanDocumentType(documentType: DocumentType) {
  return documentType === "loan_out" || isLoanSettlementDocumentType(documentType);
}

function isSupportedDocumentType(documentType: DocumentType) {
  return SUPPORTED_DOCUMENT_TYPES.has(documentType);
}

function isSupportedActionType(actionType: ActionType) {
  return SUPPORTED_ACTION_TYPES.has(actionType);
}

function mapGet<T>(map: Map<string, T>, key: string): T | undefined {
  return map instanceof Map ? map.get(key) : undefined;
}

function addViolation(errors: DocumentRuleViolation[], field: string, message: string) {
  if (!errors.some((error) => error.field === field && error.message === message)) {
    errors.push(violation(field, message));
  }
}

function violation(field: string, message: string): DocumentRuleViolation {
  return { field, message };
}

function lineFieldName(index: number, field: DocumentRuleLineField) {
  return `lines.${index}.${field}`;
}

function uniqueText(values: Array<string | null | undefined>) {
  return [...new Set(values.map(text).filter(Boolean))];
}

function firstText(values: Array<string | null | undefined>) {
  return values.map(text).find(Boolean) ?? "";
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
