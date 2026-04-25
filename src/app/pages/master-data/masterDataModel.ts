import { hasCapability, type Capability } from "../../session/sessionTypes";
import type {
  AccountForm,
  AccountType,
  CategoryDirection,
  CategoryForm,
  CategoryType,
  CurrencyForm,
  MerchantForm,
  PersonForm,
  PersonRole,
  ProjectForm,
  ReferencedRow
} from "./masterDataTypes";

export const personRoles: PersonRole[] = [
  "admin",
  "finance_manager",
  "finance_entry",
  "logistics",
  "readonly",
  "borrower"
];

export function canWriteMasterData(capabilities: readonly Capability[]) {
  return hasCapability(capabilities, "masterData.write");
}

export function canManagePeopleRoleAssignments(capabilities: readonly Capability[]) {
  return hasCapability(capabilities, "masterData.managePeopleRoles");
}

export const personRoleLabels: Record<PersonRole, string> = {
  admin: "管理员",
  finance_manager: "财务主管",
  finance_entry: "财务录入",
  logistics: "后勤人员",
  readonly: "只读",
  borrower: "借款人"
};

export const accountTypes: AccountType[] = [
  "usdt_wallet",
  "usd_account",
  "currency_reserve",
  "public_account",
  "petty_cash",
  "temporary"
];

export const accountTypeLabels: Record<AccountType, string> = {
  usdt_wallet: "USDT 钱包",
  usd_account: "美元账户",
  currency_reserve: "储备金账户",
  public_account: "公开收支账户",
  petty_cash: "人员备用金账户",
  temporary: "临时账户"
};

export const categoryTypes: CategoryType[] = ["income", "expense", "exchange", "loan", "loss", "adjustment"];

export const categoryTypeLabels: Record<CategoryType, string> = {
  income: "收入",
  expense: "费用",
  exchange: "换汇",
  loan: "借款",
  loss: "损失",
  adjustment: "调整"
};

export const categoryDirections: CategoryDirection[] = ["in", "out", "neutral"];

export const categoryDirectionLabels: Record<CategoryDirection, string> = {
  in: "流入",
  out: "流出",
  neutral: "中性"
};

export const activeStatusLabels: Record<"active" | "archived", string> = {
  active: "启用",
  archived: "归档"
};

export function normalizeCode(value: string) {
  return value.trim().toUpperCase();
}

export function parseRoles(rolesJson: string): PersonRole[] {
  try {
    const parsed = JSON.parse(rolesJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((role): role is PersonRole => personRoles.includes(role as PersonRole));
  } catch {
    return [];
  }
}

export function isProtectedFieldDisabled(row: ReferencedRow | null | undefined, field: string) {
  if (!row || row.referenceCount <= 0) return false;
  return [
    "projectId",
    "accountType",
    "currencyCode",
    "isCompanyAccount",
    "ownerPersonId",
    "categoryType",
    "direction",
    "affectsExpenseReport",
    "affectsProjectReport",
    "requiresMerchant",
    "requiresPerson",
    "requiresBorrower",
    "minorUnits"
  ].includes(field);
}

function nullableText(value: string | null | undefined) {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizedEmail(value: string) {
  return nullableText(value)?.toLowerCase() ?? null;
}

export function buildPersonPayload(form: PersonForm, _actor?: string): Record<string, unknown> {
  return {
    name: form.name.trim(),
    alias: nullableText(form.alias),
    roles: form.roles,
    loginEmail: normalizedEmail(form.loginEmail),
    isEnabled: form.isEnabled
  };
}

export function personFormWithPermittedIdentity(
  form: PersonForm,
  existing: { roles: PersonRole[]; loginEmail: string; isEnabled: boolean } | null,
  canManagePeopleRoles: boolean
): PersonForm {
  if (canManagePeopleRoles || !existing) return form;
  return { ...form, roles: existing.roles, loginEmail: existing.loginEmail, isEnabled: existing.isEnabled };
}

export function personFormWithPermittedRoles(
  form: PersonForm,
  existingRoles: PersonRole[] | null,
  canManagePeopleRoles: boolean
): PersonForm {
  return personFormWithPermittedIdentity(
    form,
    existingRoles ? { roles: existingRoles, loginEmail: form.loginEmail, isEnabled: form.isEnabled } : null,
    canManagePeopleRoles
  );
}

export function personLoginStatus(row: { is_enabled: number; login_email: string | null }) {
  if (!row.is_enabled) return { label: "已停用，不可登录", tone: "muted" as const };
  if (!row.login_email?.trim()) return { label: "未绑定邮箱，不可登录", tone: "warning" as const };
  return { label: "可登录", tone: "ok" as const };
}

export function buildProjectPayload(form: ProjectForm, _actor?: string): Record<string, unknown> {
  return {
    code: normalizeCode(form.code),
    name: form.name.trim(),
    ownerPersonId: nullableText(form.ownerPersonId),
    status: form.status,
    note: nullableText(form.note)
  };
}

export function buildMerchantPayload(form: MerchantForm, _actor?: string): Record<string, unknown> {
  return {
    code: normalizeCode(form.code),
    name: form.name.trim(),
    projectId: form.projectId.trim(),
    merchantType: nullableText(form.merchantType),
    launchDate: nullableText(form.launchDate),
    status: form.status,
    ownerPersonId: nullableText(form.ownerPersonId),
    note: nullableText(form.note)
  };
}

export function buildAccountPayload(form: AccountForm, _actor?: string): Record<string, unknown> {
  return {
    name: form.name.trim(),
    accountType: form.accountType,
    currencyCode: normalizeCode(form.currencyCode),
    ownerPersonId: nullableText(form.ownerPersonId),
    isCompanyAccount: form.isCompanyAccount,
    allowNegative: form.allowNegative,
    status: form.status
  };
}

export function buildCurrencyPayload(form: CurrencyForm, _actor?: string): Record<string, unknown> {
  return {
    code: normalizeCode(form.code),
    name: form.name.trim(),
    minorUnits: Number(form.minorUnits),
    isEnabled: form.isEnabled
  };
}

export function buildCategoryPayload(form: CategoryForm, _actor?: string): Record<string, unknown> {
  return {
    name: form.name.trim(),
    parentId: nullableText(form.parentId),
    categoryType: form.categoryType,
    direction: form.direction,
    affectsExpenseReport: form.affectsExpenseReport,
    affectsProjectReport: form.affectsProjectReport,
    requiresMerchant: form.requiresMerchant,
    requiresPerson: form.requiresPerson,
    requiresBorrower: form.requiresBorrower,
    isEnabled: form.isEnabled
  };
}
