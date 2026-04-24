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

const SNAPSHOT_SERIALIZATION_ERROR = "Audit snapshot must be JSON-serializable";

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

    this.validateSnapshot(value, new WeakSet<object>());

    let serialized: string | undefined;
    try {
      serialized = JSON.stringify(value);
    } catch {
      throw new Error(SNAPSHOT_SERIALIZATION_ERROR);
    }

    if (serialized === undefined) {
      throw new Error(SNAPSHOT_SERIALIZATION_ERROR);
    }

    return serialized;
  }

  private validateSnapshot(value: unknown, seen: WeakSet<object>) {
    if (value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
      throw new Error(SNAPSHOT_SERIALIZATION_ERROR);
    }

    if (value === null || typeof value !== "object") return;

    if (seen.has(value)) {
      throw new Error(SNAPSHOT_SERIALIZATION_ERROR);
    }
    seen.add(value);

    if (Array.isArray(value)) {
      for (const item of value) {
        this.validateSnapshot(item, seen);
      }
    } else {
      for (const item of Object.values(value)) {
        this.validateSnapshot(item, seen);
      }
    }

    seen.delete(value);
  }
}
