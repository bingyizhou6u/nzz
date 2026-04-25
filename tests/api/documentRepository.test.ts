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
      loanEntries: [
        {
          borrowerPersonId: "person_1",
          currencyCode: "USDT",
          amountMinor: 10000,
          usdtCostMinor: 10000,
          entryDate: "2026-04-24"
        }
      ],
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

  it("guards reversal approval writes against duplicate approved reversals", async () => {
    const batchCalls: CapturedStatement[][] = [];
    const repo = new DocumentRepository(mockDb({ onBatch: (statements) => batchCalls.push(statements) }));
    const auditLogStatement = {
      sql: "INSERT INTO audit_logs SELECT ? WHERE EXISTS (SELECT 1 FROM documents WHERE id = ? AND status = 'pending')",
      bindings: ["audit_1", "doc_rev"]
    } as unknown as D1PreparedStatement;
    const input = {
      documentId: "doc_rev",
      period: "2026-04",
      reviewer: "reviewer_1",
      reviewedAt: "2026-04-24T11:00:00.000Z",
      reversalOriginalDocumentId: "doc_original",
      accountEntries: [{ accountId: "acct_usdt", currencyCode: "USDT", amountMinor: -10000, entryDate: "2026-04-24" }],
      loanEntries: [],
      auditLogStatement
    };

    await repo.approveWithPostings(input);

    expect(batchCalls).toHaveLength(1);
    const accountEntryStatement = batchCalls[0].find((statement) =>
      statement.sql.replace(/\s+/g, " ").toLowerCase().includes("insert into account_entries")
    );
    const approvalStatement = batchCalls[0].find((statement) =>
      statement.sql.replace(/\s+/g, " ").toLowerCase().includes("update documents set status = 'approved'")
    );

    for (const statement of [accountEntryStatement, approvalStatement]) {
      const normalizedSql = statement?.sql.replace(/\s+/g, " ").toLowerCase();
      expect(normalizedSql).toContain("original_document_id = ?");
      expect(normalizedSql).toContain("action_type = 'reversal'");
      expect(normalizedSql).toContain("status = 'approved'");
      expect(statement?.bindings).toContain("doc_original");
      expect(statement?.bindings).toContain("doc_rev");
    }
  });

  it("maps transfer lot movements from client lot ids to generated lot ids", async () => {
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
      accountEntries: [
        { accountId: "acct_aed_reserve", currencyCode: "AED", amountMinor: -1000, entryDate: "2026-04-24" },
        { accountId: "acct_aed_bank", currencyCode: "AED", amountMinor: 1000, entryDate: "2026-04-24" }
      ],
      loanEntries: [],
      lotCreations: [
        {
          currencyCode: "AED",
          originalAmountMinor: 1000,
          remainingAmountMinor: 1000,
          originalUsdtCostMinor: 272,
          remainingUsdtCostMinor: 272,
          clientLotId: "doc_1:transfer:1",
          sourceDocumentId: "doc_1",
          currentAccountId: "acct_aed_bank",
          currentPersonId: null,
          lotDate: "2026-04-24"
        }
      ],
      lotUpdates: [
        {
          lotId: "lot_source",
          amountDeltaMinor: -1000,
          usdtCostDeltaMinor: -272,
          expectedRemainingAmountMinor: 2000,
          expectedRemainingUsdtCostMinor: 544
        }
      ],
      lotMovements: [
        {
          lotId: "doc_1:transfer:1",
          movementType: "account_transfer",
          fromAccountId: "acct_aed_reserve",
          toAccountId: "acct_aed_bank",
          fromPersonId: null,
          toPersonId: null,
          amountMinor: 1000,
          usdtCostMinor: 272,
          movementDate: "2026-04-24"
        }
      ],
      auditLogStatement
    });

    expect(batchCalls).toHaveLength(1);
    expect(batchCalls[0].some((statement) => statement.sql.toLowerCase().includes("insert into lots"))).toBe(true);
    expect(batchCalls[0].some((statement) => statement.sql.toLowerCase().includes("insert into lot_movements"))).toBe(
      true
    );
    expect(batchCalls[0].some((statement) => statement.bindings.includes("account_transfer"))).toBe(true);

    const lotCreationStatement = batchCalls[0].find((statement) =>
      statement.sql.replace(/\s+/g, " ").toLowerCase().includes("insert into lots")
    );
    const lotMovementStatement = batchCalls[0].find((statement) =>
      statement.sql.replace(/\s+/g, " ").toLowerCase().includes("insert into lot_movements")
    );
    const createdLotId = lotCreationStatement?.bindings[0];

    expect(createdLotId).toEqual(expect.stringMatching(/^lot_/));
    expect(lotMovementStatement?.bindings).toContain(createdLotId);
    expect(lotMovementStatement?.bindings).not.toContain("doc_1:transfer:1");
    expect(batchCalls[0].some((statement) => statement.bindings.includes("doc_1:transfer:1"))).toBe(false);
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
    expect(normalizedSql).toContain("current_person_id is ?");
    expect(normalizedSql).toContain("order by lot_date, id");
    expect(boundValues).toEqual(["acct_aed", "AED", "person_1"]);
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
      lotUpdates: [
        {
          lotId: "lot_source",
          amountDeltaMinor: -1000,
          usdtCostDeltaMinor: -272,
          expectedRemainingAmountMinor: 1000,
          expectedRemainingUsdtCostMinor: 272
        }
      ],
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
      pendingCostUpdates: [
        { pendingCostMatchId: "pending_1", amountDeltaMinor: -500, expectedRemainingAmountMinor: 500 }
      ],
      auditLogStatement
    });

    expect(batchCalls).toHaveLength(1);
    expect(batchCalls[0]).toHaveLength(9);

    const lotCreationStatement = batchCalls[0].find((statement) =>
      statement.sql.replace(/\s+/g, " ").toLowerCase().includes("insert into lots")
    );
    const lotConflictGuardStatement = batchCalls[0].find((statement) =>
      String(statement.bindings[0]).startsWith("lot_conflict_guard_")
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
    const pendingConflictGuardStatement = batchCalls[0].find((statement) =>
      String(statement.bindings[0]).startsWith("pending_cost_conflict_guard_")
    );
    const pendingUpdateStatement = batchCalls[0].find((statement) =>
      statement.sql.replace(/\s+/g, " ").toLowerCase().includes("update pending_cost_matches")
    );

    expect(lotCreationStatement).toBeDefined();
    expect(lotConflictGuardStatement).toBeDefined();
    expect(lotUpdateStatement).toBeDefined();
    expect(lotMovementStatement).toBeDefined();
    expect(pendingCreationStatement).toBeDefined();
    expect(pendingConflictGuardStatement).toBeDefined();
    expect(pendingUpdateStatement).toBeDefined();
    expect(batchCalls[0].indexOf(lotConflictGuardStatement as CapturedStatement)).toBeLessThan(
      batchCalls[0].indexOf(lotUpdateStatement as CapturedStatement)
    );
    expect(batchCalls[0].indexOf(pendingConflictGuardStatement as CapturedStatement)).toBeLessThan(
      batchCalls[0].indexOf(pendingUpdateStatement as CapturedStatement)
    );

    const fifoStatements = [
      lotCreationStatement,
      lotConflictGuardStatement,
      lotUpdateStatement,
      lotMovementStatement,
      pendingCreationStatement,
      pendingConflictGuardStatement,
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
    expect(lotConflictGuardStatement?.sql.replace(/\s+/g, " ").toLowerCase()).toContain("insert into account_entries");
    expect(lotConflictGuardStatement?.sql.replace(/\s+/g, " ").toLowerCase()).toContain("account_id");
    expect(lotConflictGuardStatement?.sql.replace(/\s+/g, " ").toLowerCase()).toContain("null");
    expect(lotConflictGuardStatement?.sql.replace(/\s+/g, " ").toLowerCase()).toContain("not exists ( select 1 from lots");
    expect(lotConflictGuardStatement?.sql.replace(/\s+/g, " ").toLowerCase()).toContain("remaining_amount_minor = ?");
    expect(lotConflictGuardStatement?.sql.replace(/\s+/g, " ").toLowerCase()).toContain("remaining_usdt_cost_minor = ?");
    expect(lotConflictGuardStatement?.sql.replace(/\s+/g, " ").toLowerCase()).toContain("remaining_amount_minor + ? >= 0");
    expect(lotConflictGuardStatement?.sql.replace(/\s+/g, " ").toLowerCase()).toContain(
      "remaining_usdt_cost_minor + ? >= 0"
    );
    expect(lotConflictGuardStatement?.bindings).toEqual([
      expect.stringMatching(/^lot_conflict_guard_/),
      "doc_1",
      "USDT",
      expect.any(String),
      expect.any(String),
      "doc_1",
      "2026-04",
      "lot_source",
      1000,
      272,
      -1000,
      -272
    ]);
    expect(lotUpdateStatement?.bindings).toEqual([
      -1000,
      -272,
      -1000,
      "lot_source",
      1000,
      272,
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
    expect(pendingConflictGuardStatement?.sql.replace(/\s+/g, " ").toLowerCase()).toContain("insert into account_entries");
    expect(pendingConflictGuardStatement?.sql.replace(/\s+/g, " ").toLowerCase()).toContain(
      "not exists ( select 1 from pending_cost_matches"
    );
    expect(pendingConflictGuardStatement?.sql.replace(/\s+/g, " ").toLowerCase()).toContain("remaining_amount_minor = ?");
    expect(pendingConflictGuardStatement?.sql.replace(/\s+/g, " ").toLowerCase()).toContain(
      "remaining_amount_minor + ? >= 0"
    );
    expect(pendingConflictGuardStatement?.bindings).toEqual([
      expect.stringMatching(/^pending_cost_conflict_guard_/),
      "doc_1",
      "USDT",
      expect.any(String),
      expect.any(String),
      "doc_1",
      "2026-04",
      "pending_1",
      500,
      -500
    ]);
    expect(pendingUpdateStatement?.bindings).toEqual([-500, -500, "pending_1", 500, -500, "doc_1", "2026-04"]);
    expect(batchCalls[0].some((statement) => statement.bindings.includes("doc_1:lot:1"))).toBe(false);
  });

  it("batches pending cost applications during guarded approval", async () => {
    const batchCalls: CapturedStatement[][] = [];
    const repo = new DocumentRepository(mockDb({ onBatch: (statements) => batchCalls.push(statements) }));

    await repo.approveWithPostings({
      documentId: "doc_issue",
      period: "2026-04",
      reviewer: "reviewer_1",
      accountEntries: [],
      loanEntries: [],
      lotCreations: [
        {
          currencyCode: "AED",
          originalAmountMinor: 120000,
          remainingAmountMinor: 0,
          originalUsdtCostMinor: 32400,
          remainingUsdtCostMinor: 0,
          clientLotId: "doc_issue:issue:1",
          sourceDocumentId: "doc_issue",
          currentAccountId: "acct_staff",
          currentPersonId: "person_staff",
          lotDate: "2026-04-25"
        }
      ],
      lotUpdates: [],
      lotMovements: [],
      pendingCostCreations: [],
      pendingCostUpdates: [],
      pendingCostApplications: [
        {
          pendingCostMatchId: "pending_1",
          lotId: "doc_issue:issue:1",
          amountMinor: 120000,
          usdtCostMinor: 32400,
          applicationDate: "2026-04-25"
        }
      ],
      auditLogStatement: {
        sql: "INSERT INTO audit_logs (id, entity_id) VALUES (?, ?)",
        bindings: ["audit_1", "doc_issue"]
      } as unknown as D1PreparedStatement
    });

    const statement = batchCalls[0].find((item) =>
      item.sql.replace(/\s+/g, " ").toLowerCase().includes("insert into pending_cost_applications")
    );
    const lotCreationStatement = batchCalls[0].find((item) =>
      item.sql.replace(/\s+/g, " ").toLowerCase().includes("insert into lots")
    );
    const createdLotId = lotCreationStatement?.bindings[0];

    expect(statement).toBeDefined();
    expect(statement?.bindings).toEqual([
      expect.stringMatching(/^pending_cost_app_/),
      "pending_1",
      "doc_issue",
      createdLotId,
      120000,
      32400,
      "2026-04-25",
      expect.any(String),
      "doc_issue",
      "2026-04"
    ]);
    expect(statement?.bindings).not.toContain("doc_issue:issue:1");
  });

  it("batches loan item creations during guarded approval", async () => {
    const batchCalls: CapturedStatement[][] = [];
    const repo = new DocumentRepository(mockDb({ onBatch: (statements) => batchCalls.push(statements) }));
    const auditLogStatement = {
      sql: "INSERT INTO audit_logs SELECT ? WHERE EXISTS (SELECT 1 FROM documents WHERE id = ? AND status = 'pending')",
      bindings: ["audit_1", "doc_loan"]
    } as unknown as D1PreparedStatement;

    await repo.approveWithPostings({
      documentId: "doc_loan",
      period: "2026-04",
      reviewer: "reviewer",
      reviewedAt: "2026-04-25T10:00:00.000Z",
      accountEntries: [],
      loanEntries: [],
      loanItemCreations: [
        {
          clientLoanItemId: "doc_loan:loan:1",
          sourceDocumentId: "doc_loan",
          sourceLineId: "line_1",
          borrowerPersonId: "person_borrower",
          currencyCode: "AED",
          originalAmountMinor: 367000,
          remainingAmountMinor: 367000,
          originalUsdtCostMinor: 100000,
          remainingUsdtCostMinor: 100000,
          loanDate: "2026-04-25"
        }
      ],
      loanItemUpdates: [],
      loanAllocations: [],
      auditLogStatement
    });

    expect(batchCalls).toHaveLength(1);
    const loanItemCreationStatement = batchCalls[0].find((statement) =>
      statement.sql.replace(/\s+/g, " ").toLowerCase().includes("insert into loan_items")
    );

    expect(loanItemCreationStatement).toBeDefined();
    expect(loanItemCreationStatement?.sql.replace(/\s+/g, " ").toLowerCase()).toContain("where exists");
    expect(loanItemCreationStatement?.bindings).toEqual([
      expect.stringMatching(/^loan_item_/),
      "doc_loan",
      "line_1",
      "person_borrower",
      "AED",
      367000,
      367000,
      100000,
      100000,
      "2026-04-25",
      "open",
      expect.any(String),
      "doc_loan",
      "2026-04"
    ]);
    expect(batchCalls[0].some((statement) => statement.bindings.includes("doc_loan:loan:1"))).toBe(false);
  });

  it("guards loan item updates and writes allocations during approval", async () => {
    const batchCalls: CapturedStatement[][] = [];
    const repo = new DocumentRepository(mockDb({ onBatch: (statements) => batchCalls.push(statements) }));
    const auditLogStatement = {
      sql: "INSERT INTO audit_logs SELECT ? WHERE EXISTS (SELECT 1 FROM documents WHERE id = ? AND status = 'pending')",
      bindings: ["audit_1", "doc_repay"]
    } as unknown as D1PreparedStatement;

    await repo.approveWithPostings({
      documentId: "doc_repay",
      period: "2026-04",
      reviewer: "reviewer",
      reviewedAt: "2026-04-25T10:00:00.000Z",
      reversalOriginalDocumentId: "doc_original",
      accountEntries: [],
      loanEntries: [],
      loanItemCreations: [],
      loanItemUpdates: [
        {
          loanItemId: "loan_item_1",
          amountDeltaMinor: -10000,
          usdtCostDeltaMinor: -2700,
          expectedRemainingAmountMinor: 10000,
          expectedRemainingUsdtCostMinor: 2700
        }
      ],
      loanAllocations: [
        {
          loanItemId: "loan_item_1",
          allocationType: "repayment",
          amountMinor: 10000,
          usdtCostMinor: 2700,
          allocationDate: "2026-04-25"
        }
      ],
      auditLogStatement
    });

    expect(batchCalls).toHaveLength(1);
    const loanItemUpdateStatement = batchCalls[0].find((statement) =>
      statement.sql.replace(/\s+/g, " ").toLowerCase().includes("update loan_items")
    );
    const loanItemConflictGuardStatement = batchCalls[0].find((statement) =>
      String(statement.bindings[0]).startsWith("loan_item_conflict_guard_")
    );
    const loanAllocationStatement = batchCalls[0].find((statement) =>
      statement.sql.replace(/\s+/g, " ").toLowerCase().includes("insert into loan_allocations")
    );

    expect(loanItemConflictGuardStatement).toBeDefined();
    expect(loanItemConflictGuardStatement?.sql.replace(/\s+/g, " ").toLowerCase()).toContain("insert into account_entries");
    expect(loanItemConflictGuardStatement?.sql.replace(/\s+/g, " ").toLowerCase()).toContain(
      "not exists ( select 1 from loan_items"
    );
    expect(loanItemConflictGuardStatement?.sql.replace(/\s+/g, " ").toLowerCase()).toContain("remaining_amount_minor = ?");
    expect(loanItemConflictGuardStatement?.sql.replace(/\s+/g, " ").toLowerCase()).toContain(
      "remaining_usdt_cost_minor = ?"
    );
    expect(loanItemConflictGuardStatement?.bindings).toEqual([
      expect.stringMatching(/^loan_item_conflict_guard_/),
      "doc_repay",
      "USDT",
      expect.any(String),
      expect.any(String),
      "doc_repay",
      "2026-04",
      "doc_original",
      "doc_repay",
      "loan_item_1",
      10000,
      2700,
      -10000,
      -2700
    ]);
    expect(loanItemUpdateStatement).toBeDefined();
    expect(loanItemUpdateStatement?.sql.replace(/\s+/g, " ").toLowerCase()).toContain("remaining_amount_minor = ?");
    expect(loanItemUpdateStatement?.sql.replace(/\s+/g, " ").toLowerCase()).toContain("remaining_usdt_cost_minor = ?");
    expect(loanItemUpdateStatement?.sql.replace(/\s+/g, " ").toLowerCase()).toContain("original_document_id = ?");
    expect(loanItemUpdateStatement?.bindings).toEqual([
      -10000,
      -2700,
      -10000,
      "loan_item_1",
      10000,
      2700,
      -10000,
      -2700,
      "doc_repay",
      "2026-04",
      "doc_original",
      "doc_repay"
    ]);
    expect(batchCalls[0].indexOf(loanItemConflictGuardStatement as CapturedStatement)).toBeLessThan(
      batchCalls[0].indexOf(loanItemUpdateStatement as CapturedStatement)
    );
    expect(loanAllocationStatement).toBeDefined();
    expect(loanAllocationStatement?.sql.replace(/\s+/g, " ").toLowerCase()).toContain("where exists");
    expect(loanAllocationStatement?.sql.replace(/\s+/g, " ").toLowerCase()).toContain("original_document_id = ?");
    expect(loanAllocationStatement?.bindings).toEqual([
      expect.stringMatching(/^loan_alloc_/),
      "doc_repay",
      "loan_item_1",
      "repayment",
      10000,
      2700,
      "2026-04-25",
      expect.any(String),
      "doc_repay",
      "2026-04",
      "doc_original",
      "doc_repay"
    ]);
  });

  it("maps loan allocations from client loan item ids to generated loan item ids", async () => {
    const batchCalls: CapturedStatement[][] = [];
    const repo = new DocumentRepository(mockDb({ onBatch: (statements) => batchCalls.push(statements) }));

    await repo.approveWithPostings({
      documentId: "doc_loan",
      period: "2026-04",
      reviewer: "reviewer",
      accountEntries: [],
      loanEntries: [],
      loanItemCreations: [
        {
          clientLoanItemId: "doc_loan:loan:1",
          sourceDocumentId: "doc_loan",
          sourceLineId: "line_1",
          borrowerPersonId: "person_borrower",
          currencyCode: "USDT",
          originalAmountMinor: 50000,
          remainingAmountMinor: 0,
          originalUsdtCostMinor: 50000,
          remainingUsdtCostMinor: 0,
          loanDate: "2026-04-25"
        }
      ],
      loanAllocations: [
        {
          loanItemId: "doc_loan:loan:1",
          allocationType: "reversal",
          amountMinor: 50000,
          usdtCostMinor: 50000,
          allocationDate: "2026-04-25"
        }
      ],
      auditLogStatement: {} as D1PreparedStatement
    });

    const loanItemCreationStatement = batchCalls[0].find((statement) =>
      statement.sql.replace(/\s+/g, " ").toLowerCase().includes("insert into loan_items")
    );
    const loanAllocationStatement = batchCalls[0].find((statement) =>
      statement.sql.replace(/\s+/g, " ").toLowerCase().includes("insert into loan_allocations")
    );
    const createdLoanItemId = loanItemCreationStatement?.bindings[0];

    expect(createdLoanItemId).toEqual(expect.stringMatching(/^loan_item_/));
    expect(loanAllocationStatement?.bindings).toContain(createdLoanItemId);
    expect(loanAllocationStatement?.bindings).not.toContain("doc_loan:loan:1");
    expect(loanItemCreationStatement?.bindings).toContain("closed");
  });

  it("lists open loan items by borrower and currency ordered for FIFO repayment", async () => {
    let sql = "";
    let boundValues: unknown[] = [];
    const row = {
      id: "loan_item_1",
      source_document_id: "doc_loan",
      borrower_person_id: "person_borrower",
      currency_code: "AED",
      remaining_amount_minor: 10000,
      remaining_usdt_cost_minor: 2700,
      loan_date: "2026-04-20",
      created_at: "2026-04-20T10:00:00.000Z"
    };
    const repo = new DocumentRepository(
      mockDb({
        allResults: [row],
        onSql: (value) => (sql = value),
        onBind: (values) => (boundValues = values)
      })
    );

    const result = await repo.listOpenLoanItems({
      borrowerPersonId: "person_borrower",
      currencyCode: "AED",
      targetSourceDocumentId: "doc_loan"
    });

    expect(result).toEqual([row]);
    const normalizedSql = sql.replace(/\s+/g, " ").toLowerCase();
    expect(normalizedSql).toContain("from loan_items");
    expect(normalizedSql).toContain("borrower_person_id = ?");
    expect(normalizedSql).toContain("currency_code = ?");
    expect(normalizedSql).toContain("status in ('open', 'partial')");
    expect(normalizedSql).toContain("remaining_amount_minor > 0");
    expect(normalizedSql).toContain("source_document_id = ?");
    expect(normalizedSql).toContain("order by loan_date, created_at, id");
    expect(boundValues).toEqual(["person_borrower", "AED", "doc_loan"]);
  });

  it("rejects approval inside the batch when the loan item conflict guard fails", async () => {
    const repo = new DocumentRepository(
      mockDb({
        batchResults: [
          { success: false, error: "NOT NULL constraint failed: account_entries.account_id" } as unknown as D1Result,
          { success: true } as D1Result,
          { success: true } as D1Result,
          { success: true, meta: { changes: 1 } } as unknown as D1Result
        ]
      })
    );

    await expect(
      repo.approveWithPostings({
        documentId: "doc_repay",
        period: "2026-04",
        reviewer: "reviewer_1",
        accountEntries: [],
        loanEntries: [],
        loanItemUpdates: [
          {
            loanItemId: "loan_item_1",
            amountDeltaMinor: -10000,
            usdtCostDeltaMinor: -2700,
            expectedRemainingAmountMinor: 10000,
            expectedRemainingUsdtCostMinor: 2700
          }
        ],
        auditLogStatement: {} as D1PreparedStatement
      })
    ).rejects.toThrow("Loan item balance changed before approval could be posted");
  });

  it("surfaces generic D1 errors from the loan item conflict guard", async () => {
    const repo = new DocumentRepository(
      mockDb({
        batchResults: [
          { success: false, error: "D1_ERROR: no such table: loan_items" } as unknown as D1Result,
          { success: true } as D1Result,
          { success: true } as D1Result,
          { success: true, meta: { changes: 1 } } as unknown as D1Result
        ]
      })
    );

    await expect(
      repo.approveWithPostings({
        documentId: "doc_repay",
        period: "2026-04",
        reviewer: "reviewer_1",
        accountEntries: [],
        loanEntries: [],
        loanItemUpdates: [
          {
            loanItemId: "loan_item_1",
            amountDeltaMinor: -10000,
            usdtCostDeltaMinor: -2700,
            expectedRemainingAmountMinor: 10000,
            expectedRemainingUsdtCostMinor: 2700
          }
        ],
        auditLogStatement: {} as D1PreparedStatement
      })
    ).rejects.toThrow("D1_ERROR: no such table: loan_items");
  });

  it("rejects approval when a loan item update no longer matches the available balance", async () => {
    const repo = new DocumentRepository(
      mockDb({
        batchResults: [
          { success: true } as D1Result,
          { success: true, meta: { changes: 0 } } as unknown as D1Result,
          { success: true } as D1Result,
          { success: true, meta: { changes: 1 } } as unknown as D1Result
        ]
      })
    );

    await expect(
      repo.approveWithPostings({
        documentId: "doc_repay",
        period: "2026-04",
        reviewer: "reviewer_1",
        accountEntries: [],
        loanEntries: [],
        loanItemUpdates: [
          {
            loanItemId: "loan_item_1",
            amountDeltaMinor: -10000,
            usdtCostDeltaMinor: -2700,
            expectedRemainingAmountMinor: 10000,
            expectedRemainingUsdtCostMinor: 2700
          }
        ],
        auditLogStatement: {} as D1PreparedStatement
      })
    ).rejects.toThrow("Loan item balance changed before approval could be posted");
  });

  it("rejects approval inside the batch when the lot conflict guard fails", async () => {
    const repo = new DocumentRepository(
      mockDb({
        batchResults: [
          { success: false, error: "NOT NULL constraint failed: account_entries.account_id" } as unknown as D1Result,
          { success: true } as D1Result,
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
        lotUpdates: [
          {
            lotId: "lot_source",
            amountDeltaMinor: -1000,
            usdtCostDeltaMinor: -272,
            expectedRemainingAmountMinor: 1000,
            expectedRemainingUsdtCostMinor: 272
          }
        ],
        auditLogStatement: {} as D1PreparedStatement
      })
    ).rejects.toThrow("Lot balance changed before approval could be posted");
  });

  it("surfaces generic D1 errors from the lot conflict guard", async () => {
    const repo = new DocumentRepository(
      mockDb({
        batchResults: [
          { success: false, error: "D1_ERROR: no such table: lots" } as unknown as D1Result,
          { success: true } as D1Result,
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
        lotUpdates: [
          {
            lotId: "lot_source",
            amountDeltaMinor: -1000,
            usdtCostDeltaMinor: -272,
            expectedRemainingAmountMinor: 1000,
            expectedRemainingUsdtCostMinor: 272
          }
        ],
        auditLogStatement: {} as D1PreparedStatement
      })
    ).rejects.toThrow("D1_ERROR: no such table: lots");
  });

  it("rejects approval when a lot update no longer matches the available balance", async () => {
    const repo = new DocumentRepository(
      mockDb({
        batchResults: [
          { success: true } as D1Result,
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
        lotUpdates: [
          {
            lotId: "lot_source",
            amountDeltaMinor: -1000,
            usdtCostDeltaMinor: -272,
            expectedRemainingAmountMinor: 1000,
            expectedRemainingUsdtCostMinor: 272
          }
        ],
        auditLogStatement: {} as D1PreparedStatement
      })
    ).rejects.toThrow("Lot balance changed before approval could be posted");
  });

  it("rejects approval inside the batch when the pending cost conflict guard fails", async () => {
    const repo = new DocumentRepository(
      mockDb({
        batchResults: [
          { success: false, error: "NOT NULL constraint failed: account_entries.account_id" } as unknown as D1Result,
          { success: true } as D1Result,
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
        pendingCostUpdates: [
          { pendingCostMatchId: "pending_1", amountDeltaMinor: -500, expectedRemainingAmountMinor: 500 }
        ],
        auditLogStatement: {} as D1PreparedStatement
      })
    ).rejects.toThrow("Pending cost balance changed before approval could be posted");
  });

  it("surfaces generic D1 errors from the pending cost conflict guard", async () => {
    const repo = new DocumentRepository(
      mockDb({
        batchResults: [
          { success: false, error: "D1_ERROR: no such table: pending_cost_matches" } as unknown as D1Result,
          { success: true } as D1Result,
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
        pendingCostUpdates: [
          { pendingCostMatchId: "pending_1", amountDeltaMinor: -500, expectedRemainingAmountMinor: 500 }
        ],
        auditLogStatement: {} as D1PreparedStatement
      })
    ).rejects.toThrow("D1_ERROR: no such table: pending_cost_matches");
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
      { borrowerPersonId: "person_1", currencyCode: "USDT", amountMinor: 10000, usdtCostMinor: 10000, entryDate: "2026-04-24" },
      { borrowerPersonId: "person_2", currencyCode: "USD", amountMinor: -10000, usdtCostMinor: null, entryDate: "2026-04-24" }
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
      null,
      "2026-04-24",
      expect.any(String)
    ]);
  });

  it("lists account entries by document for reversal posting", async () => {
    let sql = "";
    let boundValues: unknown[] = [];
    const row = { account_id: "acct_usdt", currency_code: "USDT", amount_minor: 10000 };
    const repo = new DocumentRepository(
      mockDb({ allResults: [row], onSql: (value) => (sql = value), onBind: (values) => (boundValues = values) })
    );

    await expect(repo.listAccountEntriesForDocument("doc_original")).resolves.toEqual([row]);
    expect(sql.replace(/\s+/g, " ").toLowerCase()).toContain("from account_entries");
    expect(boundValues).toEqual(["doc_original"]);
  });

  it("lists loan entries by document for reversal posting", async () => {
    let sql = "";
    let boundValues: unknown[] = [];
    const row = { borrower_person_id: "person_1", currency_code: "USDT", amount_minor: 10000, usdt_cost_minor: 10000 };
    const repo = new DocumentRepository(
      mockDb({ allResults: [row], onSql: (value) => (sql = value), onBind: (values) => (boundValues = values) })
    );

    await expect(repo.listLoanEntriesForDocument("doc_original")).resolves.toEqual([row]);
    expect(sql.replace(/\s+/g, " ").toLowerCase()).toContain("from loan_entries");
    expect(sql.replace(/\s+/g, " ").toLowerCase()).toContain("usdt_cost_minor");
    expect(boundValues).toEqual(["doc_original"]);
  });

  it("lists fifo reversal context by original document", async () => {
    const sqlStatements: string[] = [];
    const bindCalls: unknown[][] = [];
    const repo = new DocumentRepository(
      mockDb({ allResults: [], onSql: (sql) => sqlStatements.push(sql), onBind: (values) => bindCalls.push(values) })
    );

    await repo.listLotMovementsForDocument("doc_original");
    await repo.listLotsCreatedByDocument("doc_original");
    await repo.listPendingCostMatchesForDocument("doc_original");

    const normalizedSql = sqlStatements.join(" ").replace(/\s+/g, " ").toLowerCase();
    expect(normalizedSql).toContain("from lot_movements");
    expect(normalizedSql).toContain("from lots");
    expect(normalizedSql).toContain("from pending_cost_matches");
    expect(bindCalls).toEqual([["doc_original"], ["doc_original"], ["doc_original"]]);
  });

  it("lists lot snapshots and later movement conflicts for reversal safety checks", async () => {
    const sqlStatements: string[] = [];
    const bindCalls: unknown[][] = [];
    const repo = new DocumentRepository(
      mockDb({ allResults: [], onSql: (sql) => sqlStatements.push(sql), onBind: (values) => bindCalls.push(values) })
    );

    await repo.listLotsByIds(["lot_a", "lot_b"]);
    await repo.listLaterMovementLotIds({ lotIds: ["lot_a", "lot_b"], originalDocumentId: "doc_original" });

    const normalizedSql = sqlStatements.join(" ").replace(/\s+/g, " ").toLowerCase();
    expect(normalizedSql).toContain("where id in (?, ?)");
    expect(normalizedSql).toContain("select distinct lot_id");
    expect(normalizedSql).toContain("document_id <> ?");
    expect(normalizedSql).toContain("created_at >= (");
    expect(bindCalls).toEqual([
      ["lot_a", "lot_b"],
      ["lot_a", "lot_b", "doc_original", "doc_original"]
    ]);
  });

  it("lists loan item snapshots and allocations for reversal safety checks", async () => {
    const sqlStatements: string[] = [];
    const bindCalls: unknown[][] = [];
    const repo = new DocumentRepository(
      mockDb({ allResults: [], onSql: (sql) => sqlStatements.push(sql), onBind: (values) => bindCalls.push(values) })
    );

    await repo.listLoanItemsCreatedByDocument("doc_original");
    await repo.listLoanAllocationsForDocument("doc_original");
    await repo.listLoanItemsByIds(["loan_item_a", "loan_item_b"]);
    await repo.listLaterLoanAllocationItemIds({
      loanItemIds: ["loan_item_a", "loan_item_b"],
      originalDocumentId: "doc_original"
    });

    const normalizedSql = sqlStatements.join(" ").replace(/\s+/g, " ").toLowerCase();
    expect(normalizedSql).toContain("from loan_items");
    expect(normalizedSql).toContain("source_document_id = ?");
    expect(normalizedSql).toContain("from loan_allocations");
    expect(normalizedSql).toContain("where document_id = ?");
    expect(normalizedSql).toContain("where id in (?, ?)");
    expect(normalizedSql).toContain("select distinct loan_item_id");
    expect(normalizedSql).toContain("document_id <> ?");
    expect(normalizedSql).toContain("created_at >= (");
    expect(normalizedSql).toContain("select coalesce(max(created_at), '') from loan_allocations where document_id = ?");
    expect(bindCalls).toEqual([
      ["doc_original"],
      ["doc_original"],
      ["loan_item_a", "loan_item_b"],
      ["loan_item_a", "loan_item_b", "doc_original", "doc_original"]
    ]);
  });

  it("lists approved original document options and excludes approved reversals", async () => {
    let sql = "";
    let boundValues: unknown[] = [];
    const repo = new DocumentRepository(
      mockDb({
        onSql: (value) => (sql = value),
        onBind: (values) => (boundValues = values)
      })
    );

    await repo.listOriginalDocumentOptions({ documentType: "project_income" });

    const normalized = sql.replace(/\s+/g, " ").toLowerCase();
    expect(normalized).toContain("from documents d");
    expect(normalized).toContain("d.status = 'approved'");
    expect(normalized).toContain("d.action_type != 'reversal'");
    expect(normalized).toContain("not exists");
    expect(normalized).toContain("reversal.original_document_id = d.id");
    expect(normalized).toContain("reversal.status = 'approved'");
    expect(normalized).toContain("d.document_type = ?");
    expect(boundValues).toEqual(["project_income"]);
  });
});
