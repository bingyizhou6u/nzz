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
        WHERE pcm.status = 'open' AND d.status = 'approved'
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
}
