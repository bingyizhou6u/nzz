import { all, first, newId, nowIso } from "./db";

export interface CurrencyRow {
  code: string;
  name: string;
  minor_units: number;
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

  getCurrency(code: string): Promise<CurrencyRow | null> {
    return first<CurrencyRow>(this.db.prepare("SELECT * FROM currencies WHERE code = ?").bind(code));
  }

  async createProject(input: ProjectInput): Promise<{ id: string; code: string; name: string }> {
    const id = newId("proj");
    await this.db
      .prepare(
        "INSERT INTO projects (id, code, name, owner_person_id, status, note, created_at) VALUES (?, ?, ?, ?, 'active', ?, ?)"
      )
      .bind(id, input.code, input.name, input.ownerPersonId ?? null, input.note ?? null, nowIso())
      .run();
    return { id, code: input.code, name: input.name };
  }
}
