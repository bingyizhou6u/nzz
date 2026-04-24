CREATE TABLE IF NOT EXISTS pending_cost_applications (
  id TEXT PRIMARY KEY,
  pending_cost_match_id TEXT NOT NULL,
  document_id TEXT NOT NULL,
  lot_id TEXT NOT NULL,
  amount_minor INTEGER NOT NULL,
  usdt_cost_minor INTEGER NOT NULL,
  application_date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (pending_cost_match_id) REFERENCES pending_cost_matches(id),
  FOREIGN KEY (document_id) REFERENCES documents(id),
  FOREIGN KEY (lot_id) REFERENCES lots(id)
);

CREATE INDEX IF NOT EXISTS idx_pending_cost_applications_pending
  ON pending_cost_applications(pending_cost_match_id, application_date, created_at);

CREATE INDEX IF NOT EXISTS idx_pending_cost_applications_document
  ON pending_cost_applications(document_id);
