import { first, run } from "../repositories/db";
import { AuthError, type AuthenticatedActor, type PersonRole } from "./types";

interface ActorRow {
  id: string;
  name: string;
  alias: string | null;
  login_email: string;
  roles_json: string;
  is_enabled: number;
}

const knownRoles = new Set<PersonRole>(["admin", "finance_manager", "finance_entry", "logistics", "readonly", "borrower"]);

export class ActorRepository {
  constructor(private readonly db: D1Database) {}

  async requireActorByEmail(email: string): Promise<AuthenticatedActor> {
    const normalizedEmail = email.trim().toLowerCase();
    const row = await first<ActorRow>(
      this.db
        .prepare(
          `SELECT id, name, alias, login_email, roles_json, is_enabled
           FROM people
           WHERE lower(login_email) = ? AND is_enabled = 1`
        )
        .bind(normalizedEmail)
    );
    if (!row) throw new AuthError(403, "当前登录邮箱未绑定启用人员，请联系管理员");
    await run(this.db.prepare("UPDATE people SET last_login_at = ? WHERE id = ?").bind(new Date().toISOString(), row.id));
    return {
      personId: row.id,
      name: row.name,
      alias: row.alias,
      email: row.login_email.trim().toLowerCase(),
      roles: parseRoles(row.roles_json)
    };
  }
}

function parseRoles(rolesJson: string): PersonRole[] {
  try {
    const parsed = JSON.parse(rolesJson);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((role): role is PersonRole => typeof role === "string" && knownRoles.has(role as PersonRole));
  } catch {
    return [];
  }
}
