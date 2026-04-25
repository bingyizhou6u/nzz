export type PersonRole = "admin" | "finance_manager" | "finance_entry" | "logistics" | "readonly" | "borrower";
export type ActiveStatus = "active" | "archived";
export type AccountType =
  | "usdt_wallet"
  | "usd_account"
  | "currency_reserve"
  | "public_account"
  | "petty_cash"
  | "temporary";
export type CategoryType = "income" | "expense" | "exchange" | "loan" | "loss" | "adjustment";
export type CategoryDirection = "in" | "out" | "neutral";

export interface ReferencedRow {
  referenceCount: number;
}

export interface PersonRow extends ReferencedRow {
  id: string;
  name: string;
  alias: string | null;
  roles_json: string;
  is_enabled: number;
  login_email: string | null;
  access_subject: string | null;
  last_login_at: string | null;
  created_at: string;
}

export interface ProjectRow extends ReferencedRow {
  id: string;
  code: string;
  name: string;
  owner_person_id: string | null;
  status: ActiveStatus;
  note: string | null;
  created_at: string;
}

export interface MerchantRow extends ReferencedRow {
  id: string;
  code: string;
  name: string;
  project_id: string;
  merchant_type: string | null;
  launch_date: string | null;
  status: ActiveStatus;
  owner_person_id: string | null;
  note: string | null;
  created_at: string;
}

export interface AccountRow extends ReferencedRow {
  id: string;
  name: string;
  account_type: AccountType;
  currency_code: string;
  owner_person_id: string | null;
  is_company_account: number;
  allow_negative: number;
  status: ActiveStatus;
  created_at: string;
}

export interface CurrencyRow extends ReferencedRow {
  code: string;
  name: string;
  minor_units: number;
  is_enabled: number;
}

export interface CategoryRow extends ReferencedRow {
  id: string;
  name: string;
  parent_id: string | null;
  category_type: CategoryType;
  direction: CategoryDirection;
  affects_expense_report: number;
  affects_project_report: number;
  requires_merchant: number;
  requires_person: number;
  requires_borrower: number;
  is_enabled: number;
}

export interface MasterDataSnapshot {
  people: PersonRow[];
  projects: ProjectRow[];
  merchants: MerchantRow[];
  accounts: AccountRow[];
  currencies: CurrencyRow[];
  categories: CategoryRow[];
}

export interface PersonForm {
  name: string;
  alias: string;
  roles: PersonRole[];
  loginEmail: string;
  isEnabled: boolean;
}

export interface ProjectForm {
  code: string;
  name: string;
  ownerPersonId: string;
  status: ActiveStatus;
  note: string;
}

export interface MerchantForm {
  code: string;
  name: string;
  projectId: string;
  merchantType: string;
  launchDate: string;
  status: ActiveStatus;
  ownerPersonId: string;
  note: string;
}

export interface AccountForm {
  name: string;
  accountType: AccountType;
  currencyCode: string;
  ownerPersonId: string;
  isCompanyAccount: boolean;
  allowNegative: boolean;
  status: ActiveStatus;
}

export interface CurrencyForm {
  code: string;
  name: string;
  minorUnits: string;
  isEnabled: boolean;
}

export interface CategoryForm {
  name: string;
  parentId: string;
  categoryType: CategoryType;
  direction: CategoryDirection;
  affectsExpenseReport: boolean;
  affectsProjectReport: boolean;
  requiresMerchant: boolean;
  requiresPerson: boolean;
  requiresBorrower: boolean;
  isEnabled: boolean;
}
