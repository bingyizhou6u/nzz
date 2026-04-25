import { all } from "./db";

export interface AccountBalanceRow {
  account_id: string;
  currency_code: string;
  balance_minor: number;
}

export interface PettyCashPendingMatchRow {
  person_id: string;
  account_id: string;
  currency_code: string;
  remaining_amount_minor: number;
}

export interface LoanBalanceRow {
  borrower_person_id: string;
  currency_code: string;
  balance_minor: number;
}

export interface LotBalanceRow {
  id: string;
  currency_code: string;
  remaining_amount_minor: number;
  remaining_usdt_cost_minor: number;
  source_document_id: string;
  current_account_id: string;
  current_person_id: string | null;
  lot_date: string;
  status: string;
}

export interface LotMovementRow {
  id: string;
  lot_id: string;
  document_id: string;
  movement_type: string;
  from_account_id: string | null;
  to_account_id: string | null;
  from_person_id: string | null;
  to_person_id: string | null;
  amount_minor: number;
  usdt_cost_minor: number;
  movement_date: string;
  created_at: string;
}

export interface PendingCostRow {
  id: string;
  document_id: string;
  person_id: string;
  account_id: string;
  currency_code: string;
  amount_minor: number;
  remaining_amount_minor: number;
  expense_date: string;
  status: string;
  created_at: string;
}

export interface LoanAgingRow {
  loan_item_id: string;
  source_document_id: string;
  borrower_person_id: string;
  currency_code: string;
  remaining_amount_minor: number;
  remaining_usdt_cost_minor: number;
  loan_date: string;
  age_days: number;
}

export interface LoanAllocationDetailRow {
  allocation_id: string;
  document_id: string;
  loan_item_id: string;
  allocation_type: string;
  borrower_person_id: string;
  currency_code: string;
  amount_minor: number;
  usdt_cost_minor: number;
  allocation_date: string;
}

export interface LoanWriteoffRow {
  document_id: string;
  borrower_person_id: string;
  project_id: string | null;
  category_id: string | null;
  currency_code: string;
  amount_minor: number;
  usdt_cost_minor: number;
  allocation_date: string;
}

export interface ReportFilters {
  period?: string;
  projectId?: string;
  merchantId?: string;
  personId?: string;
  currencyCode?: string;
  staleDays?: number;
}

export interface ProjectIncomeRow {
  period: string;
  project_id: string | null;
  merchant_id: string | null;
  category_id: string | null;
  currency_code: string;
  income_amount_minor: number;
  income_usdt_minor: number;
}

export interface MerchantIncomeRow {
  period: string;
  project_id: string | null;
  merchant_id: string | null;
  currency_code: string;
  income_amount_minor: number;
  income_usdt_minor: number;
}

export interface ExpenseDetailRow {
  document_id: string;
  document_type: string;
  period: string;
  business_date: string;
  project_id: string | null;
  merchant_id: string | null;
  category_id: string | null;
  person_id: string | null;
  borrower_person_id: string | null;
  currency_code: string;
  amount_minor: number;
  matched_usdt_cost_minor: number;
  pending_amount_minor: number;
  cost_status: "complete" | "incomplete";
}

export interface ExpenseSummaryRow {
  period: string;
  project_id: string | null;
  category_id: string | null;
  person_id: string | null;
  currency_code: string;
  amount_minor: number;
  matched_usdt_cost_minor: number;
  pending_amount_minor: number;
}

export interface ProjectProfitLossRow {
  period: string;
  project_id: string | null;
  income_usdt_minor: number;
  expense_usdt_minor: number;
  pending_expense_minor: number;
  net_usdt_minor: number;
  cost_status: "complete" | "incomplete";
}

export interface MonthlyOperatingSummaryRow {
  period: string;
  income_usdt_minor: number;
  expense_usdt_minor: number;
  pending_expense_minor: number;
  net_usdt_minor: number;
  cost_status: "complete" | "incomplete";
}

export interface ExceptionCheckRow {
  exception_type: string;
  severity: "info" | "warning" | "critical";
  entity_type: string;
  entity_id: string;
  period: string | null;
  business_date: string | null;
  currency_code: string | null;
  amount_minor: number | null;
  usdt_cost_minor: number | null;
  message: string;
}

interface SqlFragment {
  sql: string;
  bindings: unknown[];
}

export class ReportRepository {
  constructor(private readonly db: D1Database) {}

  private reportFilterSql(
    filters: ReportFilters,
    columns: { documentAlias?: string; personColumn?: string; currencyColumn?: string } = {}
  ): SqlFragment {
    const documentAlias = columns.documentAlias ?? "d";
    const clauses: string[] = [];
    const bindings: unknown[] = [];

    if (filters.period) {
      clauses.push(`${documentAlias}.period = ?`);
      bindings.push(filters.period);
    }
    if (filters.projectId) {
      clauses.push(`${documentAlias}.project_id = ?`);
      bindings.push(filters.projectId);
    }
    if (filters.merchantId) {
      clauses.push(`${documentAlias}.merchant_id = ?`);
      bindings.push(filters.merchantId);
    }
    if (filters.personId && columns.personColumn) {
      clauses.push(`${columns.personColumn} = ?`);
      bindings.push(filters.personId);
    }
    if (filters.currencyCode && columns.currencyColumn) {
      clauses.push(`${columns.currencyColumn} = ?`);
      bindings.push(filters.currencyCode);
    }

    return { sql: clauses.length ? `AND ${clauses.join(" AND ")}` : "", bindings };
  }

  private workflowDocumentFilterSql(filters: ReportFilters): SqlFragment {
    const documentFilter = this.reportFilterSql(filters, { documentAlias: "d" });
    const clauses: string[] = [];
    const bindings = [...documentFilter.bindings];

    if (filters.personId) {
      clauses.push("AND d.operator_person_id = ?");
      bindings.push(filters.personId);
    }
    if (filters.currencyCode) {
      clauses.push(`
        AND EXISTS (
          SELECT 1
          FROM document_lines workflow_currency_line
          WHERE workflow_currency_line.document_id = d.id
            AND workflow_currency_line.currency_code = ?
        )
      `);
      bindings.push(filters.currencyCode);
    }

    return { sql: [documentFilter.sql, ...clauses].filter(Boolean).join("\n"), bindings };
  }

  private expenseDetailsCteSql(filters: ReportFilters, cteName = "expense_detail_rows"): SqlFragment {
    const pettyCashFilter = this.reportFilterSql(filters, {
      documentAlias: "d",
      personColumn: "dl.person_id",
      currencyColumn: "dl.currency_code"
    });
    const loanWriteoffFilter = this.reportFilterSql(filters, {
      documentAlias: "d",
      personColumn: "li.borrower_person_id",
      currencyColumn: "li.currency_code"
    });

    return {
      sql: `
        direct_petty_cash_cost AS (
          SELECT
            document_id,
            COALESCE(SUM(usdt_cost_minor), 0) AS usdt_cost_minor
          FROM lot_movements
          WHERE movement_type = 'petty_cash_reimbursement'
          GROUP BY document_id
        ),
        pending_cost_application_cost AS (
          SELECT
            pcm.document_id AS document_id,
            COALESCE(SUM(pca.usdt_cost_minor), 0) AS usdt_cost_minor
          FROM pending_cost_matches pcm
          JOIN pending_cost_applications pca ON pca.pending_cost_match_id = pcm.id
          JOIN documents application_document ON application_document.id = pca.document_id
          WHERE application_document.status = 'approved'
          GROUP BY pcm.document_id
        ),
        pending_cost_remaining AS (
          SELECT
            document_id,
            COALESCE(SUM(remaining_amount_minor), 0) AS pending_amount_minor
          FROM pending_cost_matches
          GROUP BY document_id
        ),
        ${cteName} AS (
          SELECT
            d.id AS document_id,
            d.document_type AS document_type,
            d.period AS period,
            d.business_date AS business_date,
            d.project_id AS project_id,
            d.merchant_id AS merchant_id,
            d.category_id AS category_id,
            dl.person_id AS person_id,
            NULL AS borrower_person_id,
            dl.currency_code AS currency_code,
            dl.amount_minor AS amount_minor,
            COALESCE(direct_petty_cash_cost.usdt_cost_minor, 0) +
              COALESCE(pending_cost_application_cost.usdt_cost_minor, 0) AS matched_usdt_cost_minor,
            COALESCE(pending_cost_remaining.pending_amount_minor, 0) AS pending_amount_minor,
            CASE
              WHEN COALESCE(pending_cost_remaining.pending_amount_minor, 0) > 0 THEN 'incomplete'
              ELSE 'complete'
            END AS cost_status
          FROM documents d
          JOIN document_lines dl ON dl.document_id = d.id
          LEFT JOIN direct_petty_cash_cost ON direct_petty_cash_cost.document_id = d.id
          LEFT JOIN pending_cost_application_cost ON pending_cost_application_cost.document_id = d.id
          LEFT JOIN pending_cost_remaining ON pending_cost_remaining.document_id = d.id
          WHERE d.status = 'approved'
            AND d.document_type = 'petty_cash_reimbursement'
            AND d.action_type <> 'reversal'
            AND NOT EXISTS (
              SELECT 1
              FROM documents reversal
              WHERE reversal.original_document_id = d.id
                AND reversal.action_type = 'reversal'
                AND reversal.status = 'approved'
            )
            ${pettyCashFilter.sql}

          UNION ALL

          SELECT
            d.id AS document_id,
            d.document_type AS document_type,
            d.period AS period,
            d.business_date AS business_date,
            d.project_id AS project_id,
            d.merchant_id AS merchant_id,
            d.category_id AS category_id,
            NULL AS person_id,
            li.borrower_person_id AS borrower_person_id,
            li.currency_code AS currency_code,
            COALESCE(SUM(la.amount_minor), 0) AS amount_minor,
            COALESCE(SUM(la.usdt_cost_minor), 0) AS matched_usdt_cost_minor,
            0 AS pending_amount_minor,
            'complete' AS cost_status
          FROM loan_allocations la
          JOIN loan_items li ON li.id = la.loan_item_id
          JOIN documents d ON d.id = la.document_id
          WHERE d.status = 'approved'
            AND d.document_type = 'loan_writeoff'
            AND la.allocation_type = 'writeoff'
            AND NOT EXISTS (
              SELECT 1
              FROM documents reversal
              WHERE reversal.original_document_id = d.id
                AND reversal.action_type = 'reversal'
                AND reversal.status = 'approved'
            )
            ${loanWriteoffFilter.sql}
          GROUP BY
            d.id,
            d.document_type,
            d.period,
            d.business_date,
            d.project_id,
            d.merchant_id,
            d.category_id,
            li.borrower_person_id,
            li.currency_code
        )
      `,
      bindings: [...pettyCashFilter.bindings, ...loanWriteoffFilter.bindings]
    };
  }

  private projectProfitLossCteSql(filters: ReportFilters, cteName = "project_profit_loss_rows"): SqlFragment {
    const incomeFilter = this.reportFilterSql(filters, { documentAlias: "d", currencyColumn: "ae.currency_code" });
    const expenseDetailsCte = this.expenseDetailsCteSql(filters);

    return {
      sql: `
        income_rows AS (
          SELECT
            d.period AS period,
            d.project_id AS project_id,
            COALESCE(SUM(CASE WHEN ae.currency_code = 'USDT' THEN ae.amount_minor ELSE 0 END), 0) AS income_usdt_minor
          FROM account_entries ae
          JOIN documents d ON d.id = ae.document_id
          WHERE d.status = 'approved'
            AND d.document_type = 'project_income'
            ${incomeFilter.sql}
          GROUP BY d.period, d.project_id
        ),
        ${expenseDetailsCte.sql},
        expense_rows AS (
          SELECT
            period,
            project_id,
            COALESCE(SUM(matched_usdt_cost_minor), 0) AS expense_usdt_minor,
            COALESCE(SUM(pending_amount_minor), 0) AS pending_expense_minor
          FROM expense_detail_rows
          GROUP BY period, project_id
        ),
        ${cteName} AS (
          SELECT
            COALESCE(i.period, e.period) AS period,
            COALESCE(i.project_id, e.project_id) AS project_id,
            COALESCE(i.income_usdt_minor, 0) AS income_usdt_minor,
            COALESCE(e.expense_usdt_minor, 0) AS expense_usdt_minor,
            COALESCE(e.pending_expense_minor, 0) AS pending_expense_minor,
            COALESCE(i.income_usdt_minor, 0) - COALESCE(e.expense_usdt_minor, 0) AS net_usdt_minor,
            CASE WHEN COALESCE(e.pending_expense_minor, 0) > 0 THEN 'incomplete' ELSE 'complete' END AS cost_status
          FROM income_rows i
          FULL OUTER JOIN expense_rows e ON i.period = e.period AND i.project_id IS e.project_id
        )
      `,
      bindings: [...incomeFilter.bindings, ...expenseDetailsCte.bindings]
    };
  }

  accountBalances(): Promise<AccountBalanceRow[]> {
    return all<AccountBalanceRow>(
      this.db.prepare(`
        SELECT
          ae.account_id AS account_id,
          ae.currency_code AS currency_code,
          COALESCE(SUM(ae.amount_minor), 0) AS balance_minor
        FROM account_entries ae
        JOIN documents d ON d.id = ae.document_id
        WHERE d.status = 'approved'
        GROUP BY ae.account_id, ae.currency_code
        ORDER BY ae.account_id, ae.currency_code
      `)
    );
  }

  projectIncome(filters: ReportFilters = {}): Promise<ProjectIncomeRow[]> {
    const filter = this.reportFilterSql(filters, { documentAlias: "d", currencyColumn: "ae.currency_code" });

    return all<ProjectIncomeRow>(
      this.db
        .prepare(`
          SELECT
            d.period AS period,
            d.project_id AS project_id,
            d.merchant_id AS merchant_id,
            d.category_id AS category_id,
            ae.currency_code AS currency_code,
            COALESCE(SUM(ae.amount_minor), 0) AS income_amount_minor,
            COALESCE(SUM(CASE WHEN ae.currency_code = 'USDT' THEN ae.amount_minor ELSE 0 END), 0) AS income_usdt_minor
          FROM account_entries ae
          JOIN documents d ON d.id = ae.document_id
          WHERE d.status = 'approved'
            AND d.document_type = 'project_income'
            ${filter.sql}
          GROUP BY d.period, d.project_id, d.merchant_id, d.category_id, ae.currency_code
          ORDER BY d.period DESC, d.project_id, d.merchant_id, ae.currency_code
        `)
        .bind(...filter.bindings)
    );
  }

  merchantIncome(filters: ReportFilters = {}): Promise<MerchantIncomeRow[]> {
    const filter = this.reportFilterSql(filters, { documentAlias: "d", currencyColumn: "ae.currency_code" });

    return all<MerchantIncomeRow>(
      this.db
        .prepare(`
          SELECT
            d.period AS period,
            d.project_id AS project_id,
            d.merchant_id AS merchant_id,
            ae.currency_code AS currency_code,
            COALESCE(SUM(ae.amount_minor), 0) AS income_amount_minor,
            COALESCE(SUM(CASE WHEN ae.currency_code = 'USDT' THEN ae.amount_minor ELSE 0 END), 0) AS income_usdt_minor
          FROM account_entries ae
          JOIN documents d ON d.id = ae.document_id
          WHERE d.status = 'approved'
            AND d.document_type = 'project_income'
            AND d.merchant_id IS NOT NULL
            ${filter.sql}
          GROUP BY d.period, d.project_id, d.merchant_id, ae.currency_code
          ORDER BY d.period DESC, d.project_id, d.merchant_id, ae.currency_code
        `)
        .bind(...filter.bindings)
    );
  }

  expenseDetails(filters: ReportFilters = {}): Promise<ExpenseDetailRow[]> {
    const expenseDetailsCte = this.expenseDetailsCteSql(filters);

    return all<ExpenseDetailRow>(
      this.db
        .prepare(`
          WITH ${expenseDetailsCte.sql}
          SELECT *
          FROM expense_detail_rows
          ORDER BY business_date DESC, document_id
        `)
        .bind(...expenseDetailsCte.bindings)
    );
  }

  expenseSummary(filters: ReportFilters = {}): Promise<ExpenseSummaryRow[]> {
    const expenseDetailsCte = this.expenseDetailsCteSql(filters);

    return all<ExpenseSummaryRow>(
      this.db
        .prepare(`
          WITH ${expenseDetailsCte.sql}
          SELECT
            period,
            project_id,
            category_id,
            report_person_id AS person_id,
            currency_code,
            COALESCE(SUM(amount_minor), 0) AS amount_minor,
            COALESCE(SUM(matched_usdt_cost_minor), 0) AS matched_usdt_cost_minor,
            COALESCE(SUM(pending_amount_minor), 0) AS pending_amount_minor
          FROM (
            SELECT
              *,
              COALESCE(person_id, borrower_person_id) AS report_person_id
            FROM expense_detail_rows
          ) expense_summary_rows
          GROUP BY period, project_id, category_id, report_person_id, currency_code
          ORDER BY period DESC, project_id, category_id, report_person_id, currency_code
        `)
        .bind(...expenseDetailsCte.bindings)
    );
  }

  projectProfitLoss(filters: ReportFilters = {}): Promise<ProjectProfitLossRow[]> {
    const projectProfitLossCte = this.projectProfitLossCteSql(filters);

    return all<ProjectProfitLossRow>(
      this.db
        .prepare(`
          WITH ${projectProfitLossCte.sql}
          SELECT *
          FROM project_profit_loss_rows
          ORDER BY period DESC, project_id
        `)
        .bind(...projectProfitLossCte.bindings)
    );
  }

  monthlyOperatingSummary(filters: ReportFilters = {}): Promise<MonthlyOperatingSummaryRow[]> {
    const projectProfitLossCte = this.projectProfitLossCteSql(filters);

    return all<MonthlyOperatingSummaryRow>(
      this.db
        .prepare(`
          WITH ${projectProfitLossCte.sql}
          SELECT
            period,
            COALESCE(SUM(income_usdt_minor), 0) AS income_usdt_minor,
            COALESCE(SUM(expense_usdt_minor), 0) AS expense_usdt_minor,
            COALESCE(SUM(pending_expense_minor), 0) AS pending_expense_minor,
            COALESCE(SUM(net_usdt_minor), 0) AS net_usdt_minor,
            CASE WHEN COALESCE(SUM(pending_expense_minor), 0) > 0 THEN 'incomplete' ELSE 'complete' END AS cost_status
          FROM project_profit_loss_rows
          GROUP BY period
          ORDER BY period DESC
        `)
        .bind(...projectProfitLossCte.bindings)
    );
  }

  exceptionChecks(filters: ReportFilters = {}): Promise<ExceptionCheckRow[]> {
    const staleDays =
      Number.isSafeInteger(filters.staleDays) && filters.staleDays !== undefined && filters.staleDays > 0
        ? filters.staleDays
        : 30;
    const pendingCostFilter = this.reportFilterSql(filters, {
      documentAlias: "d",
      personColumn: "pcm.person_id",
      currencyColumn: "pcm.currency_code"
    });
    const pettyCashFilter = this.reportFilterSql(filters, {
      documentAlias: "d",
      personColumn: "a.owner_person_id",
      currencyColumn: "ae.currency_code"
    });
    const companyAccountFilter = this.reportFilterSql(filters, {
      documentAlias: "d",
      currencyColumn: "ae.currency_code"
    });
    const pendingDocumentFilter = this.workflowDocumentFilterSql(filters);
    const draftDocumentFilter = this.workflowDocumentFilterSql(filters);
    const staleLoanFilter = this.reportFilterSql(filters, {
      documentAlias: "d",
      personColumn: "li.borrower_person_id",
      currencyColumn: "li.currency_code"
    });

    return all<ExceptionCheckRow>(
      this.db
        .prepare(`
          SELECT *
          FROM (
            SELECT
              'pending_cost' AS exception_type,
              'warning' AS severity,
              'pending_cost_match' AS entity_type,
              pcm.id AS entity_id,
              d.period AS period,
              pcm.expense_date AS business_date,
              pcm.currency_code AS currency_code,
              pcm.remaining_amount_minor AS amount_minor,
              NULL AS usdt_cost_minor,
              'Pending cost has unmatched USDT cost' AS message
            FROM pending_cost_matches pcm
            JOIN documents d ON d.id = pcm.document_id
            WHERE d.status = 'approved'
              AND pcm.status IN ('open', 'partial')
              AND pcm.remaining_amount_minor > 0
              ${pendingCostFilter.sql}

            UNION ALL

            SELECT
              'negative_petty_cash' AS exception_type,
              'warning' AS severity,
              'petty_cash_account' AS entity_type,
              ae.account_id AS entity_id,
              NULL AS period,
              NULL AS business_date,
              ae.currency_code AS currency_code,
              COALESCE(SUM(ae.amount_minor), 0) AS amount_minor,
              NULL AS usdt_cost_minor,
              'Petty cash account balance is negative' AS message
            FROM account_entries ae
            JOIN documents d ON d.id = ae.document_id
            JOIN accounts a ON a.id = ae.account_id
            WHERE d.status = 'approved'
              AND a.account_type = 'petty_cash'
              ${pettyCashFilter.sql}
            GROUP BY ae.account_id, a.owner_person_id, ae.currency_code
            HAVING COALESCE(SUM(ae.amount_minor), 0) < 0

            UNION ALL

            SELECT
              'negative_company_account' AS exception_type,
              'critical' AS severity,
              'account' AS entity_type,
              ae.account_id AS entity_id,
              NULL AS period,
              NULL AS business_date,
              ae.currency_code AS currency_code,
              COALESCE(SUM(ae.amount_minor), 0) AS amount_minor,
              NULL AS usdt_cost_minor,
              'Company account balance is negative' AS message
            FROM account_entries ae
            JOIN documents d ON d.id = ae.document_id
            JOIN accounts a ON a.id = ae.account_id
            WHERE d.status = 'approved'
              AND a.is_company_account = 1
              AND a.allow_negative = 0
              ${companyAccountFilter.sql}
            GROUP BY ae.account_id, ae.currency_code
            HAVING COALESCE(SUM(ae.amount_minor), 0) < 0

            UNION ALL

            SELECT
              'stale_pending_document' AS exception_type,
              'warning' AS severity,
              'document' AS entity_type,
              d.id AS entity_id,
              d.period AS period,
              d.business_date AS business_date,
              NULL AS currency_code,
              NULL AS amount_minor,
              NULL AS usdt_cost_minor,
              'Document has stayed pending beyond the stale threshold' AS message
            FROM documents d
            WHERE d.status = 'pending'
              ${pendingDocumentFilter.sql}
              AND julianday('now') - julianday(d.created_at) >= ?

            UNION ALL

            SELECT
              'stale_draft_document' AS exception_type,
              'info' AS severity,
              'document' AS entity_type,
              d.id AS entity_id,
              d.period AS period,
              d.business_date AS business_date,
              NULL AS currency_code,
              NULL AS amount_minor,
              NULL AS usdt_cost_minor,
              'Draft document has stayed open beyond the stale threshold' AS message
            FROM documents d
            WHERE d.status = 'draft'
              ${draftDocumentFilter.sql}
              AND julianday('now') - julianday(d.created_at) >= ?

            UNION ALL

            SELECT
              'stale_loan' AS exception_type,
              'warning' AS severity,
              'loan_item' AS entity_type,
              li.id AS entity_id,
              d.period AS period,
              li.loan_date AS business_date,
              li.currency_code AS currency_code,
              li.remaining_amount_minor AS amount_minor,
              li.remaining_usdt_cost_minor AS usdt_cost_minor,
              'Loan has remained open beyond the stale threshold' AS message
            FROM loan_items li
            JOIN documents d ON d.id = li.source_document_id
            WHERE d.status = 'approved'
              AND li.status IN ('open', 'partial')
              AND li.remaining_amount_minor > 0
              ${staleLoanFilter.sql}
              AND julianday('now') - julianday(li.loan_date) >= ?
          ) exception_rows
          ORDER BY
            CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,
            exception_type,
            business_date,
            entity_id
        `)
        .bind(
          ...pendingCostFilter.bindings,
          ...pettyCashFilter.bindings,
          ...companyAccountFilter.bindings,
          ...pendingDocumentFilter.bindings,
          staleDays,
          ...draftDocumentFilter.bindings,
          staleDays,
          ...staleLoanFilter.bindings,
          staleDays
        )
    );
  }

  pettyCashPendingMatches(): Promise<PettyCashPendingMatchRow[]> {
    return all<PettyCashPendingMatchRow>(
      this.db.prepare(`
        SELECT
          pcm.person_id AS person_id,
          pcm.account_id AS account_id,
          pcm.currency_code AS currency_code,
          SUM(pcm.remaining_amount_minor) AS remaining_amount_minor
        FROM pending_cost_matches pcm
        JOIN documents d ON d.id = pcm.document_id
        WHERE pcm.status IN ('open', 'partial') AND d.status = 'approved'
        GROUP BY pcm.person_id, pcm.account_id, pcm.currency_code
        ORDER BY pcm.person_id, pcm.account_id, pcm.currency_code
      `)
    );
  }

  loanBalances(): Promise<LoanBalanceRow[]> {
    return all<LoanBalanceRow>(
      this.db.prepare(`
        SELECT
          le.borrower_person_id AS borrower_person_id,
          le.currency_code AS currency_code,
          COALESCE(SUM(le.amount_minor), 0) AS balance_minor
        FROM loan_entries le
        JOIN documents d ON d.id = le.document_id
        WHERE d.status = 'approved'
        GROUP BY le.borrower_person_id, le.currency_code
        ORDER BY le.borrower_person_id, le.currency_code
      `)
    );
  }

  lotBalances(): Promise<LotBalanceRow[]> {
    return all<LotBalanceRow>(
      this.db.prepare(`
        SELECT
          id,
          currency_code,
          remaining_amount_minor,
          remaining_usdt_cost_minor,
          source_document_id,
          current_account_id,
          current_person_id,
          lot_date,
          status
        FROM lots
        WHERE remaining_amount_minor > 0
        ORDER BY current_account_id, currency_code, lot_date, id
      `)
    );
  }

  lotMovements(): Promise<LotMovementRow[]> {
    return all<LotMovementRow>(
      this.db.prepare(`
        SELECT
          id,
          lot_id,
          document_id,
          movement_type,
          from_account_id,
          to_account_id,
          from_person_id,
          to_person_id,
          amount_minor,
          usdt_cost_minor,
          movement_date,
          created_at
        FROM lot_movements
        ORDER BY movement_date DESC, created_at DESC
      `)
    );
  }

  pendingCostMatches(): Promise<PendingCostRow[]> {
    return all<PendingCostRow>(
      this.db.prepare(`
        SELECT
          pcm.id AS id,
          pcm.document_id AS document_id,
          pcm.person_id AS person_id,
          pcm.account_id AS account_id,
          pcm.currency_code AS currency_code,
          pcm.amount_minor AS amount_minor,
          pcm.remaining_amount_minor AS remaining_amount_minor,
          pcm.expense_date AS expense_date,
          pcm.status AS status,
          pcm.created_at AS created_at
        FROM pending_cost_matches pcm
        JOIN documents d ON d.id = pcm.document_id
        WHERE d.status = 'approved'
          AND pcm.status IN ('open', 'partial')
          AND pcm.remaining_amount_minor > 0
        ORDER BY pcm.expense_date, pcm.created_at
      `)
    );
  }

  loanAging(): Promise<LoanAgingRow[]> {
    return all<LoanAgingRow>(
      this.db.prepare(`
        SELECT
          li.id AS loan_item_id,
          li.source_document_id AS source_document_id,
          li.borrower_person_id AS borrower_person_id,
          li.currency_code AS currency_code,
          li.remaining_amount_minor AS remaining_amount_minor,
          li.remaining_usdt_cost_minor AS remaining_usdt_cost_minor,
          li.loan_date AS loan_date,
          CAST(julianday('now') - julianday(li.loan_date) AS INTEGER) AS age_days
        FROM loan_items li
        JOIN documents d ON d.id = li.source_document_id
        WHERE d.status = 'approved'
          AND li.status IN ('open', 'partial')
          AND li.remaining_amount_minor > 0
        ORDER BY li.loan_date, li.created_at, li.id
      `)
    );
  }

  loanAllocations(): Promise<LoanAllocationDetailRow[]> {
    return all<LoanAllocationDetailRow>(
      this.db.prepare(`
        SELECT
          la.id AS allocation_id,
          la.document_id AS document_id,
          la.loan_item_id AS loan_item_id,
          la.allocation_type AS allocation_type,
          li.borrower_person_id AS borrower_person_id,
          li.currency_code AS currency_code,
          la.amount_minor AS amount_minor,
          la.usdt_cost_minor AS usdt_cost_minor,
          la.allocation_date AS allocation_date
        FROM loan_allocations la
        JOIN loan_items li ON li.id = la.loan_item_id
        JOIN documents d ON d.id = la.document_id
        WHERE d.status = 'approved'
        ORDER BY la.allocation_date DESC, la.created_at DESC
      `)
    );
  }

  loanWriteoffs(): Promise<LoanWriteoffRow[]> {
    return all<LoanWriteoffRow>(
      this.db.prepare(`
        SELECT
          d.id AS document_id,
          li.borrower_person_id AS borrower_person_id,
          d.project_id AS project_id,
          d.category_id AS category_id,
          li.currency_code AS currency_code,
          SUM(la.amount_minor) AS amount_minor,
          SUM(la.usdt_cost_minor) AS usdt_cost_minor,
          la.allocation_date AS allocation_date
        FROM loan_allocations la
        JOIN loan_items li ON li.id = la.loan_item_id
        JOIN documents d ON d.id = la.document_id
        WHERE d.status = 'approved'
          AND d.document_type = 'loan_writeoff'
          AND la.allocation_type = 'writeoff'
          AND NOT EXISTS (
            SELECT 1
            FROM documents reversal
            WHERE reversal.original_document_id = d.id
              AND reversal.action_type = 'reversal'
              AND reversal.status = 'approved'
          )
        GROUP BY d.id, li.borrower_person_id, d.project_id, d.category_id, li.currency_code, la.allocation_date
        ORDER BY la.allocation_date DESC, d.id
      `)
    );
  }
}
