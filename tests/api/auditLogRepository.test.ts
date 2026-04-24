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
});
