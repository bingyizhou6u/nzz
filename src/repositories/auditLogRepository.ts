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

type JsonSnapshot = null | string | boolean | number | JsonSnapshot[] | { [key: string]: JsonSnapshot };

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

    const snapshot = this.toJsonSnapshot(value, new WeakSet<object>());

    let serialized: string | undefined;
    try {
      serialized = JSON.stringify(snapshot);
    } catch {
      throw new Error(SNAPSHOT_SERIALIZATION_ERROR);
    }

    if (serialized === undefined) {
      throw new Error(SNAPSHOT_SERIALIZATION_ERROR);
    }

    return serialized;
  }

  private toJsonSnapshot(value: unknown, path: WeakSet<object>): JsonSnapshot {
    if (value === null || typeof value === "string" || typeof value === "boolean") return value;

    if (typeof value === "number") {
      if (Number.isFinite(value)) return value;
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

    const prototype = this.getPrototypeOf(value);
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) {
      throw new Error(SNAPSHOT_SERIALIZATION_ERROR);
    }

    if (this.hasToJson(value) || this.getOwnPropertySymbols(value).length > 0) {
      throw new Error(SNAPSHOT_SERIALIZATION_ERROR);
    }

    path.add(value);
    let snapshot: JsonSnapshot;
    if (Array.isArray(value)) {
      const descriptors = this.getOwnPropertyDescriptors(value);
      const lengthDescriptor = descriptors.length;
      if (!lengthDescriptor || !("value" in lengthDescriptor) || typeof lengthDescriptor.value !== "number") {
        throw new Error(SNAPSHOT_SERIALIZATION_ERROR);
      }
      const arraySnapshot: JsonSnapshot[] = [];
      for (const [key, descriptor] of Object.entries(descriptors)) {
        if (key === "length") continue;
        if (!this.isArrayIndex(key) || !descriptor.enumerable || !("value" in descriptor)) {
          throw new Error(SNAPSHOT_SERIALIZATION_ERROR);
        }
      }
      for (let index = 0; index < lengthDescriptor.value; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !descriptor.enumerable || !("value" in descriptor)) {
          throw new Error(SNAPSHOT_SERIALIZATION_ERROR);
        }
        arraySnapshot[index] = this.toJsonSnapshot(descriptor.value, path);
      }
      snapshot = arraySnapshot;
    } else {
      const objectSnapshot: { [key: string]: JsonSnapshot } = {};
      for (const [key, descriptor] of Object.entries(this.getOwnPropertyDescriptors(value))) {
        if (!descriptor.enumerable || !("value" in descriptor)) {
          throw new Error(SNAPSHOT_SERIALIZATION_ERROR);
        }
        objectSnapshot[key] = this.toJsonSnapshot(descriptor.value, path);
      }
      snapshot = objectSnapshot;
    }
    path.delete(value);
    return snapshot;
  }

  private isArrayIndex(key: string): boolean {
    const index = Number(key);
    return Number.isInteger(index) && index >= 0 && index < 2 ** 32 - 1 && String(index) === key;
  }

  private getOwnPropertyDescriptors(value: object): PropertyDescriptorMap {
    try {
      return Object.getOwnPropertyDescriptors(value);
    } catch {
      throw new Error(SNAPSHOT_SERIALIZATION_ERROR);
    }
  }

  private getPrototypeOf(value: object): object | null {
    try {
      return Object.getPrototypeOf(value);
    } catch {
      throw new Error(SNAPSHOT_SERIALIZATION_ERROR);
    }
  }

  private hasToJson(value: object): boolean {
    try {
      return "toJSON" in value;
    } catch {
      throw new Error(SNAPSHOT_SERIALIZATION_ERROR);
    }
  }

  private getOwnPropertySymbols(value: object): symbol[] {
    try {
      return Object.getOwnPropertySymbols(value);
    } catch {
      throw new Error(SNAPSHOT_SERIALIZATION_ERROR);
    }
  }
}
