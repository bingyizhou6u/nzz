import { all, first, newId, nowIso, run } from "./db";

export interface CurrencyRow {
  code: string;
  name: string;
  minor_units: number;
  is_enabled: number;
}

export interface PersonOptionRow {
  id: string;
  name: string;
  alias: string | null;
  roles_json: string;
  is_enabled: number;
}

export interface ProjectOptionRow {
  id: string;
  code: string;
  name: string;
  owner_person_id: string | null;
  status: string;
}

export interface MerchantOptionRow {
  id: string;
  code: string;
  name: string;
  project_id: string;
  merchant_type: string | null;
  status: string;
}

export interface AccountOptionRow {
  id: string;
  name: string;
  account_type: string;
  currency_code: string;
  owner_person_id: string | null;
  is_company_account: number;
  allow_negative: number;
  status: string;
}

export interface CategoryOptionRow {
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

export interface ProjectInput {
  code: string;
  name: string;
  ownerPersonId?: string | null;
  note?: string | null;
}

export class MasterDataRepository {
  constructor(private readonly db: D1Database) {}

  listCurrencies(): Promise<CurrencyRow[]> {
    return all<CurrencyRow>(this.db.prepare("SELECT * FROM currencies ORDER BY code"));
  }

  listPeopleOptions(): Promise<PersonOptionRow[]> {
    return all<PersonOptionRow>(
      this.db.prepare(`
        SELECT id, name, alias, roles_json, is_enabled
        FROM people
        WHERE is_enabled = 1
        ORDER BY name, id
      `)
    );
  }

  listProjectOptions(): Promise<ProjectOptionRow[]> {
    return all<ProjectOptionRow>(
      this.db.prepare(`
        SELECT id, code, name, owner_person_id, status
        FROM projects
        WHERE status = 'active'
        ORDER BY code, name, id
      `)
    );
  }

  listMerchantOptions(): Promise<MerchantOptionRow[]> {
    return all<MerchantOptionRow>(
      this.db.prepare(`
        SELECT id, code, name, project_id, merchant_type, status
        FROM merchants
        WHERE status = 'active'
        ORDER BY project_id, code, name, id
      `)
    );
  }

  listAccountOptions(): Promise<AccountOptionRow[]> {
    return all<AccountOptionRow>(
      this.db.prepare(`
        SELECT
          id, name, account_type, currency_code, owner_person_id,
          is_company_account, allow_negative, status
        FROM accounts
        WHERE status = 'active'
        ORDER BY is_company_account DESC, account_type, name, id
      `)
    );
  }

  listCategoryOptions(): Promise<CategoryOptionRow[]> {
    return all<CategoryOptionRow>(
      this.db.prepare(`
        SELECT
          id, name, parent_id, category_type, direction,
          affects_expense_report, affects_project_report,
          requires_merchant, requires_person, requires_borrower, is_enabled
        FROM categories
        WHERE is_enabled = 1
        ORDER BY category_type, name, id
      `)
    );
  }

  listCurrencyOptions(): Promise<CurrencyRow[]> {
    return all<CurrencyRow>(
      this.db.prepare(`
        SELECT code, name, minor_units, is_enabled
        FROM currencies
        WHERE is_enabled = 1
        ORDER BY code
      `)
    );
  }

  getPeopleByIds(ids: string[]): Promise<PersonOptionRow[]> {
    const values = uniqueValues(ids);
    if (values.length === 0) return Promise.resolve([]);
    return all<PersonOptionRow>(
      this.db
        .prepare(`
        SELECT id, name, alias, roles_json, is_enabled
        FROM people
        WHERE id IN (${bindMarks(values)})
        ORDER BY name, id
      `)
        .bind(...values)
    );
  }

  getProjectsByIds(ids: string[]): Promise<ProjectOptionRow[]> {
    const values = uniqueValues(ids);
    if (values.length === 0) return Promise.resolve([]);
    return all<ProjectOptionRow>(
      this.db
        .prepare(`
        SELECT id, code, name, owner_person_id, status
        FROM projects
        WHERE id IN (${bindMarks(values)})
        ORDER BY code, name, id
      `)
        .bind(...values)
    );
  }

  getMerchantsByIds(ids: string[]): Promise<MerchantOptionRow[]> {
    const values = uniqueValues(ids);
    if (values.length === 0) return Promise.resolve([]);
    return all<MerchantOptionRow>(
      this.db
        .prepare(`
        SELECT id, code, name, project_id, merchant_type, status
        FROM merchants
        WHERE id IN (${bindMarks(values)})
        ORDER BY project_id, code, name, id
      `)
        .bind(...values)
    );
  }

  getAccountsByIds(ids: string[]): Promise<AccountOptionRow[]> {
    const values = uniqueValues(ids);
    if (values.length === 0) return Promise.resolve([]);
    return all<AccountOptionRow>(
      this.db
        .prepare(`
        SELECT
          id, name, account_type, currency_code, owner_person_id,
          is_company_account, allow_negative, status
        FROM accounts
        WHERE id IN (${bindMarks(values)})
        ORDER BY is_company_account DESC, account_type, name, id
      `)
        .bind(...values)
    );
  }

  getCategoriesByIds(ids: string[]): Promise<CategoryOptionRow[]> {
    const values = uniqueValues(ids);
    if (values.length === 0) return Promise.resolve([]);
    return all<CategoryOptionRow>(
      this.db
        .prepare(`
        SELECT
          id, name, parent_id, category_type, direction,
          affects_expense_report, affects_project_report,
          requires_merchant, requires_person, requires_borrower, is_enabled
        FROM categories
        WHERE id IN (${bindMarks(values)})
        ORDER BY category_type, name, id
      `)
        .bind(...values)
    );
  }

  getCurrenciesByCodes(codes: string[]): Promise<CurrencyRow[]> {
    const values = uniqueValues(codes).map((code) => code.toUpperCase());
    if (values.length === 0) return Promise.resolve([]);
    return all<CurrencyRow>(
      this.db
        .prepare(`
        SELECT code, name, minor_units, is_enabled
        FROM currencies
        WHERE code IN (${bindMarks(values)})
        ORDER BY code
      `)
        .bind(...values)
    );
  }

  getCurrency(code: string): Promise<CurrencyRow | null> {
    return first<CurrencyRow>(this.db.prepare("SELECT * FROM currencies WHERE code = ?").bind(code));
  }

  async createProject(input: ProjectInput): Promise<{ id: string; code: string; name: string }> {
    const id = newId("proj");
    await run(
      this.db
        .prepare(
          "INSERT INTO projects (id, code, name, owner_person_id, status, note, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?)"
        )
        .bind(id, input.code, input.name, input.ownerPersonId ?? null, input.note ?? null, nowIso())
    );
    return { id, code: input.code, name: input.name };
  }
}

function uniqueValues(values: string[]) {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function bindMarks(values: string[]) {
  return values.map(() => "?").join(", ");
}
