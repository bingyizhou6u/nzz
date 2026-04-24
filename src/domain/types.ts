export type DocumentStatus = "draft" | "pending" | "approved" | "rejected" | "void";
export type ActionType = "normal" | "correction" | "reversal" | "repost";

export type DocumentType =
  | "project_income"
  | "exchange"
  | "account_transfer"
  | "petty_cash_issue"
  | "petty_cash_return"
  | "petty_cash_reimbursement"
  | "loan_out"
  | "loan_repayment"
  | "loan_writeoff"
  | "manual_adjustment";

export type AccountType =
  | "usdt_wallet"
  | "usd_account"
  | "currency_reserve"
  | "public_account"
  | "petty_cash"
  | "temporary";

export interface MoneyAmount {
  currencyCode: string;
  amountMinor: number;
}

export interface Lot {
  id: string;
  currencyCode: string;
  remainingAmountMinor: number;
  remainingUsdtCostMinor: number;
  lotDate: string;
}

export interface LotAllocation {
  lotId: string;
  amountMinor: number;
  usdtCostMinor: number;
}
