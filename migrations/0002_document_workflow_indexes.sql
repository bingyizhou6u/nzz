CREATE INDEX IF NOT EXISTS idx_documents_status_created_at ON documents(status, created_at);
CREATE INDEX IF NOT EXISTS idx_documents_period_status ON documents(period, status);
CREATE INDEX IF NOT EXISTS idx_document_lines_document_id ON document_lines(document_id);
CREATE INDEX IF NOT EXISTS idx_account_entries_document_id ON account_entries(document_id);
CREATE INDEX IF NOT EXISTS idx_loan_entries_document_id ON loan_entries(document_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id, created_at);
