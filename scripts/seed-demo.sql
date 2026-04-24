PRAGMA foreign_keys = ON;

INSERT INTO people (id, name, alias, roles_json, is_enabled, created_at)
VALUES
  ('demo_person_finance', '演示财务主管', 'finance-demo', '["finance_manager"]', 1, '2026-04-24T00:00:00.000Z'),
  ('demo_person_ops', '演示后勤 Bob', 'ops-demo', '["logistics"]', 1, '2026-04-24T00:00:00.000Z'),
  ('demo_person_borrower', '演示借款人 Carol', 'borrower-demo', '["borrower"]', 1, '2026-04-24T00:00:00.000Z')
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  alias = excluded.alias,
  roles_json = excluded.roles_json,
  is_enabled = excluded.is_enabled;

INSERT INTO projects (id, code, name, owner_person_id, status, note, created_at)
VALUES
  ('demo_project_alpha', 'P-DEMO-001', '演示项目 Alpha', 'demo_person_finance', 'active', '演示数据：项目收入来自商户', '2026-04-24T00:00:00.000Z')
ON CONFLICT(id) DO UPDATE SET
  code = excluded.code,
  name = excluded.name,
  owner_person_id = excluded.owner_person_id,
  status = excluded.status,
  note = excluded.note;

INSERT INTO merchants (id, code, name, project_id, merchant_type, launch_date, status, owner_person_id, note, created_at)
VALUES
  ('demo_merchant_alpha', 'M-DEMO-001', '演示商户 Alpha', 'demo_project_alpha', 'site', '2026-04-01', 'active', 'demo_person_finance', '演示数据：原站点字段统一为商户', '2026-04-24T00:00:00.000Z')
ON CONFLICT(id) DO UPDATE SET
  code = excluded.code,
  name = excluded.name,
  project_id = excluded.project_id,
  merchant_type = excluded.merchant_type,
  launch_date = excluded.launch_date,
  status = excluded.status,
  owner_person_id = excluded.owner_person_id,
  note = excluded.note;

INSERT INTO accounts (id, name, account_type, currency_code, owner_person_id, is_company_account, allow_negative, status, created_at)
VALUES
  ('demo_acct_usdt_main', '演示 USDT 主钱包', 'usdt_wallet', 'USDT', NULL, 1, 0, 'active', '2026-04-24T00:00:00.000Z'),
  ('demo_acct_aed_reserve', '演示 AED 储备金', 'currency_reserve', 'AED', NULL, 1, 0, 'active', '2026-04-24T00:00:00.000Z'),
  ('demo_acct_petty_bob', '演示 Bob AED 备用金', 'petty_cash', 'AED', 'demo_person_ops', 0, 1, 'active', '2026-04-24T00:00:00.000Z')
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  account_type = excluded.account_type,
  currency_code = excluded.currency_code,
  owner_person_id = excluded.owner_person_id,
  is_company_account = excluded.is_company_account,
  allow_negative = excluded.allow_negative,
  status = excluded.status;

INSERT INTO categories (
  id, name, parent_id, category_type, direction, affects_expense_report,
  affects_project_report, requires_merchant, requires_person, requires_borrower, is_enabled
)
VALUES
  ('demo_cat_project_income', '演示项目收入', NULL, 'income', 'in', 0, 1, 1, 0, 0, 1),
  ('demo_cat_daily_expense', '演示日常支出', NULL, 'expense', 'out', 1, 0, 0, 1, 0, 1),
  ('demo_cat_exchange', '演示换汇', NULL, 'exchange', 'neutral', 0, 0, 0, 0, 0, 1),
  ('demo_cat_loan', '演示借款', NULL, 'loan', 'out', 0, 0, 0, 0, 1, 1)
ON CONFLICT(id) DO UPDATE SET
  name = excluded.name,
  category_type = excluded.category_type,
  direction = excluded.direction,
  affects_expense_report = excluded.affects_expense_report,
  affects_project_report = excluded.affects_project_report,
  requires_merchant = excluded.requires_merchant,
  requires_person = excluded.requires_person,
  requires_borrower = excluded.requires_borrower,
  is_enabled = excluded.is_enabled;

INSERT INTO documents (
  id, document_no, document_type, action_type, business_date, period,
  operator_person_id, project_id, merchant_id, category_id, summary,
  status, original_document_id, created_by, created_at, submitted_at,
  reviewed_by, reviewed_at, reject_reason, voided_at
)
VALUES
  ('demo_doc_income_1', 'DEMO-INC-001', 'project_income', 'normal', '2026-04-20', '2026-04', 'demo_person_finance', 'demo_project_alpha', 'demo_merchant_alpha', 'demo_cat_project_income', '演示商户 Alpha 项目收入 5000 USDT', 'approved', NULL, 'demo_seed', '2026-04-20T08:00:00.000Z', '2026-04-20T08:10:00.000Z', 'demo_person_finance', '2026-04-20T08:20:00.000Z', NULL, NULL),
  ('demo_doc_income_reversal', 'DEMO-REV-001', 'project_income', 'reversal', '2026-04-21', '2026-04', 'demo_person_finance', 'demo_project_alpha', 'demo_merchant_alpha', 'demo_cat_project_income', '演示冲正部分项目收入 2500 USDT', 'approved', 'demo_doc_income_1', 'demo_seed', '2026-04-21T08:00:00.000Z', '2026-04-21T08:10:00.000Z', 'demo_person_finance', '2026-04-21T08:20:00.000Z', NULL, NULL),
  ('demo_doc_exchange_1', 'DEMO-FX-001', 'exchange', 'normal', '2026-04-21', '2026-04', 'demo_person_finance', NULL, NULL, 'demo_cat_exchange', '演示 1000 USDT 换汇为 3670 AED 储备金', 'approved', NULL, 'demo_seed', '2026-04-21T09:00:00.000Z', '2026-04-21T09:10:00.000Z', 'demo_person_finance', '2026-04-21T09:20:00.000Z', NULL, NULL),
  ('demo_doc_petty_issue_1', 'DEMO-PC-ISSUE-001', 'petty_cash_issue', 'normal', '2026-04-22', '2026-04', 'demo_person_ops', NULL, NULL, 'demo_cat_daily_expense', '演示向 Bob 发放 2000 AED 备用金', 'approved', NULL, 'demo_seed', '2026-04-22T08:00:00.000Z', '2026-04-22T08:10:00.000Z', 'demo_person_finance', '2026-04-22T08:20:00.000Z', NULL, NULL),
  ('demo_doc_petty_reim_1', 'DEMO-PC-REIM-001', 'petty_cash_reimbursement', 'normal', '2026-04-23', '2026-04', 'demo_person_ops', 'demo_project_alpha', NULL, 'demo_cat_daily_expense', '演示 Bob 报销 2150 AED，备用金形成 -150 AED 待补足', 'approved', NULL, 'demo_seed', '2026-04-23T08:00:00.000Z', '2026-04-23T08:10:00.000Z', 'demo_person_finance', '2026-04-23T08:20:00.000Z', NULL, NULL),
  ('demo_doc_loan_out_1', 'DEMO-LOAN-OUT-001', 'loan_out', 'normal', '2026-04-23', '2026-04', 'demo_person_finance', NULL, NULL, 'demo_cat_loan', '演示向 Carol 借出 1200 USDT', 'approved', NULL, 'demo_seed', '2026-04-23T09:00:00.000Z', '2026-04-23T09:10:00.000Z', 'demo_person_finance', '2026-04-23T09:20:00.000Z', NULL, NULL),
  ('demo_doc_loan_repay_1', 'DEMO-LOAN-REPAY-001', 'loan_repayment', 'normal', '2026-04-24', '2026-04', 'demo_person_finance', NULL, NULL, 'demo_cat_loan', '演示 Carol 归还 200 USDT', 'approved', NULL, 'demo_seed', '2026-04-24T09:00:00.000Z', '2026-04-24T09:10:00.000Z', 'demo_person_finance', '2026-04-24T09:20:00.000Z', NULL, NULL),
  ('demo_doc_draft_noise', 'DEMO-DRAFT-001', 'manual_adjustment', 'normal', '2026-04-24', '2026-04', 'demo_person_finance', NULL, NULL, NULL, '演示草稿：即使存在测试分录也不进入正式报表', 'draft', NULL, 'demo_seed', '2026-04-24T10:00:00.000Z', NULL, NULL, NULL, NULL, NULL)
ON CONFLICT(id) DO UPDATE SET
  document_no = excluded.document_no,
  document_type = excluded.document_type,
  action_type = excluded.action_type,
  business_date = excluded.business_date,
  period = excluded.period,
  operator_person_id = excluded.operator_person_id,
  project_id = excluded.project_id,
  merchant_id = excluded.merchant_id,
  category_id = excluded.category_id,
  summary = excluded.summary,
  status = excluded.status,
  original_document_id = excluded.original_document_id,
  created_by = excluded.created_by,
  submitted_at = excluded.submitted_at,
  reviewed_by = excluded.reviewed_by,
  reviewed_at = excluded.reviewed_at,
  reject_reason = excluded.reject_reason,
  voided_at = excluded.voided_at;

INSERT INTO document_lines (
  id, document_id, line_no, line_type, account_id, counterparty_account_id,
  person_id, borrower_person_id, currency_code, amount_minor, usdt_amount_minor,
  exchange_rate_text, note
)
VALUES
  ('demo_line_income_1', 'demo_doc_income_1', 1, 'income', 'demo_acct_usdt_main', NULL, NULL, NULL, 'USDT', 500000, 500000, NULL, '演示收入'),
  ('demo_line_income_reversal', 'demo_doc_income_reversal', 1, 'income_reversal', 'demo_acct_usdt_main', NULL, NULL, NULL, 'USDT', 250000, 250000, NULL, '演示冲正'),
  ('demo_line_exchange_1', 'demo_doc_exchange_1', 1, 'exchange_in', 'demo_acct_aed_reserve', 'demo_acct_usdt_main', NULL, NULL, 'AED', 367000, 100000, '3.6700', '演示换汇批次'),
  ('demo_line_petty_issue_1', 'demo_doc_petty_issue_1', 1, 'petty_cash_issue', 'demo_acct_aed_reserve', 'demo_acct_petty_bob', 'demo_person_ops', NULL, 'AED', 200000, 54496, NULL, '演示备用金发放'),
  ('demo_line_petty_reim_1', 'demo_doc_petty_reim_1', 1, 'petty_cash_reimbursement', 'demo_acct_petty_bob', NULL, 'demo_person_ops', NULL, 'AED', 215000, 58583, NULL, '演示备用金报销，含待补足'),
  ('demo_line_loan_out_1', 'demo_doc_loan_out_1', 1, 'loan_out', 'demo_acct_usdt_main', NULL, NULL, 'demo_person_borrower', 'USDT', 120000, 120000, NULL, '演示借出'),
  ('demo_line_loan_repay_1', 'demo_doc_loan_repay_1', 1, 'loan_repayment', 'demo_acct_usdt_main', NULL, NULL, 'demo_person_borrower', 'USDT', 20000, 20000, NULL, '演示还款'),
  ('demo_line_draft_noise', 'demo_doc_draft_noise', 1, 'manual_adjustment', 'demo_acct_usdt_main', NULL, NULL, NULL, 'USDT', 999999, 999999, NULL, '草稿分录不应进入正式报表')
ON CONFLICT(id) DO UPDATE SET
  document_id = excluded.document_id,
  line_no = excluded.line_no,
  line_type = excluded.line_type,
  account_id = excluded.account_id,
  counterparty_account_id = excluded.counterparty_account_id,
  person_id = excluded.person_id,
  borrower_person_id = excluded.borrower_person_id,
  currency_code = excluded.currency_code,
  amount_minor = excluded.amount_minor,
  usdt_amount_minor = excluded.usdt_amount_minor,
  exchange_rate_text = excluded.exchange_rate_text,
  note = excluded.note;

INSERT INTO lots (
  id, currency_code, original_amount_minor, remaining_amount_minor,
  original_usdt_cost_minor, remaining_usdt_cost_minor, source_document_id,
  current_account_id, current_person_id, lot_date, status, created_at
)
VALUES
  ('demo_lot_aed_1', 'AED', 367000, 152000, 100000, 41417, 'demo_doc_exchange_1', 'demo_acct_aed_reserve', NULL, '2026-04-21', 'open', '2026-04-21T09:20:00.000Z')
ON CONFLICT(id) DO UPDATE SET
  currency_code = excluded.currency_code,
  original_amount_minor = excluded.original_amount_minor,
  remaining_amount_minor = excluded.remaining_amount_minor,
  original_usdt_cost_minor = excluded.original_usdt_cost_minor,
  remaining_usdt_cost_minor = excluded.remaining_usdt_cost_minor,
  source_document_id = excluded.source_document_id,
  current_account_id = excluded.current_account_id,
  current_person_id = excluded.current_person_id,
  lot_date = excluded.lot_date,
  status = excluded.status;

INSERT INTO lot_movements (
  id, lot_id, document_id, movement_type, from_account_id, to_account_id,
  from_person_id, to_person_id, amount_minor, usdt_cost_minor, movement_date, created_at
)
VALUES
  ('demo_lot_move_fx_in', 'demo_lot_aed_1', 'demo_doc_exchange_1', 'exchange_in', NULL, 'demo_acct_aed_reserve', NULL, NULL, 367000, 100000, '2026-04-21', '2026-04-21T09:20:00.000Z'),
  ('demo_lot_move_petty_issue', 'demo_lot_aed_1', 'demo_doc_petty_issue_1', 'petty_cash_issue', 'demo_acct_aed_reserve', 'demo_acct_petty_bob', NULL, 'demo_person_ops', 200000, 54496, '2026-04-22', '2026-04-22T08:20:00.000Z'),
  ('demo_lot_move_petty_reim', 'demo_lot_aed_1', 'demo_doc_petty_reim_1', 'petty_cash_reimbursement', 'demo_acct_petty_bob', NULL, 'demo_person_ops', NULL, 200000, 54496, '2026-04-23', '2026-04-23T08:20:00.000Z')
ON CONFLICT(id) DO UPDATE SET
  lot_id = excluded.lot_id,
  document_id = excluded.document_id,
  movement_type = excluded.movement_type,
  from_account_id = excluded.from_account_id,
  to_account_id = excluded.to_account_id,
  from_person_id = excluded.from_person_id,
  to_person_id = excluded.to_person_id,
  amount_minor = excluded.amount_minor,
  usdt_cost_minor = excluded.usdt_cost_minor,
  movement_date = excluded.movement_date;

INSERT INTO pending_cost_matches (
  id, document_id, person_id, account_id, currency_code, amount_minor,
  remaining_amount_minor, expense_date, status, created_at
)
VALUES
  ('demo_pending_bob_aed_1', 'demo_doc_petty_reim_1', 'demo_person_ops', 'demo_acct_petty_bob', 'AED', 15000, 15000, '2026-04-23', 'open', '2026-04-23T08:20:00.000Z')
ON CONFLICT(id) DO UPDATE SET
  document_id = excluded.document_id,
  person_id = excluded.person_id,
  account_id = excluded.account_id,
  currency_code = excluded.currency_code,
  amount_minor = excluded.amount_minor,
  remaining_amount_minor = excluded.remaining_amount_minor,
  expense_date = excluded.expense_date,
  status = excluded.status;

INSERT INTO account_entries (id, document_id, account_id, currency_code, amount_minor, entry_date, created_at)
VALUES
  ('demo_ae_income_1', 'demo_doc_income_1', 'demo_acct_usdt_main', 'USDT', 500000, '2026-04-20', '2026-04-20T08:20:00.000Z'),
  ('demo_ae_income_reversal', 'demo_doc_income_reversal', 'demo_acct_usdt_main', 'USDT', -250000, '2026-04-21', '2026-04-21T08:20:00.000Z'),
  ('demo_ae_exchange_usdt', 'demo_doc_exchange_1', 'demo_acct_usdt_main', 'USDT', -100000, '2026-04-21', '2026-04-21T09:20:00.000Z'),
  ('demo_ae_exchange_aed', 'demo_doc_exchange_1', 'demo_acct_aed_reserve', 'AED', 367000, '2026-04-21', '2026-04-21T09:20:00.000Z'),
  ('demo_ae_petty_issue_reserve', 'demo_doc_petty_issue_1', 'demo_acct_aed_reserve', 'AED', -200000, '2026-04-22', '2026-04-22T08:20:00.000Z'),
  ('demo_ae_petty_issue_bob', 'demo_doc_petty_issue_1', 'demo_acct_petty_bob', 'AED', 200000, '2026-04-22', '2026-04-22T08:20:00.000Z'),
  ('demo_ae_petty_reim_bob', 'demo_doc_petty_reim_1', 'demo_acct_petty_bob', 'AED', -215000, '2026-04-23', '2026-04-23T08:20:00.000Z'),
  ('demo_ae_loan_out_usdt', 'demo_doc_loan_out_1', 'demo_acct_usdt_main', 'USDT', -120000, '2026-04-23', '2026-04-23T09:20:00.000Z'),
  ('demo_ae_loan_repay_usdt', 'demo_doc_loan_repay_1', 'demo_acct_usdt_main', 'USDT', 20000, '2026-04-24', '2026-04-24T09:20:00.000Z'),
  ('demo_ae_draft_noise', 'demo_doc_draft_noise', 'demo_acct_usdt_main', 'USDT', 999999, '2026-04-24', '2026-04-24T10:00:00.000Z')
ON CONFLICT(id) DO UPDATE SET
  document_id = excluded.document_id,
  account_id = excluded.account_id,
  currency_code = excluded.currency_code,
  amount_minor = excluded.amount_minor,
  entry_date = excluded.entry_date;

INSERT INTO loan_entries (id, document_id, borrower_person_id, currency_code, amount_minor, usdt_cost_minor, entry_date, created_at)
VALUES
  ('demo_le_loan_out_1', 'demo_doc_loan_out_1', 'demo_person_borrower', 'USDT', 120000, 120000, '2026-04-23', '2026-04-23T09:20:00.000Z'),
  ('demo_le_loan_repay_1', 'demo_doc_loan_repay_1', 'demo_person_borrower', 'USDT', -20000, -20000, '2026-04-24', '2026-04-24T09:20:00.000Z')
ON CONFLICT(id) DO UPDATE SET
  document_id = excluded.document_id,
  borrower_person_id = excluded.borrower_person_id,
  currency_code = excluded.currency_code,
  amount_minor = excluded.amount_minor,
  usdt_cost_minor = excluded.usdt_cost_minor,
  entry_date = excluded.entry_date;
