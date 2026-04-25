PRAGMA foreign_keys = ON;

ALTER TABLE people ADD COLUMN login_email TEXT;
ALTER TABLE people ADD COLUMN access_subject TEXT;
ALTER TABLE people ADD COLUMN last_login_at TEXT;

CREATE UNIQUE INDEX idx_people_login_email
  ON people(login_email)
  WHERE login_email IS NOT NULL;

ALTER TABLE audit_logs ADD COLUMN actor_person_id TEXT;
ALTER TABLE audit_logs ADD COLUMN actor_email TEXT;
ALTER TABLE audit_logs ADD COLUMN request_id TEXT;
ALTER TABLE audit_logs ADD COLUMN ip_address TEXT;
ALTER TABLE audit_logs ADD COLUMN user_agent TEXT;

CREATE INDEX idx_documents_status_submitted_at
  ON documents(status, submitted_at);

CREATE INDEX idx_audit_logs_actor_person_id
  ON audit_logs(actor_person_id, created_at);
