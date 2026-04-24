PRAGMA foreign_keys = ON;

CREATE TABLE currencies (
  code TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  minor_units INTEGER NOT NULL DEFAULT 2,
  is_enabled INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  alias TEXT,
  roles_json TEXT NOT NULL,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  owner_person_id TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (owner_person_id) REFERENCES people(id)
);

CREATE TABLE merchants (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  project_id TEXT NOT NULL,
  merchant_type TEXT,
  launch_date TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  owner_person_id TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (owner_person_id) REFERENCES people(id)
);

CREATE TABLE accounts (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  owner_person_id TEXT,
  is_company_account INTEGER NOT NULL DEFAULT 1,
  allow_negative INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  FOREIGN KEY (currency_code) REFERENCES currencies(code),
  FOREIGN KEY (owner_person_id) REFERENCES people(id)
);

CREATE TABLE categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  parent_id TEXT,
  category_type TEXT NOT NULL,
  direction TEXT NOT NULL,
  affects_expense_report INTEGER NOT NULL DEFAULT 0,
  affects_project_report INTEGER NOT NULL DEFAULT 0,
  requires_merchant INTEGER NOT NULL DEFAULT 0,
  requires_person INTEGER NOT NULL DEFAULT 0,
  requires_borrower INTEGER NOT NULL DEFAULT 0,
  is_enabled INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY (parent_id) REFERENCES categories(id)
);

CREATE TABLE documents (
  id TEXT PRIMARY KEY,
  document_no TEXT NOT NULL UNIQUE,
  document_type TEXT NOT NULL,
  action_type TEXT NOT NULL DEFAULT 'normal',
  business_date TEXT NOT NULL,
  period TEXT NOT NULL,
  operator_person_id TEXT,
  project_id TEXT,
  merchant_id TEXT,
  category_id TEXT,
  summary TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  original_document_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  submitted_at TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  reject_reason TEXT,
  voided_at TEXT,
  FOREIGN KEY (operator_person_id) REFERENCES people(id),
  FOREIGN KEY (project_id) REFERENCES projects(id),
  FOREIGN KEY (merchant_id) REFERENCES merchants(id),
  FOREIGN KEY (category_id) REFERENCES categories(id),
  FOREIGN KEY (original_document_id) REFERENCES documents(id)
);

CREATE TABLE document_lines (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  line_no INTEGER NOT NULL,
  line_type TEXT NOT NULL,
  account_id TEXT,
  counterparty_account_id TEXT,
  person_id TEXT,
  borrower_person_id TEXT,
  currency_code TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  usdt_amount_minor INTEGER,
  exchange_rate_text TEXT,
  note TEXT,
  FOREIGN KEY (document_id) REFERENCES documents(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (counterparty_account_id) REFERENCES accounts(id),
  FOREIGN KEY (person_id) REFERENCES people(id),
  FOREIGN KEY (borrower_person_id) REFERENCES people(id),
  FOREIGN KEY (currency_code) REFERENCES currencies(code)
);

CREATE TABLE lots (
  id TEXT PRIMARY KEY,
  currency_code TEXT NOT NULL,
  original_amount_minor INTEGER NOT NULL,
  remaining_amount_minor INTEGER NOT NULL,
  original_usdt_cost_minor INTEGER NOT NULL,
  remaining_usdt_cost_minor INTEGER NOT NULL,
  source_document_id TEXT NOT NULL,
  current_account_id TEXT NOT NULL,
  current_person_id TEXT,
  lot_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  FOREIGN KEY (currency_code) REFERENCES currencies(code),
  FOREIGN KEY (source_document_id) REFERENCES documents(id),
  FOREIGN KEY (current_account_id) REFERENCES accounts(id),
  FOREIGN KEY (current_person_id) REFERENCES people(id)
);

CREATE TABLE lot_movements (
  id TEXT PRIMARY KEY,
  lot_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  movement_type TEXT NOT NULL,
  from_account_id TEXT,
  to_account_id TEXT,
  from_person_id TEXT,
  to_person_id TEXT,
  amount_minor INTEGER NOT NULL,
  usdt_cost_minor INTEGER NOT NULL,
  movement_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (lot_id) REFERENCES lots(id),
  FOREIGN KEY (document_id) REFERENCES documents(id)
);

CREATE TABLE pending_cost_matches (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  remaining_amount_minor INTEGER NOT NULL,
  expense_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id),
  FOREIGN KEY (person_id) REFERENCES people(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (currency_code) REFERENCES currencies(code)
);

CREATE TABLE account_entries (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  account_id TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  entry_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id),
  FOREIGN KEY (account_id) REFERENCES accounts(id),
  FOREIGN KEY (currency_code) REFERENCES currencies(code)
);

CREATE TABLE loan_entries (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  borrower_person_id TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  usdt_cost_minor INTEGER,
  entry_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id),
  FOREIGN KEY (borrower_person_id) REFERENCES people(id),
  FOREIGN KEY (currency_code) REFERENCES currencies(code)
);

CREATE TABLE period_locks (
  period TEXT PRIMARY KEY,
  locked_by TEXT NOT NULL,
  locked_at TEXT NOT NULL,
  note TEXT
);

CREATE TABLE audit_logs (
  id TEXT PRIMARY KEY,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  before_json TEXT,
  after_json TEXT,
  reason TEXT,
  created_at TEXT NOT NULL
);

INSERT INTO currencies (code, name, minor_units, is_enabled) VALUES
  ('USDT', 'USDT', 2, 1),
  ('AED', '迪拉姆', 2, 1),
  ('USD', '美元', 2, 1),
  ('JPY', '日元', 0, 1),
  ('LKR', '兰卡卢比', 2, 1),
  ('RMB', '人民币', 2, 1),
  ('AMD', '亚美尼亚德拉姆', 2, 1),
  ('THB', '泰铢', 2, 1);
