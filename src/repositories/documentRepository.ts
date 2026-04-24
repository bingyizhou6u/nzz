import { newId, nowIso, run } from "./db";
import type { ActionType, DocumentStatus, DocumentType } from "../domain/types";

export interface CreateDocumentInput {
  documentType: DocumentType;
  actionType: ActionType;
  businessDate: string;
  period: string;
  operatorPersonId?: string | null;
  projectId?: string | null;
  merchantId?: string | null;
  categoryId?: string | null;
  summary: string;
  createdBy: string;
}

export class DocumentRepository {
  constructor(private readonly db: D1Database) {}

  async createDraft(input: CreateDocumentInput): Promise<{ id: string; documentNo: string; status: DocumentStatus }> {
    const id = newId("doc");
    const documentNo = newId("docno");
    await run(
      this.db
        .prepare(
          `INSERT INTO documents (
            id, document_no, document_type, action_type, business_date, period,
            operator_person_id, project_id, merchant_id, category_id, summary,
            status, created_by, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`
        )
        .bind(
          id,
          documentNo,
          input.documentType,
          input.actionType,
          input.businessDate,
          input.period,
          input.operatorPersonId ?? null,
          input.projectId ?? null,
          input.merchantId ?? null,
          input.categoryId ?? null,
          input.summary,
          input.createdBy,
          nowIso()
        )
    );
    return { id, documentNo, status: "draft" };
  }
}
