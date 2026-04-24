CREATE TABLE IF NOT EXISTS loan_items (
  id TEXT PRIMARY KEY,
  source_document_id TEXT NOT NULL,
  source_line_id TEXT NOT NULL,
  borrower_person_id TEXT NOT NULL,
  currency_code TEXT NOT NULL,
  original_amount_minor INTEGER NOT NULL,
  remaining_amount_minor INTEGER NOT NULL,
  original_usdt_cost_minor INTEGER NOT NULL,
  remaining_usdt_cost_minor INTEGER NOT NULL,
  loan_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_document_id) REFERENCES documents(id),
  FOREIGN KEY (source_line_id) REFERENCES document_lines(id),
  FOREIGN KEY (borrower_person_id) REFERENCES people(id),
  FOREIGN KEY (currency_code) REFERENCES currencies(code)
);

CREATE TABLE IF NOT EXISTS loan_allocations (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  loan_item_id TEXT NOT NULL,
  allocation_type TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  usdt_cost_minor INTEGER NOT NULL,
  allocation_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES documents(id),
  FOREIGN KEY (loan_item_id) REFERENCES loan_items(id)
);

CREATE INDEX IF NOT EXISTS idx_loan_items_open_fifo
  ON loan_items(borrower_person_id, currency_code, status, loan_date, created_at, id);

CREATE INDEX IF NOT EXISTS idx_loan_items_source_document
  ON loan_items(source_document_id);

CREATE INDEX IF NOT EXISTS idx_loan_allocations_document
  ON loan_allocations(document_id);

CREATE INDEX IF NOT EXISTS idx_loan_allocations_item_created
  ON loan_allocations(loan_item_id, created_at, id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_one_approved_reversal_per_original
  ON documents(original_document_id)
  WHERE action_type = 'reversal' AND status = 'approved' AND original_document_id IS NOT NULL;
