import { assertCan, type Capability } from "../auth/permissions";
import { AuthError, type AuthenticatedActor } from "../auth/types";
import { AuditLogRepository, auditFieldsForRequest } from "../repositories/auditLogRepository";
import { DocumentRepository } from "../repositories/documentRepository";
import { MasterDataRepository } from "../repositories/masterDataRepository";
import { ReviewRepository } from "../repositories/reviewRepository";
import { DocumentService } from "../services/documentService";
import type { Handler } from "../worker/env";

const spoofedActorError = "请求中的操作人和当前登录人不一致";

export const listReviewDocuments: Handler = async ({ env, actor: contextActor }) => {
  try {
    requireActorWithCapability(contextActor, "documents.approve");
    const documents = await reviewRepository(env).listPending();
    return Response.json({ data: documents });
  } catch (error) {
    return errorResponse(error);
  }
};

export const getReviewDocument: Handler = async ({ env, params, actor: contextActor }) => {
  if (!params.id) return badRequest("id is required");

  try {
    requireActorWithCapability(contextActor, "documents.approve");
    const document = await reviewRepository(env).getPending(params.id);
    if (!document) return notFound();
    return Response.json({ data: document });
  } catch (error) {
    return errorResponse(error);
  }
};

export const previewReviewDocument: Handler = async ({ env, params, actor: contextActor }) => {
  if (!params.id) return badRequest("id is required");

  try {
    requireActorWithCapability(contextActor, "documents.previewApproval");
    const preview = await documentService(env).previewApproval(params.id);
    return Response.json({ data: preview });
  } catch (error) {
    return errorResponse(error);
  }
};

export const approveReviewDocument: Handler = async ({ request, env, params, actor: contextActor }) => {
  if (!params.id) return badRequest("id is required");

  const body = (await readBody(request)) ?? {};

  try {
    const actor = requireActorWithCapability(contextActor, "documents.approve");
    rejectSpoofedActor(body, ["reviewer", "actor"], actor.personId);
    await documentService(env).approve(params.id, auditFieldsForRequest(actor, request));
    return Response.json({ data: { id: params.id, status: "approved" } });
  } catch (error) {
    return errorResponse(error);
  }
};

export const rejectReviewDocument: Handler = async ({ request, env, params, actor: contextActor }) => {
  if (!params.id) return badRequest("id is required");

  const body = await readBody(request);
  if (!body) return badRequest("reason is required");

  try {
    const actor = requireActorWithCapability(contextActor, "documents.reject");
    rejectSpoofedActor(body, ["reviewer", "actor"], actor.personId);
    const reason = requiredText(body.reason, "reason");
    await documentService(env).reject(params.id, auditFieldsForRequest(actor, request), reason);
    return Response.json({ data: { id: params.id, status: "rejected" } });
  } catch (error) {
    return errorResponse(error);
  }
};

function reviewRepository(env: { DB: D1Database }) {
  return new ReviewRepository(env.DB);
}

function documentService(env: { DB: D1Database }) {
  return new DocumentService(new DocumentRepository(env.DB), new AuditLogRepository(env.DB), new MasterDataRepository(env.DB));
}

function requireActorWithCapability(actor: AuthenticatedActor | null, capability: Capability) {
  if (!actor) throw new AuthError(401, "Unauthorized");
  assertCan(actor, capability);
  return actor;
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) return null;
    return body as Record<string, unknown>;
  } catch {
    return null;
  }
}

function requiredText(value: unknown, key: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required`);
  return value.trim();
}

function rejectSpoofedActor(body: Record<string, unknown>, keys: string[], personId: string) {
  for (const key of keys) {
    const value = body[key];
    if (typeof value === "string" && value.trim() && value.trim() !== personId) {
      throw new AuthError(403, spoofedActorError);
    }
  }
}

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}

function notFound() {
  return Response.json({ error: "Document not found" }, { status: 404 });
}

function errorResponse(error: unknown) {
  if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
  return badRequest(error instanceof Error ? error.message : "Request failed");
}
