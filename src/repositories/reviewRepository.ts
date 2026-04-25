import { all, first } from "./db";
import type { DocumentType } from "../domain/types";

export interface PendingReviewDocumentRow {
  id: string;
  document_no: string;
  document_type: DocumentType;
  business_date: string;
  period: string;
  submitted_at: string | null;
  summary: string;
  created_by: string;
  operator_person_id: string | null;
  project_id: string | null;
  merchant_id: string | null;
}

const pendingReviewDocumentFields = `
  id,
  document_no,
  document_type,
  business_date,
  period,
  submitted_at,
  summary,
  created_by,
  operator_person_id,
  project_id,
  merchant_id
`;

export class ReviewRepository {
  constructor(private readonly db: D1Database) {}

  listPending(): Promise<PendingReviewDocumentRow[]> {
    return all<PendingReviewDocumentRow>(
      this.db.prepare(`
        SELECT ${pendingReviewDocumentFields}
        FROM documents
        WHERE status = 'pending'
        ORDER BY submitted_at, business_date, document_no
      `)
    );
  }

  getPending(id: string): Promise<PendingReviewDocumentRow | null> {
    return first<PendingReviewDocumentRow>(
      this.db
        .prepare(`
          SELECT ${pendingReviewDocumentFields}
          FROM documents
          WHERE id = ? AND status = 'pending'
        `)
        .bind(id)
    );
  }
}
