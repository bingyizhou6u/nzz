import { DocumentRepository } from "../repositories/documentRepository";
import type { ActionType, DocumentType } from "../domain/types";
import type { Handler } from "../worker/env";

const requiredDocumentFieldsResponse = () =>
  Response.json(
    { error: "documentType, businessDate, period, summary, and createdBy are required" },
    { status: 400 }
  );

const invalidDocumentTypeOrActionTypeResponse = () =>
  Response.json({ error: "Invalid document type or action type" }, { status: 400 });

const documentTypes = new Set<DocumentType>([
  "project_income",
  "exchange",
  "account_transfer",
  "petty_cash_issue",
  "petty_cash_return",
  "petty_cash_reimbursement",
  "loan_out",
  "loan_repayment",
  "loan_writeoff",
  "manual_adjustment"
]);

const actionTypes = new Set<ActionType>(["normal", "correction", "reversal", "repost"]);

function isDocumentType(value: string): value is DocumentType {
  return documentTypes.has(value as DocumentType);
}

function isActionType(value: string): value is ActionType {
  return actionTypes.has(value as ActionType);
}

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

  if (!isDocumentType(documentType)) {
    return invalidDocumentTypeOrActionTypeResponse();
  }

  const normalizedActionType = typeof actionType === "string" ? actionType : "normal";
  if (!isActionType(normalizedActionType)) {
    return invalidDocumentTypeOrActionTypeResponse();
  }

  const repo = new DocumentRepository(env.DB);
  const document = await repo.createDraft({
    documentType,
    actionType: normalizedActionType,
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
