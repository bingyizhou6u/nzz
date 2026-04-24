import { describe, expect, it } from "vitest";
import { DocumentRepository } from "../../src/repositories/documentRepository";

type CapturedStatement = D1PreparedStatement & {
  sql: string;
  bindings: unknown[];
};

function mockDb(
  options: {
    runResult?: D1Result;
    batchResults?: D1Result[];
    firstResult?: unknown;
    allResults?: unknown[];
    onSql?: (sql: string) => void;
    onBind?: (values: unknown[]) => void;
    onBatch?: (statements: CapturedStatement[]) => void;
  } = {}
): D1Database {
  return {
    prepare: (sql: string) => {
      options.onSql?.(sql);
      const statement = {
        sql,
        bindings: [],
        bind(this: CapturedStatement, ...values: unknown[]) {
          this.bindings = values;
          options.onBind?.(values);
          return this;
        },
        run: async () => options.runResult ?? ({ success: true } as D1Result),
        first: async () => options.firstResult ?? null,
        all: async () => ({ success: true, results: options.allResults ?? [] })
      } as unknown as CapturedStatement;
      return statement;
    },
    batch: async (statements: D1PreparedStatement[]) => {
      options.onBatch?.(statements as CapturedStatement[]);
      return options.batchResults ?? statements.map(() => ({ success: true }) as D1Result);
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

  it("creates draft documents with lines", async () => {
    const sqlStatements: string[] = [];
    const bindCalls: unknown[][] = [];
    const batchCalls: CapturedStatement[][] = [];
    const repo = new DocumentRepository(
      mockDb({
        onSql: (sql) => sqlStatements.push(sql),
        onBind: (values) => bindCalls.push(values),
        onBatch: (statements) => batchCalls.push(statements)
      })
    );

    const result = await repo.createDraftWithLines({
      documentType: "project_income",
      actionType: "normal",
      businessDate: "2026-04-24",
      period: "2026-04",
      summary: "Merchant income",
      createdBy: "user_1",
      operatorPersonId: null,
      projectId: "proj_1",
      merchantId: "merchant_1",
      categoryId: "cat_income",
      originalDocumentId: null,
      lines: [
        {
          lineNo: 1,
          lineType: "main",
          accountId: "acct_usdt",
          counterpartyAccountId: null,
          personId: null,
          borrowerPersonId: null,
          currencyCode: "USDT",
          amountMinor: 10000,
          usdtAmountMinor: 10000,
          exchangeRateText: null,
          note: null
        }
      ]
    });

    expect(result.status).toBe("draft");
    expect(batchCalls).toHaveLength(1);
    expect(batchCalls[0]).toHaveLength(2);
    expect(batchCalls[0][0].sql.toLowerCase()).toContain("insert into documents");
    expect(batchCalls[0][1].sql.toLowerCase()).toContain("insert into document_lines");
    expect(sqlStatements.join(" ").toLowerCase()).toContain("insert into document_lines");
    expect(bindCalls.at(-1)).toEqual([
      expect.stringMatching(/^line_/),
      result.id,
      1,
      "main",
      "acct_usdt",
      null,
      null,
      null,
      "USDT",
      10000,
      10000,
      null,
      null
    ]);
  });

  it("updates document status for workflow actions", async () => {
    const sqlStatements: string[] = [];
    const bindCalls: unknown[][] = [];
    const repo = new DocumentRepository(
      mockDb({
        onSql: (sql) => sqlStatements.push(sql),
        onBind: (values) => bindCalls.push(values)
      })
    );

    await repo.markSubmitted("doc_1", "2026-04-24T10:00:00.000Z");
    await repo.markRejected("doc_1", "Missing attachment");

    const normalizedSql = sqlStatements.join(" ").replace(/\s+/g, " ").toLowerCase();
    expect(normalizedSql).toContain("status = 'pending'");
    expect(normalizedSql).toContain("status = 'rejected'");
    expect(bindCalls[0]).toEqual(["2026-04-24T10:00:00.000Z", "doc_1"]);
    expect(bindCalls[1]).toEqual(["Missing attachment", "doc_1"]);
  });

  it("lists document summaries in recent business order", async () => {
    let sql = "";
    const repo = new DocumentRepository(mockDb({ onSql: (value) => (sql = value) }));

    const result = await repo.listDocuments();

    expect(result).toEqual([]);
    const normalizedSql = sql.replace(/\s+/g, " ").toLowerCase();
    expect(normalizedSql).toContain("from documents");
    expect(normalizedSql).toContain("order by business_date desc, created_at desc");
    expect(normalizedSql).toContain("limit 100");
  });

  it("gets document details by id", async () => {
    let boundValues: unknown[] = [];
    const row = { id: "doc_1", document_no: "docno_1" };
    const repo = new DocumentRepository(mockDb({ firstResult: row, onBind: (values) => (boundValues = values) }));

    const result = await repo.getDocument("doc_1");

    expect(result).toBe(row);
    expect(boundValues).toEqual(["doc_1"]);
  });

  it("gets document lines ordered by line number", async () => {
    let sql = "";
    let boundValues: unknown[] = [];
    const repo = new DocumentRepository(
      mockDb({
        allResults: [],
        onSql: (value) => (sql = value),
        onBind: (values) => (boundValues = values)
      })
    );

    const result = await repo.getDocumentLines("doc_1");

    expect(result).toEqual([]);
    expect(boundValues).toEqual(["doc_1"]);
    expect(sql.replace(/\s+/g, " ").toLowerCase()).toContain("order by line_no");
  });

  it("binds approval workflow updates", async () => {
    const sqlStatements: string[] = [];
    let boundValues: unknown[] = [];
    const repo = new DocumentRepository(
      mockDb({
        onSql: (sql) => sqlStatements.push(sql),
        onBind: (values) => (boundValues = values)
      })
    );

    await repo.markApproved("doc_1", "reviewer_1", "2026-04-24T11:00:00.000Z");

    const normalizedSql = sqlStatements.join(" ").replace(/\s+/g, " ").toLowerCase();
    expect(normalizedSql).toContain("status = 'approved'");
    expect(normalizedSql).toContain("reject_reason = null");
    expect(boundValues).toEqual(["reviewer_1", "2026-04-24T11:00:00.000Z", "doc_1"]);
  });

  it("checks period locks by period", async () => {
    let sql = "";
    let boundValues: unknown[] = [];
    const row = { period: "2026-04" };
    const repo = new DocumentRepository(
      mockDb({
        firstResult: row,
        onSql: (value) => (sql = value),
        onBind: (values) => (boundValues = values)
      })
    );

    const result = await repo.isPeriodLocked("2026-04");

    expect(result).toBe(row);
    expect(sql.replace(/\s+/g, " ").toLowerCase()).toContain("from period_locks");
    expect(boundValues).toEqual(["2026-04"]);
  });

  it("batches account entry inserts", async () => {
    const batchCalls: CapturedStatement[][] = [];
    const repo = new DocumentRepository(mockDb({ onBatch: (statements) => batchCalls.push(statements) }));

    await repo.insertAccountEntries("doc_1", [
      { accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 10000, entryDate: "2026-04-24" },
      { accountId: "acct_cash", currencyCode: "USD", amountMinor: -10000, entryDate: "2026-04-24" }
    ]);

    expect(batchCalls).toHaveLength(1);
    expect(batchCalls[0]).toHaveLength(2);
    expect(batchCalls[0][0].sql.toLowerCase()).toContain("insert into account_entries");
    expect(batchCalls[0][0].bindings).toEqual([
      expect.stringMatching(/^acct_entry_/),
      "doc_1",
      "acct_usdt",
      "USDT",
      10000,
      "2026-04-24",
      expect.any(String)
    ]);
    expect(batchCalls[0][1].bindings).toEqual([
      expect.stringMatching(/^acct_entry_/),
      "doc_1",
      "acct_cash",
      "USD",
      -10000,
      "2026-04-24",
      expect.any(String)
    ]);
  });

  it("batches loan entry inserts", async () => {
    const batchCalls: CapturedStatement[][] = [];
    const repo = new DocumentRepository(mockDb({ onBatch: (statements) => batchCalls.push(statements) }));

    await repo.insertLoanEntries("doc_1", [
      { borrowerPersonId: "person_1", currencyCode: "USDT", amountMinor: 10000, entryDate: "2026-04-24" },
      { borrowerPersonId: "person_2", currencyCode: "USD", amountMinor: -10000, entryDate: "2026-04-24" }
    ]);

    expect(batchCalls).toHaveLength(1);
    expect(batchCalls[0]).toHaveLength(2);
    expect(batchCalls[0][0].sql.toLowerCase()).toContain("insert into loan_entries");
    expect(batchCalls[0][0].bindings).toEqual([
      expect.stringMatching(/^loan_entry_/),
      "doc_1",
      "person_1",
      "USDT",
      10000,
      "2026-04-24",
      expect.any(String)
    ]);
    expect(batchCalls[0][1].bindings).toEqual([
      expect.stringMatching(/^loan_entry_/),
      "doc_1",
      "person_2",
      "USD",
      -10000,
      "2026-04-24",
      expect.any(String)
    ]);
  });
});
