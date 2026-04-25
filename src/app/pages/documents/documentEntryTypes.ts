import type { ActionType, DocumentType } from "../../../domain/types";

export interface PersonOption {
  id: string;
  name: string;
  alias: string | null;
  roles_json: string;
  is_enabled: number;
}

export interface ProjectOption {
  id: string;
  code: string;
  name: string;
  owner_person_id: string | null;
  status: string;
}

export interface MerchantOption {
  id: string;
  code: string;
  name: string;
  project_id: string;
  merchant_type: string | null;
  status: string;
}

export interface AccountOption {
  id: string;
  name: string;
  account_type: string;
  currency_code: string;
  owner_person_id: string | null;
  is_company_account: number;
  allow_negative: number;
  status: string;
}

export interface CurrencyOption {
  code: string;
  name: string;
  minor_units: number;
  is_enabled: number;
}

export interface CategoryOption {
  id: string;
  name: string;
  parent_id: string | null;
  category_type: string;
  direction: string;
  affects_expense_report: number;
  affects_project_report: number;
  requires_merchant: number;
  requires_person: number;
  requires_borrower: number;
  is_enabled: number;
}

export interface OriginalDocumentOption {
  id: string;
  document_no: string;
  document_type: DocumentType;
  business_date: string;
  period: string;
  summary: string;
}

export interface DocumentEntryOptions {
  people: PersonOption[];
  projects: ProjectOption[];
  merchants: MerchantOption[];
  accounts: AccountOption[];
  currencies: CurrencyOption[];
  categories: CategoryOption[];
}

export type DocumentFieldKey =
  | "originalDocumentId"
  | "operatorPersonId"
  | "projectId"
  | "merchantId"
  | "categoryId"
  | "accountId"
  | "counterpartyAccountId"
  | "currencyCode"
  | "amountMajor"
  | "usdtAmountMajor"
  | "personId"
  | "borrowerPersonId"
  | "summary";

export interface DocumentEntryForm {
  documentType: DocumentType;
  actionType: ActionType;
  businessDate: string;
  period: string;
  originalDocumentId: string;
  operatorPersonId: string;
  projectId: string;
  merchantId: string;
  categoryId: string;
  accountId: string;
  counterpartyAccountId: string;
  currencyCode: string;
  amountMajor: string;
  usdtAmountMajor: string;
  personId: string;
  borrowerPersonId: string;
  summary: string;
}
