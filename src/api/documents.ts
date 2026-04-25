import { AuditLogRepository } from "../repositories/auditLogRepository";
import { DocumentRepository } from "../repositories/documentRepository";
import { MasterDataRepository } from "../repositories/masterDataRepository";
import type { RawDocumentLine } from "../domain/documentLines";
import type { ActionType, DocumentType } from "../domain/types";
import { assertCan } from "../auth/permissions";
import { AuthError, type AuthenticatedActor } from "../auth/types";
import { DocumentService } from "../services/documentService";
import type { Handler } from "../worker/env";

const requiredDocumentFieldsResponse = () =>
  Response.json({ error: "documentType, businessDate, period, and summary are required" }, { status: 400 });

const invalidDocumentTypeOrActionTypeResponse = () =>
  Response.json({ error: "Invalid document type or action type" }, { status: 400 });

const invalidBusinessDateOrPeriodResponse = () =>
  Response.json({ error: "Invalid business date or period" }, { status: 400 });

const requiredOriginalDocumentResponse = () =>
  Response.json(
    { error: "originalDocumentId is required for reversal, loan repayment, or loan writeoff" },
    { status: 400 }
  );

const badRequestResponse = (error: string) => Response.json({ error }, { status: 400 });

const notFoundResponse = () => Response.json({ error: "Document not found" }, { status: 404 });

const authErrorResponse = (error: AuthError) => Response.json({ error: error.message }, { status: error.status });

const spoofedActorError = "请求中的操作人和当前登录人不一致";

const documentTypes = new Set<DocumentType>([
  "project_income",
  "exchange",
  "account_transfer",
  "petty_cash_issue",
  "petty_cash_return",
  "petty_cash_reimbursement",
  "loan_out",
  "loan_repayment",
  "loan_writeoff"
]);

const actionTypes = new Set<ActionType>(["normal", "reversal"]);

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
  return new DocumentService(documentRepository(env), new AuditLogRepository(env.DB), new MasterDataRepository(env.DB));
}

function requireActor(actor: AuthenticatedActor | null) {
  if (!actor) throw new AuthError(401, "Unauthorized");
  return actor;
}

function rejectSpoofedActor(body: Record<string, unknown>, keys: string[], personId: string) {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim() && value.trim() !== personId) {
      throw new AuthError(403, spoofedActorError);
    }
  }
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

export const createDocument: Handler = async ({ request, env, actor: contextActor }) => {
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
    lines
  } = body;

  if (
    typeof documentType !== "string" ||
    typeof businessDate !== "string" ||
    typeof period !== "string" ||
    typeof summary !== "string" ||
    !documentType.trim() ||
    !businessDate.trim() ||
    !period.trim() ||
    !summary.trim()
  ) {
    return requiredDocumentFieldsResponse();
  }

  let actor: AuthenticatedActor;
  try {
    actor = requireActor(contextActor);
    assertCan(actor, "documents.create");
    rejectSpoofedActor(body, ["createdBy"], actor.personId);
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    return badRequestResponse(errorMessage(error));
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
  const originalDocumentIdRequired =
    normalizedActionType === "reversal" ||
    (normalizedActionType === "normal" && (documentType === "loan_repayment" || documentType === "loan_writeoff"));
  if (originalDocumentIdRequired && !normalizedOriginalDocumentId) {
    return requiredOriginalDocumentResponse();
  }

  try {
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
      createdBy: actor.personId,
      lines: lines as RawDocumentLine[]
    });
    return Response.json({ data: document }, { status: 201 });
  } catch (error) {
    return badRequestResponse(errorMessage(error));
  }
};

export const submitDocument: Handler = async ({ request, env, params, actor: contextActor }) => {
  if (!params.id) {
    return badRequestResponse("id is required");
  }

  const body = (await readObjectBody(request)) ?? {};

  try {
    const actor = requireActor(contextActor);
    assertCan(actor, "documents.submit");
    rejectSpoofedActor(body, ["actor"], actor.personId);
    await documentService(env).submit(params.id, actor.personId);
    return Response.json({ data: { id: params.id, status: "pending" } });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    return badRequestResponse(errorMessage(error));
  }
};

export const approveDocument: Handler = async ({ request, env, params, actor: contextActor }) => {
  if (!params.id) {
    return badRequestResponse("id is required");
  }

  const body = (await readObjectBody(request)) ?? {};

  try {
    const actor = requireActor(contextActor);
    assertCan(actor, "documents.approve");
    rejectSpoofedActor(body, ["reviewer"], actor.personId);
    await documentService(env).approve(params.id, actor.personId);
    return Response.json({ data: { id: params.id, status: "approved" } });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    return badRequestResponse(errorMessage(error));
  }
};

export const rejectDocument: Handler = async ({ request, env, params, actor: contextActor }) => {
  if (!params.id) {
    return badRequestResponse("id is required");
  }

  const body = await readObjectBody(request);
  if (!body) {
    return badRequestResponse("reason is required");
  }

  try {
    const actor = requireActor(contextActor);
    assertCan(actor, "documents.reject");
    rejectSpoofedActor(body, ["actor"], actor.personId);
    const reason = requiredString(body, "reason");
    await documentService(env).reject(params.id, actor.personId, reason);
    return Response.json({ data: { id: params.id, status: "rejected" } });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    return badRequestResponse(errorMessage(error));
  }
};
