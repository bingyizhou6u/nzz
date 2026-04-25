import { assertCan, type Capability } from "../auth/permissions";
import { AuthError, type AuthenticatedActor } from "../auth/types";
import { AuditLogRepository } from "../repositories/auditLogRepository";
import { PeriodLockNotFoundError, PeriodLockRepository } from "../repositories/periodLockRepository";
import type { Handler } from "../worker/env";

export const listPeriodLocks: Handler = async ({ env, actor: contextActor }) => {
  try {
    requireActorWithCapability(contextActor, "periodLocks.view");
    return Response.json({ data: await new PeriodLockRepository(env.DB).list() });
  } catch (error) {
    return errorResponse(error);
  }
};

export const createPeriodLock: Handler = async ({ request, env, actor: contextActor }) => {
  const body = await readBody(request);
  if (!body) return badRequest("request body is required");

  try {
    const actor = requireActorWithCapability(contextActor, "periodLocks.lock");
    const period = periodValue(body.period);
    const note = optionalText(body.note);
    const locks = new PeriodLockRepository(env.DB);
    const audit = auditRepo(env.DB).prepareRecord({
      actor: actor.personId,
      action: "period_lock.create",
      entityType: "period_lock",
      entityId: period,
      after: { period, lockedBy: actor.personId, note },
      actorPersonId: actor.personId,
      actorEmail: actor.email
    });
    await locks.lockWithAudit({ period, lockedBy: actor.personId, note }, audit);
    return Response.json({ data: { period, status: "locked" } }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
};

export const deletePeriodLock: Handler = async ({ request, env, params, actor: contextActor }) => {
  const body = await readBody(request);
  if (!body) return badRequest("request body is required");

  try {
    const actor = requireActorWithCapability(contextActor, "periodLocks.unlock");
    const period = periodValue(params.period);
    const reason = requiredText(body.reason, "reason");
    const locks = new PeriodLockRepository(env.DB);
    const existing = await locks.get(period);
    if (!existing) throw new PeriodLockNotFoundError();
    const audit = auditRepo(env.DB).prepareRecordWhen(
      {
        actor: actor.personId,
        action: "period_lock.delete",
        entityType: "period_lock",
        entityId: period,
        reason,
        before: existing,
        actorPersonId: actor.personId,
        actorEmail: actor.email
      },
      {
        sql: "EXISTS (SELECT 1 FROM period_locks WHERE period = ? AND locked_by = ? AND locked_at = ?)",
        bindings: [existing.period, existing.locked_by, existing.locked_at]
      }
    );
    await locks.unlockWithAudit(existing, audit);
    return Response.json({ data: { period, status: "unlocked" } });
  } catch (error) {
    return errorResponse(error);
  }
};

function auditRepo(db: D1Database) {
  return new AuditLogRepository(db);
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

function periodValue(value: unknown) {
  if (typeof value !== "string") throw new Error("period is required");
  const period = value.trim();
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) throw new Error("period must use YYYY-MM format");
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error("period month must be 01-12");
  return period;
}

function requiredText(value: unknown, key: string) {
  if (typeof value !== "string" || !value.trim()) throw new Error(`${key} is required`);
  return value.trim();
}

function optionalText(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function badRequest(error: string) {
  return Response.json({ error }, { status: 400 });
}

function errorResponse(error: unknown) {
  if (error instanceof PeriodLockNotFoundError) return Response.json({ error: error.message }, { status: 404 });
  if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
  return badRequest(error instanceof Error ? error.message : "Request failed");
}
