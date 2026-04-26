export interface AccountBalance {
  account_id: string;
  currency_code: string;
  balance_minor: number;
}

export interface PettyCashPending {
  person_id: string;
  account_id: string;
  currency_code: string;
  remaining_amount_minor: number;
}

export interface LoanBalance {
  borrower_person_id: string;
  currency_code: string;
  balance_minor: number;
}

export interface LoanAging {
  loan_item_id: string;
  source_document_id: string;
  borrower_person_id: string;
  currency_code: string;
  remaining_amount_minor: number;
  remaining_usdt_cost_minor: number;
  loan_date: string;
  age_days: number;
}

export interface LoanAllocation {
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

export interface LoanWriteoff {
  document_id: string;
  borrower_person_id: string;
  project_id: string | null;
  category_id: string | null;
  currency_code: string;
  amount_minor: number;
  usdt_cost_minor: number;
  allocation_date: string;
}

export interface LotBalance {
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

export interface LotMovement {
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

export interface PendingCost {
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

export interface ProjectIncome {
  period: string;
  project_id: string | null;
  merchant_id: string | null;
  category_id: string | null;
  currency_code: string;
  income_amount_minor: number;
  income_usdt_minor: number;
}

export interface MerchantIncome {
  period: string;
  project_id: string | null;
  merchant_id: string | null;
  currency_code: string;
  income_amount_minor: number;
  income_usdt_minor: number;
}

export interface ExpenseDetail {
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

export interface ExpenseSummary {
  period: string;
  project_id: string | null;
  category_id: string | null;
  person_id: string | null;
  currency_code: string;
  amount_minor: number;
  matched_usdt_cost_minor: number;
  pending_amount_minor: number;
}

export interface ProjectProfitLoss {
  period: string;
  project_id: string | null;
  income_usdt_minor: number;
  expense_usdt_minor: number;
  pending_expense_minor: number;
  net_usdt_minor: number;
  cost_status: "complete" | "incomplete";
}

export interface MonthlyOperatingSummary {
  period: string;
  income_usdt_minor: number;
  expense_usdt_minor: number;
  pending_expense_minor: number;
  net_usdt_minor: number;
  cost_status: "complete" | "incomplete";
}

export interface ExceptionCheck {
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

export interface ReportsState {
  projectProfitLoss: ProjectProfitLoss[];
  projectIncome: ProjectIncome[];
  merchantIncome: MerchantIncome[];
  expenseDetails: ExpenseDetail[];
  expenseSummary: ExpenseSummary[];
  monthlyOperatingSummary: MonthlyOperatingSummary[];
  accountBalances: AccountBalance[];
  lotBalances: LotBalance[];
  lotMovements: LotMovement[];
  pettyCashPending: PettyCashPending[];
  pendingCosts: PendingCost[];
  loanBalances: LoanBalance[];
  loanAging: LoanAging[];
  loanAllocations: LoanAllocation[];
  loanWriteoffs: LoanWriteoff[];
  exceptionChecks: ExceptionCheck[];
}

export interface MonthCloseSnapshot {
  id: string;
  period: string;
  version: number;
  run_id: string;
  locked_by: string;
  locked_at: string;
  note: string;
  summary_json: string;
}

export interface MonthCloseReportSnapshot<T = object> {
  id: string;
  snapshot_id: string;
  report_key: string;
  row_count: number;
  data_json?: string;
  rows: T[];
  created_at: string;
}

export interface MonthCloseReportSnapshotResponse<T = object> {
  snapshot: MonthCloseSnapshot;
  report: MonthCloseReportSnapshot<T>;
}

export const emptyReports: ReportsState = {
  projectProfitLoss: [],
  projectIncome: [],
  merchantIncome: [],
  expenseDetails: [],
  expenseSummary: [],
  monthlyOperatingSummary: [],
  accountBalances: [],
  lotBalances: [],
  lotMovements: [],
  pettyCashPending: [],
  pendingCosts: [],
  loanBalances: [],
  loanAging: [],
  loanAllocations: [],
  loanWriteoffs: [],
  exceptionChecks: []
};
