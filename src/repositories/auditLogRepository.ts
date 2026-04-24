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

  private validateSnapshot(value: unknown, path: WeakSet<object>) {
    if (value === null || typeof value === "string" || typeof value === "boolean") return;

    if (typeof value === "number") {
      if (Number.isFinite(value)) return;
      throw new Error(SNAPSHOT_SERIALIZATION_ERROR);
    }

    if (value === undefined || typeof value === "function" || typeof value === "symbol" || typeof value === "bigint") {
      throw new Error(SNAPSHOT_SERIALIZATION_ERROR);
    }

    if (typeof value !== "object") {
      throw new Error(SNAPSHOT_SERIALIZATION_ERROR);
    }

    if (path.has(value)) {
      throw new Error(SNAPSHOT_SERIALIZATION_ERROR);
    }

    const prototype = Object.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
      throw new Error(SNAPSHOT_SERIALIZATION_ERROR);
    }

    if (typeof (value as { toJSON?: unknown }).toJSON !== "undefined" || Object.getOwnPropertySymbols(value).length > 0) {
      throw new Error(SNAPSHOT_SERIALIZATION_ERROR);
    }

    path.add(value);
    if (Array.isArray(value)) {
      for (const key of Object.getOwnPropertyNames(value)) {
        if (key !== "length" && !this.isArrayIndex(key)) {
          throw new Error(SNAPSHOT_SERIALIZATION_ERROR);
        }
      }
      for (const item of value) {
        this.validateSnapshot(item, path);
      }
    } else {
      for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
        if (!descriptor.enumerable || !("value" in descriptor)) {
          throw new Error(SNAPSHOT_SERIALIZATION_ERROR);
        }
        this.validateSnapshot(descriptor.value, path);
      }
    }
    path.delete(value);
  }

  private isArrayIndex(key: string): boolean {
    const index = Number(key);
    return Number.isInteger(index) && index >= 0 && index < 2 ** 32 - 1 && String(index) === key;
  }
}
