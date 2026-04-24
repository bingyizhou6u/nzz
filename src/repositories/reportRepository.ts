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

export class ReportRepository {
  constructor(private readonly db: D1Database) {}

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
}
