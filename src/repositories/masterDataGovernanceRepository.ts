import { all, first, newId, nowIso, run } from "./db";

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

export const PERSON_ROLES: PersonRole[] = [
  "admin",
  "finance_manager",
  "finance_entry",
  "logistics",
  "readonly",
  "borrower"
];
export const ACTIVE_STATUSES: ActiveStatus[] = ["active", "archived"];
export const ACCOUNT_TYPES: AccountType[] = [
  "usdt_wallet",
  "usd_account",
  "currency_reserve",
  "public_account",
  "petty_cash",
  "temporary"
];
export const CATEGORY_TYPES: CategoryType[] = ["income", "expense", "exchange", "loan", "loss", "adjustment"];
export const CATEGORY_DIRECTIONS: CategoryDirection[] = ["in", "out", "neutral"];

export interface ReferencedRow {
  referenceCount: number;
}

export interface GovernancePersonRow extends ReferencedRow {
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

export interface GovernanceProjectRow extends ReferencedRow {
  id: string;
  code: string;
  name: string;
  owner_person_id: string | null;
  status: ActiveStatus;
  note: string | null;
  created_at: string;
}

export interface GovernanceMerchantRow extends ReferencedRow {
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

export interface GovernanceAccountRow extends ReferencedRow {
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

export interface GovernanceCurrencyRow extends ReferencedRow {
  code: string;
  name: string;
  minor_units: number;
  is_enabled: number;
}

export interface GovernanceCategoryRow extends ReferencedRow {
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

export interface CreatePersonInput {
  name: string;
  alias: string | null;
  roles: PersonRole[];
  isEnabled: boolean;
  loginEmail: string | null;
}

export type UpdatePersonInput = CreatePersonInput;

export interface CreateProjectInput {
  code: string;
  name: string;
  ownerPersonId: string | null;
  status: ActiveStatus;
  note: string | null;
}

export type UpdateProjectInput = CreateProjectInput;

export interface CreateMerchantInput {
  code: string;
  name: string;
  projectId: string;
  merchantType: string | null;
  launchDate: string | null;
  status: ActiveStatus;
  ownerPersonId: string | null;
  note: string | null;
}

export type UpdateMerchantInput = CreateMerchantInput;

export interface MerchantProtectedFields {
  projectId: string;
}

export interface MerchantListFilters {
  projectId?: string | null;
}

export interface CreateAccountInput {
  name: string;
  accountType: AccountType;
  currencyCode: string;
  ownerPersonId: string | null;
  isCompanyAccount: boolean;
  allowNegative: boolean;
  status: ActiveStatus;
}

export type UpdateAccountInput = CreateAccountInput;

export interface AccountProtectedFields {
  accountType: AccountType;
  currencyCode: string;
  ownerPersonId: string | null;
  isCompanyAccount: boolean;
}

export interface CreateCurrencyInput {
  code: string;
  name: string;
  minorUnits: number;
  isEnabled: boolean;
}

export type UpdateCurrencyInput = CreateCurrencyInput;

export interface CurrencyProtectedFields {
  minorUnits: number;
}

export interface AccountListFilters {
  currencyCode?: string | null;
  accountType?: AccountType | string | null;
  ownerPersonId?: string | null;
}

export interface CreateCategoryInput {
  name: string;
  parentId: string | null;
  categoryType: CategoryType;
  direction: CategoryDirection;
  affectsExpenseReport: boolean;
  affectsProjectReport: boolean;
  requiresMerchant: boolean;
  requiresPerson: boolean;
  requiresBorrower: boolean;
  isEnabled: boolean;
}

export type UpdateCategoryInput = CreateCategoryInput;

export interface CategoryProtectedFields {
  categoryType: CategoryType;
  direction: CategoryDirection;
  affectsExpenseReport: boolean;
  affectsProjectReport: boolean;
}

export class MasterDataGovernanceRepository {
  constructor(private readonly db: D1Database) {}

  listPeople(): Promise<GovernancePersonRow[]> {
    return all<GovernancePersonRow>(
      this.db.prepare(`
        SELECT
          p.id, p.name, p.alias, p.roles_json, p.is_enabled,
          p.login_email, p.access_subject, p.last_login_at, p.created_at,
          ${this.personReferenceCountSql("p")} AS referenceCount
        FROM people p
        ORDER BY p.is_enabled DESC, p.name, p.id
      `)
    );
  }

  listProjects(): Promise<GovernanceProjectRow[]> {
    return all<GovernanceProjectRow>(
      this.db.prepare(`
        SELECT
          p.id, p.code, p.name, p.owner_person_id, p.status, p.note, p.created_at,
          (
            SELECT COUNT(*) FROM (
              SELECT project_id AS ref_id FROM documents WHERE project_id = p.id
              UNION ALL SELECT project_id FROM merchants WHERE project_id = p.id
            )
          ) AS referenceCount
        FROM projects p
        ORDER BY p.status = 'active' DESC, p.code, p.name, p.id
      `)
    );
  }

  listMerchants(filters: MerchantListFilters = {}): Promise<GovernanceMerchantRow[]> {
    const projectId = filters.projectId?.trim() || null;
    return all<GovernanceMerchantRow>(
      this.db.prepare(`
        SELECT
          m.id, m.code, m.name, m.project_id, m.merchant_type, m.launch_date,
          m.status, m.owner_person_id, m.note, m.created_at,
          (SELECT COUNT(*) FROM documents d WHERE d.merchant_id = m.id) AS referenceCount
        FROM merchants m
        WHERE (? IS NULL OR m.project_id = ?)
        ORDER BY m.status = 'active' DESC, m.project_id, m.code, m.name, m.id
      `).bind(projectId, projectId)
    );
  }

  listAccounts(filters: AccountListFilters = {}): Promise<GovernanceAccountRow[]> {
    const currencyCode = filters.currencyCode?.trim().toUpperCase() || null;
    const accountType = filters.accountType?.trim() || null;
    const ownerPersonId = filters.ownerPersonId?.trim() || null;
    return all<GovernanceAccountRow>(
      this.db.prepare(`
        SELECT
          a.id, a.name, a.account_type, a.currency_code, a.owner_person_id,
          a.is_company_account, a.allow_negative, a.status, a.created_at,
          ${this.accountReferenceCountSql("a")} AS referenceCount
        FROM accounts a
        WHERE
          (? IS NULL OR a.currency_code = ?)
          AND (? IS NULL OR a.account_type = ?)
          AND (? IS NULL OR a.owner_person_id = ?)
        ORDER BY a.status = 'active' DESC, a.is_company_account DESC, a.account_type, a.name, a.id
      `).bind(currencyCode, currencyCode, accountType, accountType, ownerPersonId, ownerPersonId)
    );
  }

  listCurrencies(): Promise<GovernanceCurrencyRow[]> {
    return all<GovernanceCurrencyRow>(
      this.db.prepare(`
        SELECT
          c.code, c.name, c.minor_units, c.is_enabled,
          ${this.currencyReferenceCountSql("c")} AS referenceCount
        FROM currencies c
        ORDER BY c.is_enabled DESC, c.code
      `)
    );
  }

  listCategories(): Promise<GovernanceCategoryRow[]> {
    return all<GovernanceCategoryRow>(
      this.db.prepare(`
        SELECT
          c.id, c.name, c.parent_id, c.category_type, c.direction,
          c.affects_expense_report, c.affects_project_report,
          c.requires_merchant, c.requires_person, c.requires_borrower, c.is_enabled,
          (
            SELECT COUNT(*) FROM (
              SELECT category_id AS ref_id FROM documents WHERE category_id = c.id
              UNION ALL SELECT parent_id FROM categories WHERE parent_id = c.id
            )
          ) AS referenceCount
        FROM categories c
        ORDER BY c.is_enabled DESC, c.category_type, c.name, c.id
      `)
    );
  }

  getPerson(id: string): Promise<GovernancePersonRow | null> {
    return first<GovernancePersonRow>(this.db.prepare(`${this.personSelectSql()} WHERE p.id = ?`).bind(id.trim()));
  }

  getProject(id: string): Promise<GovernanceProjectRow | null> {
    return first<GovernanceProjectRow>(this.db.prepare(`${this.projectSelectSql()} WHERE p.id = ?`).bind(id.trim()));
  }

  getMerchant(id: string): Promise<GovernanceMerchantRow | null> {
    return first<GovernanceMerchantRow>(this.db.prepare(`${this.merchantSelectSql()} WHERE m.id = ?`).bind(id.trim()));
  }

  getAccount(id: string): Promise<GovernanceAccountRow | null> {
    return first<GovernanceAccountRow>(this.db.prepare(`${this.accountSelectSql()} WHERE a.id = ?`).bind(id.trim()));
  }

  getCurrency(code: string): Promise<GovernanceCurrencyRow | null> {
    return first<GovernanceCurrencyRow>(this.db.prepare(`${this.currencySelectSql()} WHERE c.code = ?`).bind(code.trim().toUpperCase()));
  }

  getCategory(id: string): Promise<GovernanceCategoryRow | null> {
    return first<GovernanceCategoryRow>(this.db.prepare(`${this.categorySelectSql()} WHERE c.id = ?`).bind(id.trim()));
  }

  async getProjectStatus(id: string): Promise<{ status: ActiveStatus } | null> {
    return first<{ status: ActiveStatus }>(this.db.prepare("SELECT status FROM projects WHERE id = ?").bind(id.trim()));
  }

  async requireEnabledPerson(id: string, label: string): Promise<string> {
    const normalizedId = id.trim();
    const person = await first<{ id: string }>(
      this.db.prepare("SELECT id FROM people WHERE id = ? AND is_enabled = 1").bind(normalizedId)
    );
    if (!person) throw new Error(`${label} must reference an enabled person`);
    return normalizedId;
  }

  async requireEnabledCurrency(code: string): Promise<string> {
    const normalizedCode = code.trim().toUpperCase();
    const currency = await first<{ code: string }>(
      this.db.prepare("SELECT code FROM currencies WHERE code = ? AND is_enabled = 1").bind(normalizedCode)
    );
    if (!currency) throw new Error("currencyCode must reference an enabled currency");
    return normalizedCode;
  }

  async requireEnabledCategory(id: string): Promise<string> {
    const normalizedId = id.trim();
    const category = await first<{ id: string }>(
      this.db.prepare("SELECT id FROM categories WHERE id = ? AND is_enabled = 1").bind(normalizedId)
    );
    if (!category) throw new Error("parentId must reference an enabled category");
    return normalizedId;
  }

  async createPerson(input: CreatePersonInput): Promise<GovernancePersonRow> {
    const id = newId("person");
    const createdAt = nowIso();
    const rolesJson = JSON.stringify(input.roles);
    await run(
      this.db
        .prepare(
          `INSERT INTO people (id, name, alias, roles_json, is_enabled, created_at, login_email)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(id, input.name, input.alias, rolesJson, input.isEnabled ? 1 : 0, createdAt, input.loginEmail)
    );
    return {
      id,
      name: input.name,
      alias: input.alias,
      roles_json: rolesJson,
      is_enabled: input.isEnabled ? 1 : 0,
      login_email: input.loginEmail,
      access_subject: null,
      last_login_at: null,
      created_at: createdAt,
      referenceCount: 0
    };
  }

  async updatePerson(
    id: string,
    input: UpdatePersonInput,
    options: { requireOtherEnabledLoginAdmin?: boolean } = {}
  ): Promise<GovernancePersonRow> {
    const existing = await this.getPerson(id);
    const rolesJson = JSON.stringify(input.roles);
    const enabled = input.isEnabled ? 1 : 0;
    const result = options.requireOtherEnabledLoginAdmin
      ? await run(
          this.db
            .prepare(
              `UPDATE people
               SET name = ?, alias = ?, roles_json = ?, is_enabled = ?, login_email = ?
               WHERE id = ?
                 AND EXISTS (
                   SELECT 1
                   FROM people other_person
                   WHERE other_person.id != ?
                     AND other_person.is_enabled = 1
                     AND other_person.login_email IS NOT NULL
                     AND trim(other_person.login_email) != ''
                     AND EXISTS (
                       SELECT 1 FROM json_each(other_person.roles_json)
                       WHERE json_each.value = 'admin'
                     )
                 )`
            )
            .bind(input.name, input.alias, rolesJson, enabled, input.loginEmail, id, id)
        )
      : await run(
          this.db
            .prepare("UPDATE people SET name = ?, alias = ?, roles_json = ?, is_enabled = ?, login_email = ? WHERE id = ?")
            .bind(input.name, input.alias, rolesJson, enabled, input.loginEmail, id)
        );
    if (options.requireOtherEnabledLoginAdmin && result.meta?.changes === 0) {
      throw new Error("系统至少需要保留一个可登录管理员");
    }
    return {
      id,
      name: input.name,
      alias: input.alias,
      roles_json: rolesJson,
      is_enabled: enabled,
      login_email: input.loginEmail,
      access_subject: existing?.access_subject ?? null,
      last_login_at: existing?.last_login_at ?? null,
      created_at: existing?.created_at ?? nowIso(),
      referenceCount: existing?.referenceCount ?? 0
    };
  }

  async countOtherEnabledLoginAdmins(personId: string): Promise<number> {
    const row = await first<{ count: number }>(
      this.db
        .prepare(
          `SELECT COUNT(*) AS count
           FROM people
           WHERE id != ?
             AND is_enabled = 1
             AND login_email IS NOT NULL
             AND trim(login_email) != ''
             AND EXISTS (
               SELECT 1 FROM json_each(people.roles_json)
               WHERE json_each.value = 'admin'
             )`
        )
        .bind(personId)
    );
    return row?.count ?? 0;
  }

  async createProject(input: CreateProjectInput): Promise<GovernanceProjectRow> {
    const id = newId("proj");
    const createdAt = nowIso();
    await run(
      this.db
        .prepare("INSERT INTO projects (id, code, name, owner_person_id, status, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)")
        .bind(id, input.code, input.name, input.ownerPersonId, input.status, input.note, createdAt)
    );
    return this.projectRow(id, input, createdAt, 0);
  }

  async updateProject(id: string, input: UpdateProjectInput): Promise<GovernanceProjectRow> {
    const existing = await this.getProject(id);
    await run(
      this.db
        .prepare("UPDATE projects SET code = ?, name = ?, owner_person_id = ?, status = ?, note = ? WHERE id = ?")
        .bind(input.code, input.name, input.ownerPersonId, input.status, input.note, id)
    );
    return this.projectRow(id, input, existing?.created_at ?? nowIso(), existing?.referenceCount ?? 0);
  }

  async createMerchant(input: CreateMerchantInput): Promise<GovernanceMerchantRow> {
    const id = newId("merc");
    const createdAt = nowIso();
    await run(
      this.db
        .prepare(
          `INSERT INTO merchants (
            id, code, name, project_id, merchant_type, launch_date, status, owner_person_id, note, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          input.code,
          input.name,
          input.projectId,
          input.merchantType,
          input.launchDate,
          input.status,
          input.ownerPersonId,
          input.note,
          createdAt
        )
    );
    return this.merchantRow(id, input, createdAt, 0);
  }

  async updateMerchant(id: string, input: UpdateMerchantInput): Promise<GovernanceMerchantRow> {
    const existing = await this.getMerchant(id);
    await run(
      this.db
        .prepare(
          `UPDATE merchants
           SET code = ?, name = ?, project_id = ?, merchant_type = ?, launch_date = ?, status = ?, owner_person_id = ?, note = ?
           WHERE id = ?`
        )
        .bind(
          input.code,
          input.name,
          input.projectId,
          input.merchantType,
          input.launchDate,
          input.status,
          input.ownerPersonId,
          input.note,
          id
        )
    );
    return this.merchantRow(id, input, existing?.created_at ?? nowIso(), existing?.referenceCount ?? 0);
  }

  async createAccount(input: CreateAccountInput): Promise<GovernanceAccountRow> {
    const id = newId("acct");
    const createdAt = nowIso();
    await run(
      this.db
        .prepare(
          `INSERT INTO accounts (
            id, name, account_type, currency_code, owner_person_id, is_company_account, allow_negative, status, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          input.name,
          input.accountType,
          input.currencyCode,
          input.ownerPersonId,
          input.isCompanyAccount ? 1 : 0,
          input.allowNegative ? 1 : 0,
          input.status,
          createdAt
        )
    );
    return this.accountRow(id, input, createdAt, 0);
  }

  async updateAccount(id: string, input: UpdateAccountInput, existing?: GovernanceAccountRow): Promise<GovernanceAccountRow> {
    const current = existing ?? (await this.getAccount(id));
    await run(
      this.db
        .prepare(
          `UPDATE accounts
           SET name = ?, account_type = ?, currency_code = ?, owner_person_id = ?, is_company_account = ?, allow_negative = ?, status = ?
           WHERE id = ?`
        )
        .bind(
          input.name,
          input.accountType,
          input.currencyCode,
          input.ownerPersonId,
          input.isCompanyAccount ? 1 : 0,
          input.allowNegative ? 1 : 0,
          input.status,
          id
        )
    );
    return this.accountRow(id, input, current?.created_at ?? nowIso(), current?.referenceCount ?? 0);
  }

  async createCurrency(input: CreateCurrencyInput): Promise<GovernanceCurrencyRow> {
    await run(
      this.db
        .prepare("INSERT INTO currencies (code, name, minor_units, is_enabled) VALUES (?, ?, ?, ?)")
        .bind(input.code, input.name, input.minorUnits, input.isEnabled ? 1 : 0)
    );
    return this.currencyRow(input, 0);
  }

  async updateCurrency(code: string, input: UpdateCurrencyInput): Promise<GovernanceCurrencyRow> {
    const existing = await this.getCurrency(code);
    await run(
      this.db
        .prepare("UPDATE currencies SET name = ?, minor_units = ?, is_enabled = ? WHERE code = ?")
        .bind(input.name, input.minorUnits, input.isEnabled ? 1 : 0, code)
    );
    return this.currencyRow(input, existing?.referenceCount ?? 0);
  }

  async createCategory(input: CreateCategoryInput): Promise<GovernanceCategoryRow> {
    const id = newId("cat");
    await run(
      this.db
        .prepare(
          `INSERT INTO categories (
            id, name, parent_id, category_type, direction, affects_expense_report, affects_project_report,
            requires_merchant, requires_person, requires_borrower, is_enabled
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          id,
          input.name,
          input.parentId,
          input.categoryType,
          input.direction,
          input.affectsExpenseReport ? 1 : 0,
          input.affectsProjectReport ? 1 : 0,
          input.requiresMerchant ? 1 : 0,
          input.requiresPerson ? 1 : 0,
          input.requiresBorrower ? 1 : 0,
          input.isEnabled ? 1 : 0
        )
    );
    return this.categoryRow(id, input, 0);
  }

  async updateCategory(id: string, input: UpdateCategoryInput, existing?: GovernanceCategoryRow): Promise<GovernanceCategoryRow> {
    const current = existing ?? (await this.getCategory(id));
    await run(
      this.db
        .prepare(
          `UPDATE categories
           SET name = ?, parent_id = ?, category_type = ?, direction = ?, affects_expense_report = ?,
             affects_project_report = ?, requires_merchant = ?, requires_person = ?, requires_borrower = ?, is_enabled = ?
           WHERE id = ?`
        )
        .bind(
          input.name,
          input.parentId,
          input.categoryType,
          input.direction,
          input.affectsExpenseReport ? 1 : 0,
          input.affectsProjectReport ? 1 : 0,
          input.requiresMerchant ? 1 : 0,
          input.requiresPerson ? 1 : 0,
          input.requiresBorrower ? 1 : 0,
          input.isEnabled ? 1 : 0,
          id
        )
    );
    return this.categoryRow(id, input, current?.referenceCount ?? 0);
  }

  async assertAccountProtectedFieldsUnchanged(
    id: string,
    next: AccountProtectedFields
  ): Promise<GovernanceAccountRow> {
    const existing = await this.getAccount(id);
    if (!existing) throw new Error("account not found");
    if (existing.referenceCount > 0 && existing.currency_code !== next.currencyCode) {
      throw new Error("account currency cannot be changed after use");
    }
    if (existing.referenceCount > 0 && existing.account_type !== next.accountType) {
      throw new Error("account type cannot be changed after use");
    }
    if (existing.referenceCount > 0 && Boolean(existing.is_company_account) !== next.isCompanyAccount) {
      throw new Error("account company flag cannot be changed after use");
    }
    if (existing.referenceCount > 0 && (existing.owner_person_id ?? null) !== next.ownerPersonId) {
      throw new Error("account owner cannot be changed after use");
    }
    return existing;
  }

  async assertMerchantProtectedFieldsUnchanged(
    id: string,
    next: MerchantProtectedFields
  ): Promise<GovernanceMerchantRow> {
    const existing = await this.getMerchant(id);
    if (!existing) throw new Error("merchant not found");
    if (existing.referenceCount > 0 && existing.project_id !== next.projectId) {
      throw new Error("merchant project cannot be changed after use");
    }
    return existing;
  }

  async assertCurrencyProtectedFieldsUnchanged(
    code: string,
    next: CurrencyProtectedFields
  ): Promise<GovernanceCurrencyRow> {
    const existing = await this.getCurrency(code);
    if (!existing) throw new Error("currency not found");
    if (existing.referenceCount > 0 && existing.minor_units !== next.minorUnits) {
      throw new Error("currency minor units cannot be changed after use");
    }
    return existing;
  }

  async assertCategoryParentDoesNotCreateCycle(id: string, parentId: string | null): Promise<void> {
    if (!parentId) return;
    const cycle = await first<{ id: string }>(
      this.db
        .prepare(
          `WITH RECURSIVE ancestors(id, parent_id) AS (
            SELECT id, parent_id FROM categories WHERE id = ?
            UNION ALL
            SELECT c.id, c.parent_id
            FROM categories c
            JOIN ancestors a ON c.id = a.parent_id
          )
          SELECT id FROM ancestors WHERE id = ? LIMIT 1`
        )
        .bind(parentId.trim(), id.trim())
    );
    if (cycle) throw new Error("parentId cannot create category cycle");
  }

  async assertCategoryProtectedFieldsUnchanged(
    id: string,
    next: CategoryProtectedFields
  ): Promise<GovernanceCategoryRow> {
    const existing = await this.getCategory(id);
    if (!existing) throw new Error("category not found");
    if (existing.referenceCount > 0 && existing.category_type !== next.categoryType) {
      throw new Error("category type cannot be changed after use");
    }
    if (existing.referenceCount > 0 && existing.direction !== next.direction) {
      throw new Error("category direction cannot be changed after use");
    }
    if (existing.referenceCount > 0 && Number(existing.affects_expense_report) !== Number(next.affectsExpenseReport)) {
      throw new Error("category expense report flag cannot be changed after use");
    }
    if (existing.referenceCount > 0 && Number(existing.affects_project_report) !== Number(next.affectsProjectReport)) {
      throw new Error("category project report flag cannot be changed after use");
    }
    return existing;
  }

  private personSelectSql() {
    return `
      SELECT
        p.id, p.name, p.alias, p.roles_json, p.is_enabled,
        p.login_email, p.access_subject, p.last_login_at, p.created_at,
        ${this.personReferenceCountSql("p")} AS referenceCount
      FROM people p
    `;
  }

  private projectSelectSql() {
    return `
      SELECT
        p.id, p.code, p.name, p.owner_person_id, p.status, p.note, p.created_at,
        (
          SELECT COUNT(*) FROM (
            SELECT project_id AS ref_id FROM documents WHERE project_id = p.id
            UNION ALL SELECT project_id FROM merchants WHERE project_id = p.id
          )
        ) AS referenceCount
      FROM projects p
    `;
  }

  private merchantSelectSql() {
    return `
      SELECT
        m.id, m.code, m.name, m.project_id, m.merchant_type, m.launch_date,
        m.status, m.owner_person_id, m.note, m.created_at,
        (SELECT COUNT(*) FROM documents d WHERE d.merchant_id = m.id) AS referenceCount
      FROM merchants m
    `;
  }

  private accountSelectSql() {
    return `
      SELECT
        a.id, a.name, a.account_type, a.currency_code, a.owner_person_id,
        a.is_company_account, a.allow_negative, a.status, a.created_at,
        ${this.accountReferenceCountSql("a")} AS referenceCount
      FROM accounts a
    `;
  }

  private currencySelectSql() {
    return `
      SELECT
        c.code, c.name, c.minor_units, c.is_enabled,
        ${this.currencyReferenceCountSql("c")} AS referenceCount
      FROM currencies c
    `;
  }

  private personReferenceCountSql(alias: string) {
    return `(
      (SELECT COUNT(*) FROM documents WHERE operator_person_id = ${alias}.id)
      + (SELECT COUNT(*) FROM document_lines WHERE person_id = ${alias}.id)
      + (SELECT COUNT(*) FROM document_lines WHERE borrower_person_id = ${alias}.id)
      + (SELECT COUNT(*) FROM projects WHERE owner_person_id = ${alias}.id)
      + (SELECT COUNT(*) FROM merchants WHERE owner_person_id = ${alias}.id)
      + (SELECT COUNT(*) FROM accounts WHERE owner_person_id = ${alias}.id)
      + (SELECT COUNT(*) FROM lots WHERE current_person_id = ${alias}.id)
      + (SELECT COUNT(*) FROM lot_movements WHERE from_person_id = ${alias}.id)
      + (SELECT COUNT(*) FROM lot_movements WHERE to_person_id = ${alias}.id)
      + (SELECT COUNT(*) FROM pending_cost_matches WHERE person_id = ${alias}.id)
      + (SELECT COUNT(*) FROM loan_entries WHERE borrower_person_id = ${alias}.id)
    )`;
  }

  private accountReferenceCountSql(alias: string) {
    return `(
      (SELECT COUNT(*) FROM document_lines WHERE account_id = ${alias}.id)
      + (SELECT COUNT(*) FROM document_lines WHERE counterparty_account_id = ${alias}.id)
      + (SELECT COUNT(*) FROM account_entries WHERE account_id = ${alias}.id)
      + (SELECT COUNT(*) FROM lots WHERE current_account_id = ${alias}.id)
      + (SELECT COUNT(*) FROM lot_movements WHERE from_account_id = ${alias}.id)
      + (SELECT COUNT(*) FROM lot_movements WHERE to_account_id = ${alias}.id)
      + (SELECT COUNT(*) FROM pending_cost_matches WHERE account_id = ${alias}.id)
    )`;
  }

  private currencyReferenceCountSql(alias: string) {
    return `(
      (SELECT COUNT(*) FROM accounts WHERE currency_code = ${alias}.code)
      + (SELECT COUNT(*) FROM document_lines WHERE currency_code = ${alias}.code)
      + (SELECT COUNT(*) FROM account_entries WHERE currency_code = ${alias}.code)
      + (SELECT COUNT(*) FROM loan_entries WHERE currency_code = ${alias}.code)
      + (SELECT COUNT(*) FROM lots WHERE currency_code = ${alias}.code)
      + (SELECT COUNT(*) FROM pending_cost_matches WHERE currency_code = ${alias}.code)
    )`;
  }

  private categorySelectSql() {
    return `
      SELECT
        c.id, c.name, c.parent_id, c.category_type, c.direction,
        c.affects_expense_report, c.affects_project_report,
        c.requires_merchant, c.requires_person, c.requires_borrower, c.is_enabled,
        (
          SELECT COUNT(*) FROM (
            SELECT category_id AS ref_id FROM documents WHERE category_id = c.id
            UNION ALL SELECT parent_id FROM categories WHERE parent_id = c.id
          )
        ) AS referenceCount
      FROM categories c
    `;
  }

  private projectRow(id: string, input: CreateProjectInput, createdAt: string, referenceCount: number): GovernanceProjectRow {
    return {
      id,
      code: input.code,
      name: input.name,
      owner_person_id: input.ownerPersonId,
      status: input.status,
      note: input.note,
      created_at: createdAt,
      referenceCount
    };
  }

  private merchantRow(id: string, input: CreateMerchantInput, createdAt: string, referenceCount: number): GovernanceMerchantRow {
    return {
      id,
      code: input.code,
      name: input.name,
      project_id: input.projectId,
      merchant_type: input.merchantType,
      launch_date: input.launchDate,
      status: input.status,
      owner_person_id: input.ownerPersonId,
      note: input.note,
      created_at: createdAt,
      referenceCount
    };
  }

  private accountRow(id: string, input: CreateAccountInput, createdAt: string, referenceCount: number): GovernanceAccountRow {
    return {
      id,
      name: input.name,
      account_type: input.accountType,
      currency_code: input.currencyCode,
      owner_person_id: input.ownerPersonId,
      is_company_account: input.isCompanyAccount ? 1 : 0,
      allow_negative: input.allowNegative ? 1 : 0,
      status: input.status,
      created_at: createdAt,
      referenceCount
    };
  }

  private currencyRow(input: CreateCurrencyInput, referenceCount: number): GovernanceCurrencyRow {
    return {
      code: input.code,
      name: input.name,
      minor_units: input.minorUnits,
      is_enabled: input.isEnabled ? 1 : 0,
      referenceCount
    };
  }

  private categoryRow(id: string, input: CreateCategoryInput, referenceCount: number): GovernanceCategoryRow {
    return {
      id,
      name: input.name,
      parent_id: input.parentId,
      category_type: input.categoryType,
      direction: input.direction,
      affects_expense_report: input.affectsExpenseReport ? 1 : 0,
      affects_project_report: input.affectsProjectReport ? 1 : 0,
      requires_merchant: input.requiresMerchant ? 1 : 0,
      requires_person: input.requiresPerson ? 1 : 0,
      requires_borrower: input.requiresBorrower ? 1 : 0,
      is_enabled: input.isEnabled ? 1 : 0,
      referenceCount
    };
  }
}
