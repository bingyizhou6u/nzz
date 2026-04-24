import { newId, nowIso, run } from "./db";

export interface AuditLogInput {
  actor: string;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  reason?: string | null;
}

export class AuditLogRepository {
  constructor(private readonly db: D1Database) {}

  async record(input: AuditLogInput) {
    await run(
      this.db
        .prepare(
          `INSERT INTO audit_logs (
            id, actor, action, entity_type, entity_id, before_json, after_json, reason, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .bind(
          newId("audit"),
          input.actor,
          input.action,
          input.entityType,
          input.entityId,
          this.serializeSnapshot(input.before),
          this.serializeSnapshot(input.after),
          input.reason ?? null,
          nowIso()
        )
    );
  }

  private serializeSnapshot(value: unknown): string | null {
    if (value === undefined) return null;

    let serialized: string | undefined;
    try {
      serialized = JSON.stringify(value);
    } catch {
      throw new Error("Audit snapshot must be JSON-serializable");
    }

    if (serialized === undefined) {
      throw new Error("Audit snapshot must be JSON-serializable");
    }

    return serialized;
  }
}
