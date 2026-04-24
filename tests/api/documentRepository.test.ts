import { describe, expect, it } from "vitest";
import { DocumentRepository } from "../../src/repositories/documentRepository";

function mockDb(options: { runResult?: D1Result; onSql?: (sql: string) => void; onBind?: (values: unknown[]) => void } = {}): D1Database {
  return {
    prepare: (sql: string) => {
      options.onSql?.(sql);
      return {
        bind(...values: unknown[]) {
          options.onBind?.(values);
          return this;
        },
        run: async () => options.runResult ?? ({ success: true } as D1Result)
      } as unknown as D1PreparedStatement;
    }
  } as unknown as D1Database;
}

describe("DocumentRepository", () => {
  it("creates draft documents", async () => {
    let boundValues: unknown[] = [];
    let sql = "";
    const repo = new DocumentRepository(mockDb({ onSql: (value) => (sql = value), onBind: (values) => (boundValues = values) }));

    const result = await repo.createDraft({
      documentType: "project_income",
      actionType: "normal",
      businessDate: "2026-04-24",
      period: "2026-04",
      operatorPersonId: "person_1",
      projectId: "proj_1",
      merchantId: null,
      categoryId: "cat_1",
      originalDocumentId: null,
      summary: "Initial income",
      createdBy: "user_1"
    });

    expect(result.id).toMatch(/^doc_/);
    expect(result.documentNo).toMatch(/^docno_/);
    expect(result.status).toBe("draft");
    expect(boundValues).toEqual([
      result.id,
      result.documentNo,
      "project_income",
      "normal",
      "2026-04-24",
      "2026-04",
      "person_1",
      "proj_1",
      null,
      "cat_1",
      "Initial income",
      null,
      "user_1",
      expect.any(String)
    ]);
    expect(sql.replace(/\s+/g, " ").toLowerCase()).toContain("original_document_id");
  });

  it("binds original document linkage for correction drafts", async () => {
    let boundValues: unknown[] = [];
    const repo = new DocumentRepository(mockDb({ onBind: (values) => (boundValues = values) }));

    await repo.createDraft({
      documentType: "project_income",
      actionType: "correction",
      businessDate: "2026-04-24",
      period: "2026-04",
      originalDocumentId: "doc_original",
      summary: "Correct income",
      createdBy: "user_1"
    });

    expect(boundValues[11]).toBe("doc_original");
  });

  it("throws when draft creation fails", async () => {
    const repo = new DocumentRepository(
      mockDb({ runResult: { success: false, error: "insert failed" } as unknown as D1Result })
    );

    await expect(
      repo.createDraft({
        documentType: "manual_adjustment",
        actionType: "normal",
        businessDate: "2026-04-24",
        period: "2026-04",
        summary: "Adjustment",
        createdBy: "user_1"
      })
    ).rejects.toThrow("insert failed");
  });

  it("creates unique document numbers", async () => {
    const repo = new DocumentRepository(mockDb());

    const first = await repo.createDraft({
      documentType: "manual_adjustment",
      actionType: "normal",
      businessDate: "2026-04-24",
      period: "2026-04",
      summary: "First",
      createdBy: "user_1"
    });
    const second = await repo.createDraft({
      documentType: "manual_adjustment",
      actionType: "normal",
      businessDate: "2026-04-24",
      period: "2026-04",
      summary: "Second",
      createdBy: "user_1"
    });

    expect(first.documentNo).not.toBe(second.documentNo);
  });
});
