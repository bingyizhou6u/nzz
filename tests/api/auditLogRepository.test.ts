import { describe, expect, it } from "vitest";
import { AuditLogRepository } from "../../src/repositories/auditLogRepository";

function mockDb(options: { onBind?: (values: unknown[]) => void; onSql?: (sql: string) => void } = {}): D1Database {
  return {
    prepare: (sql: string) => {
      options.onSql?.(sql);
      return {
        bind(...values: unknown[]) {
          options.onBind?.(values);
          return this;
        },
        run: async () => ({ success: true } as D1Result)
      } as unknown as D1PreparedStatement;
    }
  } as unknown as D1Database;
}

describe("AuditLogRepository", () => {
  it("inserts JSON snapshots for auditable actions", async () => {
    let sql = "";
    let boundValues: unknown[] = [];
    const repo = new AuditLogRepository(mockDb({ onSql: (value) => (sql = value), onBind: (values) => (boundValues = values) }));

    await repo.record({
      actor: "user_1",
      action: "document.submit",
      entityType: "document",
      entityId: "doc_1",
      before: { status: "draft" },
      after: { status: "pending" },
      reason: "ready"
    });

    expect(sql.toLowerCase()).toContain("insert into audit_logs");
    expect(boundValues).toEqual([
      expect.stringMatching(/^audit_/),
      "user_1",
      "document.submit",
      "document",
      "doc_1",
      JSON.stringify({ status: "draft" }),
      JSON.stringify({ status: "pending" }),
      "ready",
      expect.any(String)
    ]);
  });

  it("binds omitted snapshots and omitted reason as null", async () => {
    let boundValues: unknown[] = [];
    const repo = new AuditLogRepository(mockDb({ onBind: (values) => (boundValues = values) }));

    await repo.record({
      actor: "user_1",
      action: "document.submit",
      entityType: "document",
      entityId: "doc_1"
    });

    expect(boundValues[5]).toBeNull();
    expect(boundValues[6]).toBeNull();
    expect(boundValues[7]).toBeNull();
  });

  it("binds null reason as null", async () => {
    let boundValues: unknown[] = [];
    const repo = new AuditLogRepository(mockDb({ onBind: (values) => (boundValues = values) }));

    await repo.record({
      actor: "user_1",
      action: "document.submit",
      entityType: "document",
      entityId: "doc_1",
      reason: null
    });

    expect(boundValues[7]).toBeNull();
  });

  it("accepts JSON-native snapshot values", async () => {
    const duplicate = { shared: true };
    let boundValues: unknown[] = [];
    const repo = new AuditLogRepository(mockDb({ onBind: (values) => (boundValues = values) }));

    await repo.record({
      actor: "user_1",
      action: "document.submit",
      entityType: "document",
      entityId: "doc_1",
      before: {
        nullValue: null,
        stringValue: "ready",
        booleanValue: true,
        numberValue: 42,
        arrayValue: [null, "ready", false, 7],
        nestedValue: { status: "draft", amount: 10 },
        firstDuplicate: duplicate,
        secondDuplicate: duplicate
      }
    });

    expect(boundValues[5]).toBe(
      JSON.stringify({
        nullValue: null,
        stringValue: "ready",
        booleanValue: true,
        numberValue: 42,
        arrayValue: [null, "ready", false, 7],
        nestedValue: { status: "draft", amount: 10 },
        firstDuplicate: duplicate,
        secondDuplicate: duplicate
      })
    );
  });

  it("rejects snapshots that stringify to undefined", async () => {
    const repo = new AuditLogRepository(mockDb());

    await expect(
      repo.record({
        actor: "user_1",
        action: "document.submit",
        entityType: "document",
        entityId: "doc_1",
        before: () => undefined
      })
    ).rejects.toThrow("Audit snapshot must be JSON-serializable");
  });

  it("rejects snapshots that JSON.stringify cannot serialize", async () => {
    const repo = new AuditLogRepository(mockDb());

    await expect(
      repo.record({
        actor: "user_1",
        action: "document.submit",
        entityType: "document",
        entityId: "doc_1",
        after: BigInt(1)
      })
    ).rejects.toThrow("Audit snapshot must be JSON-serializable");
  });

  it("rejects nested functions in snapshots", async () => {
    const repo = new AuditLogRepository(mockDb());

    await expect(
      repo.record({
        actor: "user_1",
        action: "document.submit",
        entityType: "document",
        entityId: "doc_1",
        before: { value: () => undefined }
      })
    ).rejects.toThrow("Audit snapshot must be JSON-serializable");
  });

  it("rejects nested undefined values in snapshots", async () => {
    const repo = new AuditLogRepository(mockDb());

    await expect(
      repo.record({
        actor: "user_1",
        action: "document.submit",
        entityType: "document",
        entityId: "doc_1",
        before: { value: undefined }
      })
    ).rejects.toThrow("Audit snapshot must be JSON-serializable");
  });

  it("rejects unsupported array entries in snapshots", async () => {
    const repo = new AuditLogRepository(mockDb());

    await expect(
      repo.record({
        actor: "user_1",
        action: "document.submit",
        entityType: "document",
        entityId: "doc_1",
        before: [() => undefined]
      })
    ).rejects.toThrow("Audit snapshot must be JSON-serializable");
  });

  it("rejects cyclic snapshot references", async () => {
    const repo = new AuditLogRepository(mockDb());
    const snapshot: { self?: unknown } = {};
    snapshot.self = snapshot;

    await expect(
      repo.record({
        actor: "user_1",
        action: "document.submit",
        entityType: "document",
        entityId: "doc_1",
        before: snapshot
      })
    ).rejects.toThrow("Audit snapshot must be JSON-serializable");
  });

  it("rejects non-finite numbers in snapshots", async () => {
    const repo = new AuditLogRepository(mockDb());

    await expect(
      repo.record({
        actor: "user_1",
        action: "document.submit",
        entityType: "document",
        entityId: "doc_1",
        before: { nan: Number.NaN, infinity: Number.POSITIVE_INFINITY, negativeInfinity: Number.NEGATIVE_INFINITY }
      })
    ).rejects.toThrow("Audit snapshot must be JSON-serializable");
  });

  it("rejects Date snapshots", async () => {
    const repo = new AuditLogRepository(mockDb());

    await expect(
      repo.record({
        actor: "user_1",
        action: "document.submit",
        entityType: "document",
        entityId: "doc_1",
        before: new Date("2026-04-24T00:00:00.000Z")
      })
    ).rejects.toThrow("Audit snapshot must be JSON-serializable");
  });

  it("rejects Map and Set snapshots", async () => {
    const repo = new AuditLogRepository(mockDb());

    await expect(
      repo.record({
        actor: "user_1",
        action: "document.submit",
        entityType: "document",
        entityId: "doc_1",
        before: new Map([["status", "draft"]])
      })
    ).rejects.toThrow("Audit snapshot must be JSON-serializable");

    await expect(
      repo.record({
        actor: "user_1",
        action: "document.submit",
        entityType: "document",
        entityId: "doc_1",
        before: new Set(["draft"])
      })
    ).rejects.toThrow("Audit snapshot must be JSON-serializable");
  });

  it("rejects symbol-keyed snapshot properties", async () => {
    const repo = new AuditLogRepository(mockDb());

    await expect(
      repo.record({
        actor: "user_1",
        action: "document.submit",
        entityType: "document",
        entityId: "doc_1",
        before: { [Symbol("hidden")]: "draft" }
      })
    ).rejects.toThrow("Audit snapshot must be JSON-serializable");
  });

  it("rejects custom toJSON in snapshots", async () => {
    const repo = new AuditLogRepository(mockDb());

    await expect(
      repo.record({
        actor: "user_1",
        action: "document.submit",
        entityType: "document",
        entityId: "doc_1",
        before: { status: "draft", toJSON: () => ({ status: "changed" }) }
      })
    ).rejects.toThrow("Audit snapshot must be JSON-serializable");
  });
});
