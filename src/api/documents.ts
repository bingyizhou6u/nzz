import { DocumentRepository } from "../repositories/documentRepository";
import type { ActionType, DocumentType } from "../domain/types";
import type { Handler } from "../worker/env";

const requiredDocumentFieldsResponse = () =>
  Response.json(
    { error: "documentType, businessDate, period, summary, and createdBy are required" },
    { status: 400 }
  );

export const createDocument: Handler = async ({ request, env }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return requiredDocumentFieldsResponse();
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return requiredDocumentFieldsResponse();
  }

  const {
    documentType,
    actionType,
    businessDate,
    period,
    operatorPersonId,
    projectId,
    merchantId,
    categoryId,
    summary,
    createdBy
  } = body as {
    documentType?: unknown;
    actionType?: unknown;
    businessDate?: unknown;
    period?: unknown;
    operatorPersonId?: unknown;
    projectId?: unknown;
    merchantId?: unknown;
    categoryId?: unknown;
    summary?: unknown;
    createdBy?: unknown;
  };

  if (
    typeof documentType !== "string" ||
    typeof businessDate !== "string" ||
    typeof period !== "string" ||
    typeof summary !== "string" ||
    typeof createdBy !== "string" ||
    !documentType.trim() ||
    !businessDate.trim() ||
    !period.trim() ||
    !summary.trim() ||
    !createdBy.trim()
  ) {
    return requiredDocumentFieldsResponse();
  }

  const repo = new DocumentRepository(env.DB);
  const document = await repo.createDraft({
    documentType: documentType as DocumentType,
    actionType: typeof actionType === "string" ? (actionType as ActionType) : "normal",
    businessDate,
    period,
    operatorPersonId: typeof operatorPersonId === "string" ? operatorPersonId : null,
    projectId: typeof projectId === "string" ? projectId : null,
    merchantId: typeof merchantId === "string" ? merchantId : null,
    categoryId: typeof categoryId === "string" ? categoryId : null,
    summary,
    createdBy
  });
  return Response.json({ data: document }, { status: 201 });
};
