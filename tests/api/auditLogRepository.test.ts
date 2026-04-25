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
  it("prepares conditional audit inserts with audit bindings before condition bindings", () => {
    let sql = "";
    let boundValues: unknown[] = [];
    const repo = new AuditLogRepository(mockDb({ onSql: (value) => (sql = value), onBind: (values) => (boundValues = values) }));

    const statement = repo.prepareRecordWhen(
      {
        actor: "reviewer_1",
        action: "document.approve",
        entityType: "document",
        entityId: "doc_1",
        before: { status: "pending" },
        after: { status: "approved" }
      },
      { sql: "EXISTS (SELECT 1 FROM documents WHERE id = ? AND status = 'pending')", bindings: ["doc_1"] }
    );

    expect(statement).toBeDefined();
    expect(sql.replace(/\s+/g, " ").toLowerCase()).toContain("insert into audit_logs");
    expect(sql.replace(/\s+/g, " ").toLowerCase()).toContain(
      "select ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?"
    );
    expect(sql.replace(/\s+/g, " ")).toContain("WHERE EXISTS (SELECT 1 FROM documents WHERE id = ? AND status = 'pending')");
    expect(boundValues).toEqual([
      expect.stringMatching(/^audit_/),
      "reviewer_1",
      "document.approve",
      "document",
      "doc_1",
      JSON.stringify({ status: "pending" }),
      JSON.stringify({ status: "approved" }),
      null,
      null,
      null,
      null,
      null,
      null,
      expect.any(String),
      "doc_1"
    ]);
  });

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
      null,
      null,
      null,
      null,
      null,
      expect.any(String)
    ]);
  });

  it("binds audit metadata when provided", async () => {
    let boundValues: unknown[] = [];
    const repo = new AuditLogRepository(mockDb({ onBind: (values) => (boundValues = values) }));

    await repo.record({
      actor: "user_1",
      action: "document.submit",
      entityType: "document",
      entityId: "doc_1",
      actorPersonId: "user_1",
      actorEmail: "user@example.com",
      requestId: "req_1",
      ipAddress: "203.0.113.10",
      userAgent: "Vitest"
    });

    expect(boundValues.slice(8, 13)).toEqual([
      "user_1",
      "user@example.com",
      "req_1",
      "203.0.113.10",
      "Vitest"
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

  it("serializes normal JSON arrays", async () => {
    let boundValues: unknown[] = [];
    const repo = new AuditLogRepository(mockDb({ onBind: (values) => (boundValues = values) }));

    await repo.record({
      actor: "user_1",
      action: "document.submit",
      entityType: "document",
      entityId: "doc_1",
      before: ["a", 1, null]
    });

    expect(boundValues[5]).toBe(JSON.stringify(["a", 1, null]));
  });

  it("serializes sanitized arrays without inherited toJSON", async () => {
    let boundValues: unknown[] = [];
    const repo = new AuditLogRepository(mockDb({ onBind: (values) => (boundValues = values) }));
    const originalDescriptor = Object.getOwnPropertyDescriptor(Array.prototype, "toJSON");

    try {
      Object.defineProperty(Array.prototype, "toJSON", {
        configurable: true,
        value: () => ["replaced"]
      });

      await repo.record({
        actor: "user_1",
        action: "document.submit",
        entityType: "document",
        entityId: "doc_1",
        before: ["original"]
      });
    } finally {
      if (originalDescriptor) {
        Object.defineProperty(Array.prototype, "toJSON", originalDescriptor);
      } else {
        delete (Array.prototype as { toJSON?: unknown }).toJSON;
      }
    }

    expect(boundValues[5]).toBe(`["original"]`);
  });

  it("serializes sanitized proxy descriptor values", async () => {
    let boundValues: unknown[] = [];
    const target = { value: "validated" };
    const snapshot = new Proxy(target, {
      get(targetValue, property, receiver) {
        if (property === "value") return "serialized";
        return Reflect.get(targetValue, property, receiver);
      }
    });
    const repo = new AuditLogRepository(mockDb({ onBind: (values) => (boundValues = values) }));

    await repo.record({
      actor: "user_1",
      action: "document.submit",
      entityType: "document",
      entityId: "doc_1",
      before: snapshot
    });

    expect(boundValues[5]).toBe(JSON.stringify({ value: "validated" }));
  });

  it("preserves special object keys as data fields", async () => {
    let boundValues: unknown[] = [];
    const snapshot = JSON.parse(`{"__proto__":"kept","constructor":"ctor","prototype":"proto"}`);
    const repo = new AuditLogRepository(mockDb({ onBind: (values) => (boundValues = values) }));

    await repo.record({
      actor: "user_1",
      action: "document.submit",
      entityType: "document",
      entityId: "doc_1",
      before: snapshot
    });

    const parsed = JSON.parse(boundValues[5] as string);
    expect(parsed.__proto__).toBe("kept");
    expect(parsed.constructor).toBe("ctor");
    expect(parsed.prototype).toBe("proto");
    expect(boundValues[5]).toContain(`"__proto__":"kept"`);
  });

  it("accepts non-callable toJSON data fields", async () => {
    let boundValues: unknown[] = [];
    const repo = new AuditLogRepository(mockDb({ onBind: (values) => (boundValues = values) }));

    await repo.record({
      actor: "user_1",
      action: "document.submit",
      entityType: "document",
      entityId: "doc_1",
      before: { toJSON: "literal" }
    });

    expect(boundValues[5]).toBe(JSON.stringify({ toJSON: "literal" }));
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

  it("rejects array accessor elements", async () => {
    const repo = new AuditLogRepository(mockDb());
    const snapshot = ["validated"];
    let current = "validated";
    Object.defineProperty(snapshot, "0", {
      enumerable: true,
      get() {
        const value = current;
        current = "serialized";
        return value;
      }
    });

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

  it("rejects arrays with unexpected own properties", async () => {
    const repo = new AuditLogRepository(mockDb());
    const snapshot = ["a", 1, null] as unknown[] & { custom?: string };
    snapshot.custom = "hidden";

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

  it("rejects sparse arrays", async () => {
    const repo = new AuditLogRepository(mockDb());
    const snapshot = new Array(1);

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

  it("rejects arrays with inherited numeric values", async () => {
    const repo = new AuditLogRepository(mockDb());
    const prototype = { 0: "inherited" };
    const snapshot = Object.create(prototype) as unknown[];
    Object.defineProperty(snapshot, "length", { value: 1 });

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
