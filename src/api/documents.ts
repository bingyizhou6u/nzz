import { AuditLogRepository } from "../repositories/auditLogRepository";
import { DocumentRepository } from "../repositories/documentRepository";
import type { RawDocumentLine } from "../domain/documentLines";
import type { ActionType, DocumentType } from "../domain/types";
import { DocumentService } from "../services/documentService";
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

const badRequestResponse = (error: string) => Response.json({ error }, { status: 400 });

const notFoundResponse = () => Response.json({ error: "Document not found" }, { status: 404 });

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

function documentRepository(env: { DB: D1Database }) {
  return new DocumentRepository(env.DB);
}

function documentService(env: { DB: D1Database }) {
  return new DocumentService(documentRepository(env), new AuditLogRepository(env.DB));
}

async function requireEnabledPerson(env: { DB: D1Database }, id: string, label: string) {
  const normalizedId = id.trim();
  const person = await env.DB
    .prepare(
      `
        SELECT id
        FROM people
        WHERE id = ? AND is_enabled = 1
      `
    )
    .bind(normalizedId)
    .first<{ id: string }>();

  if (!person) {
    throw new Error(`${label} must reference an enabled person`);
  }

  return normalizedId;
}

async function readObjectBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed";
}

function requiredString(body: Record<string, unknown>, key: string) {
  const value = body[key];
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${key} is required`);
  }
  return value.trim();
}

export const listDocuments: Handler = async ({ env }) => {
  const documents = await documentRepository(env).listDocuments();
  return Response.json({ data: documents });
};

export const getDocument: Handler = async ({ env, params }) => {
  const id = params.id;
  if (!id) {
    return badRequestResponse("id is required");
  }

  const repo = documentRepository(env);
  const document = await repo.getDocument(id);
  if (!document) {
    return notFoundResponse();
  }

  const lines = await repo.getDocumentLines(id);
  return Response.json({ data: { document, lines } });
};

export const createDocument: Handler = async ({ request, env }) => {
  const body = await readObjectBody(request);
  if (!body) {
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
    createdBy,
    lines
  } = body;

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

  try {
    const normalizedCreatedBy = await requireEnabledPerson(env, createdBy, "createdBy");
    const document = await documentService(env).createDraft({
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
      createdBy: normalizedCreatedBy,
      lines: lines as RawDocumentLine[]
    });
    return Response.json({ data: document }, { status: 201 });
  } catch (error) {
    return badRequestResponse(errorMessage(error));
  }
};

export const submitDocument: Handler = async ({ request, env, params }) => {
  if (!params.id) {
    return badRequestResponse("id is required");
  }

  const body = await readObjectBody(request);
  if (!body) {
    return badRequestResponse("actor is required");
  }

  try {
    const actor = await requireEnabledPerson(env, requiredString(body, "actor"), "actor");
    await documentService(env).submit(params.id, actor);
    return Response.json({ data: { id: params.id, status: "pending" } });
  } catch (error) {
    return badRequestResponse(errorMessage(error));
  }
};

export const approveDocument: Handler = async ({ request, env, params }) => {
  if (!params.id) {
    return badRequestResponse("id is required");
  }

  const body = await readObjectBody(request);
  if (!body) {
    return badRequestResponse("reviewer is required");
  }

  try {
    const reviewer = await requireEnabledPerson(env, requiredString(body, "reviewer"), "reviewer");
    await documentService(env).approve(params.id, reviewer);
    return Response.json({ data: { id: params.id, status: "approved" } });
  } catch (error) {
    return badRequestResponse(errorMessage(error));
  }
};

export const rejectDocument: Handler = async ({ request, env, params }) => {
  if (!params.id) {
    return badRequestResponse("id is required");
  }

  const body = await readObjectBody(request);
  if (!body) {
    return badRequestResponse("actor is required");
  }

  try {
    const actor = requiredString(body, "actor");
    const reason = requiredString(body, "reason");
    const enabledActor = await requireEnabledPerson(env, actor, "actor");
    await documentService(env).reject(params.id, enabledActor, reason);
    return Response.json({ data: { id: params.id, status: "rejected" } });
  } catch (error) {
    return badRequestResponse(errorMessage(error));
  }
};
