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
          account_id,
          currency_code,
          COALESCE(SUM(amount_minor), 0) AS balance_minor
        FROM account_entries
        GROUP BY account_id, currency_code
        ORDER BY account_id, currency_code
      `)
    );
  }

  pettyCashPendingMatches(): Promise<PettyCashPendingMatchRow[]> {
    return all<PettyCashPendingMatchRow>(
      this.db.prepare(`
        SELECT
          person_id,
          account_id,
          currency_code,
          SUM(remaining_amount_minor) AS remaining_amount_minor
        FROM pending_cost_matches
        WHERE status = 'open'
        GROUP BY person_id, account_id, currency_code
        ORDER BY person_id, account_id, currency_code
      `)
    );
  }

  loanBalances(): Promise<LoanBalanceRow[]> {
    return all<LoanBalanceRow>(
      this.db.prepare(`
        SELECT
          borrower_person_id,
          currency_code,
          COALESCE(SUM(amount_minor), 0) AS balance_minor
        FROM loan_entries
        GROUP BY borrower_person_id, currency_code
        ORDER BY borrower_person_id, currency_code
      `)
    );
  }
}
