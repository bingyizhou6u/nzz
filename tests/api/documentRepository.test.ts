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
    expect(normalizedSql).toContain("status in ('draft', 'rejected')");
    expect(normalizedSql).toContain("status = 'pending'");
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
    expect(normalizedSql).toContain("status = 'pending'");
    expect(boundValues).toEqual(["reviewer_1", "2026-04-24T11:00:00.000Z", "doc_1"]);
  });

  it("approves with postings in one conditional batch", async () => {
    const batchCalls: CapturedStatement[][] = [];
    const repo = new DocumentRepository(mockDb({ onBatch: (statements) => batchCalls.push(statements) }));
    const auditLogStatement = {
      sql: "INSERT INTO audit_logs SELECT ? WHERE EXISTS (SELECT 1 FROM documents WHERE id = ? AND status = 'pending')",
      bindings: ["audit_1", "doc_1"]
    } as unknown as D1PreparedStatement;

    await repo.approveWithPostings({
      documentId: "doc_1",
      period: "2026-04",
      reviewer: "reviewer_1",
      reviewedAt: "2026-04-24T11:00:00.000Z",
      accountEntries: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 10000, entryDate: "2026-04-24" }],
      loanEntries: [{ borrowerPersonId: "person_1", currencyCode: "USDT", amountMinor: 10000, entryDate: "2026-04-24" }],
      auditLogStatement
    });

    expect(batchCalls).toHaveLength(1);
    expect(batchCalls[0]).toHaveLength(4);
    expect(batchCalls[0][0].sql.replace(/\s+/g, " ").toLowerCase()).toContain("insert into account_entries");
    expect(batchCalls[0][0].sql.replace(/\s+/g, " ").toLowerCase()).toContain("where id = ? and status = 'pending'");
    expect(batchCalls[0][0].sql.replace(/\s+/g, " ").toLowerCase()).toContain("not exists (select 1 from period_locks");
    expect(batchCalls[0][0].bindings).toEqual([
      expect.stringMatching(/^acct_entry_/),
      "doc_1",
      "acct_usdt",
      "USDT",
      10000,
      "2026-04-24",
      expect.any(String),
      "doc_1",
      "2026-04"
    ]);
    expect(batchCalls[0][1].sql.replace(/\s+/g, " ").toLowerCase()).toContain("insert into loan_entries");
    expect(batchCalls[0][1].sql.replace(/\s+/g, " ").toLowerCase()).toContain("where id = ? and status = 'pending'");
    expect(batchCalls[0][1].sql.replace(/\s+/g, " ").toLowerCase()).toContain("not exists (select 1 from period_locks");
    expect(batchCalls[0][1].bindings).toEqual([
      expect.stringMatching(/^loan_entry_/),
      "doc_1",
      "person_1",
      "USDT",
      10000,
      "2026-04-24",
      expect.any(String),
      "doc_1",
      "2026-04"
    ]);
    expect(batchCalls[0][2]).toBe(auditLogStatement);
    expect(batchCalls[0][3].sql.replace(/\s+/g, " ").toLowerCase()).toContain(
      "update documents set status = 'approved'"
    );
    expect(batchCalls[0][3].sql.replace(/\s+/g, " ").toLowerCase()).toContain("where id = ? and status = 'pending'");
    expect(batchCalls[0][3].sql.replace(/\s+/g, " ").toLowerCase()).toContain("not exists (select 1 from period_locks");
    expect(batchCalls[0][3].bindings).toEqual(["reviewer_1", "2026-04-24T11:00:00.000Z", "doc_1", "2026-04"]);
  });

  it("lists open lots for an account in fifo order", async () => {
    let sql = "";
    let boundValues: unknown[] = [];
    const row = {
      id: "lot_1",
      currency_code: "AED",
      remaining_amount_minor: 1000,
      remaining_usdt_cost_minor: 272,
      lot_date: "2026-04-24"
    };
    const repo = new DocumentRepository(
      mockDb({
        allResults: [row],
        onSql: (value) => (sql = value),
        onBind: (values) => (boundValues = values)
      })
    );

    const result = await repo.listOpenLotsForAccount({
      accountId: "acct_aed",
      personId: "person_1",
      currencyCode: "AED"
    });

    expect(result).toEqual([row]);
    const normalizedSql = sql.replace(/\s+/g, " ").toLowerCase();
    expect(normalizedSql).toContain("from lots");
    expect(normalizedSql).toContain("current_account_id = ?");
    expect(normalizedSql).toContain("currency_code = ?");
    expect(normalizedSql).toContain("status = 'open'");
    expect(normalizedSql).toContain("remaining_amount_minor > 0");
    expect(normalizedSql).toContain("current_person_id = ?");
    expect(normalizedSql).toContain("order by lot_date, id");
    expect(boundValues).toEqual(["acct_aed", "AED", "person_1", "person_1"]);
  });

  it("lists open pending cost matches in matching order", async () => {
    let sql = "";
    let boundValues: unknown[] = [];
    const row = {
      id: "pending_1",
      remaining_amount_minor: 1000,
      expense_date: "2026-04-23",
      created_at: "2026-04-23T10:00:00.000Z"
    };
    const repo = new DocumentRepository(
      mockDb({
        allResults: [row],
        onSql: (value) => (sql = value),
        onBind: (values) => (boundValues = values)
      })
    );

    const result = await repo.listOpenPendingCostMatches({
      accountId: "acct_petty",
      personId: "person_1",
      currencyCode: "AED"
    });

    expect(result).toEqual([row]);
    const normalizedSql = sql.replace(/\s+/g, " ").toLowerCase();
    expect(normalizedSql).toContain("from pending_cost_matches");
    expect(normalizedSql).toContain("account_id = ?");
    expect(normalizedSql).toContain("person_id = ?");
    expect(normalizedSql).toContain("currency_code = ?");
    expect(normalizedSql).toContain("status in ('open', 'partial')");
    expect(normalizedSql).toContain("remaining_amount_minor > 0");
    expect(normalizedSql).toContain("order by expense_date, created_at, id");
    expect(boundValues).toEqual(["acct_petty", "person_1", "AED"]);
  });

  it("approves with lot and pending cost writes in the guarded batch", async () => {
    const batchCalls: CapturedStatement[][] = [];
    const repo = new DocumentRepository(mockDb({ onBatch: (statements) => batchCalls.push(statements) }));
    const auditLogStatement = {
      sql: "INSERT INTO audit_logs SELECT ? WHERE EXISTS (SELECT 1 FROM documents WHERE id = ? AND status = 'pending')",
      bindings: ["audit_1", "doc_1"]
    } as unknown as D1PreparedStatement;

    await repo.approveWithPostings({
      documentId: "doc_1",
      period: "2026-04",
      reviewer: "reviewer_1",
      reviewedAt: "2026-04-24T11:00:00.000Z",
      accountEntries: [],
      loanEntries: [],
      lotCreations: [
        {
          currencyCode: "AED",
          originalAmountMinor: 1000,
          remainingAmountMinor: 1000,
          originalUsdtCostMinor: 272,
          remainingUsdtCostMinor: 272,
          clientLotId: "doc_1:lot:1",
          sourceDocumentId: "doc_1",
          currentAccountId: "acct_aed",
          currentPersonId: null,
          lotDate: "2026-04-24"
        }
      ],
      lotUpdates: [{ lotId: "lot_source", amountDeltaMinor: -1000, usdtCostDeltaMinor: -272 }],
      lotMovements: [
        {
          lotId: "doc_1:lot:1",
          movementType: "pending_cost_match",
          fromAccountId: "acct_petty",
          toAccountId: null,
          fromPersonId: "person_1",
          toPersonId: null,
          amountMinor: 1000,
          usdtCostMinor: 272,
          movementDate: "2026-04-24"
        }
      ],
      pendingCostCreations: [
        {
          documentId: "doc_1",
          personId: "person_1",
          accountId: "acct_petty",
          currencyCode: "AED",
          amountMinor: 500,
          remainingAmountMinor: 500,
          expenseDate: "2026-04-24"
        }
      ],
      pendingCostUpdates: [{ pendingCostMatchId: "pending_1", amountDeltaMinor: -500 }],
      auditLogStatement
    });

    expect(batchCalls).toHaveLength(1);
    expect(batchCalls[0]).toHaveLength(7);

    const lotCreationStatement = batchCalls[0].find((statement) =>
      statement.sql.replace(/\s+/g, " ").toLowerCase().includes("insert into lots")
    );
    const lotUpdateStatement = batchCalls[0].find((statement) =>
      statement.sql.replace(/\s+/g, " ").toLowerCase().includes("update lots")
    );
    const lotMovementStatement = batchCalls[0].find((statement) =>
      statement.sql.replace(/\s+/g, " ").toLowerCase().includes("insert into lot_movements")
    );
    const pendingCreationStatement = batchCalls[0].find((statement) =>
      statement.sql.replace(/\s+/g, " ").toLowerCase().includes("insert into pending_cost_matches")
    );
    const pendingUpdateStatement = batchCalls[0].find((statement) =>
      statement.sql.replace(/\s+/g, " ").toLowerCase().includes("update pending_cost_matches")
    );

    expect(lotCreationStatement).toBeDefined();
    expect(lotUpdateStatement).toBeDefined();
    expect(lotMovementStatement).toBeDefined();
    expect(pendingCreationStatement).toBeDefined();
    expect(pendingUpdateStatement).toBeDefined();

    const fifoStatements = [
      lotCreationStatement,
      lotUpdateStatement,
      lotMovementStatement,
      pendingCreationStatement,
      pendingUpdateStatement
    ];
    for (const statement of fifoStatements) {
      const normalizedSql = statement?.sql.replace(/\s+/g, " ").toLowerCase();
      expect(normalizedSql).toContain("exists ( select 1 from documents");
      expect(normalizedSql).toContain("id = ? and status = 'pending'");
      expect(normalizedSql).toContain("not exists (select 1 from period_locks where period = ?)");
    }

    const createdLotId = lotCreationStatement?.bindings[0];
    expect(createdLotId).toEqual(expect.stringMatching(/^lot_/));
    expect(lotCreationStatement?.bindings).toEqual([
      createdLotId,
      "AED",
      1000,
      1000,
      272,
      272,
      "doc_1",
      "acct_aed",
      null,
      "2026-04-24",
      "open",
      expect.any(String),
      "doc_1",
      "2026-04"
    ]);
    expect(lotUpdateStatement?.bindings).toEqual([
      -1000,
      -272,
      -1000,
      "lot_source",
      -1000,
      -272,
      "doc_1",
      "2026-04"
    ]);
    expect(lotMovementStatement?.bindings).toEqual([
      expect.stringMatching(/^lot_move_/),
      createdLotId,
      "doc_1",
      "pending_cost_match",
      "acct_petty",
      null,
      "person_1",
      null,
      1000,
      272,
      "2026-04-24",
      expect.any(String),
      "doc_1",
      "2026-04"
    ]);
    expect(pendingCreationStatement?.bindings).toEqual([
      expect.stringMatching(/^pending_cost_/),
      "doc_1",
      "person_1",
      "acct_petty",
      "AED",
      500,
      500,
      "2026-04-24",
      "open",
      expect.any(String),
      "doc_1",
      "2026-04"
    ]);
    expect(pendingUpdateStatement?.bindings).toEqual([-500, -500, "pending_1", -500, "doc_1", "2026-04"]);
    expect(batchCalls[0].some((statement) => statement.bindings.includes("doc_1:lot:1"))).toBe(false);
  });

  it("rejects approval when a lot update no longer matches the available balance", async () => {
    const repo = new DocumentRepository(
      mockDb({
        batchResults: [
          { success: true, meta: { changes: 0 } } as unknown as D1Result,
          { success: true } as D1Result,
          { success: true, meta: { changes: 1 } } as unknown as D1Result
        ]
      })
    );

    await expect(
      repo.approveWithPostings({
        documentId: "doc_1",
        period: "2026-04",
        reviewer: "reviewer_1",
        accountEntries: [],
        loanEntries: [],
        lotUpdates: [{ lotId: "lot_source", amountDeltaMinor: -1000, usdtCostDeltaMinor: -272 }],
        auditLogStatement: {} as D1PreparedStatement
      })
    ).rejects.toThrow("Lot balance changed before approval could be posted");
  });

  it("rejects atomic approval when the guarded status update changes no rows", async () => {
    const repo = new DocumentRepository(
      mockDb({
        batchResults: [
          { success: true } as D1Result,
          { success: true } as D1Result,
          { success: true, meta: { changes: 0 } } as unknown as D1Result
        ]
      })
    );

    await expect(
      repo.approveWithPostings({
        documentId: "doc_1",
        period: "2026-04",
        reviewer: "reviewer_1",
        accountEntries: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 10000, entryDate: "2026-04-24" }],
        loanEntries: [],
        auditLogStatement: {} as D1PreparedStatement
      })
    ).rejects.toThrow("Document is not pending or period is locked");
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
