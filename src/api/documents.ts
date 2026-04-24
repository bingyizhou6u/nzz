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

const invalidBusinessDateOrPeriodResponse = () =>
  Response.json({ error: "Invalid business date or period" }, { status: 400 });

const requiredOriginalDocumentResponse = () =>
  Response.json({ error: "originalDocumentId is required for correction or reversal" }, { status: 400 });

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

function isValidBusinessDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;

  const [yearText, monthText, dayText] = value.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function isValidPeriod(value: string) {
  if (!/^\d{4}-\d{2}$/.test(value)) return false;

  const month = Number(value.slice(5, 7));
  return month >= 1 && month <= 12;
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
    originalDocumentId,
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
    originalDocumentId?: unknown;
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

  const normalizedBusinessDate = businessDate.trim();
  const normalizedPeriod = period.trim();
  if (
    !isValidBusinessDate(normalizedBusinessDate) ||
    !isValidPeriod(normalizedPeriod) ||
    normalizedPeriod !== normalizedBusinessDate.slice(0, 7)
  ) {
    return invalidBusinessDateOrPeriodResponse();
  }

  const normalizedActionType = typeof actionType === "string" ? actionType : "normal";
  if (!isActionType(normalizedActionType)) {
    return invalidDocumentTypeOrActionTypeResponse();
  }

  const normalizedOriginalDocumentId =
    typeof originalDocumentId === "string" && originalDocumentId.trim() ? originalDocumentId.trim() : null;
  if ((normalizedActionType === "correction" || normalizedActionType === "reversal") && !normalizedOriginalDocumentId) {
    return requiredOriginalDocumentResponse();
  }

  const repo = new DocumentRepository(env.DB);
  const document = await repo.createDraft({
    documentType,
    actionType: normalizedActionType,
    businessDate: normalizedBusinessDate,
    period: normalizedPeriod,
    operatorPersonId: typeof operatorPersonId === "string" ? operatorPersonId : null,
    projectId: typeof projectId === "string" ? projectId : null,
    merchantId: typeof merchantId === "string" ? merchantId : null,
    categoryId: typeof categoryId === "string" ? categoryId : null,
    originalDocumentId: normalizedOriginalDocumentId,
    summary,
    createdBy
  });
  return Response.json({ data: document }, { status: 201 });
};
