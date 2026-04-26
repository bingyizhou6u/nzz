import { assertCan, type Capability } from "../auth/permissions";
import { AuthError, type AuthenticatedActor } from "../auth/types";
import { auditFieldsForRequest, AuditLogRepository } from "../repositories/auditLogRepository";
import {
  MonthCloseRepository,
  type MonthCloseCheckResultStatus,
  type MonthCloseReportSnapshotRow
} from "../repositories/monthCloseRepository";
import { PeriodLockRepository } from "../repositories/periodLockRepository";
import { ReportRepository } from "../repositories/reportRepository";
import { MonthCloseLockError, MonthCloseLockNotFoundError, MonthCloseService } from "../services/monthCloseService";
import type { Handler } from "../worker/env";

const resultStatuses = new Set<MonthCloseCheckResultStatus>([
  "open",
  "assigned",
  "acknowledged",
  "resolved",
  "waived"
]);

export const listMonthClosePeriods: Handler = async ({ env, actor: contextActor }) => {
  try {
    requireActorWithCapability(contextActor, "periodLocks.view");
    return Response.json({ data: await new MonthCloseRepository(env.DB).listPeriods() });
  } catch (error) {
    return errorResponse(error);
  }
};

export const getMonthCloseOverview: Handler = async ({ env, params, actor: contextActor }) => {
  try {
    requireActorWithCapability(contextActor, "periodLocks.view");
    const period = periodValue(params.period);
    const monthCloses = new MonthCloseRepository(env.DB);
    const latestRun = await monthCloses.latestRun(period);
    const [checks, snapshots, periodLock] = await Promise.all([
      latestRun ? monthCloses.listCheckResults(period, latestRun.id) : Promise.resolve([]),
      monthCloses.listSnapshots(period),
      new PeriodLockRepository(env.DB).get(period)
    ]);

    return Response.json({
      data: {
        period,
        latestRun,
        periodLock,
        checks,
        snapshots
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
};

export const listMonthCloseSnapshots: Handler = async ({ env, params, actor: contextActor }) => {
  try {
    requireActorWithCapability(contextActor, "periodLocks.view");
    const period = periodValue(params.period);
    return Response.json({ data: await new MonthCloseRepository(env.DB).listSnapshots(period) });
  } catch (error) {
    return errorResponse(error);
  }
};

export const getMonthCloseReportSnapshot: Handler = async ({ env, params, actor: contextActor }) => {
  try {
    requireActorWithCapability(contextActor, "reports.view");
    const id = requiredText(params.id, "id");
    const reportKey = requiredText(params.reportKey, "reportKey");
    const monthCloses = new MonthCloseRepository(env.DB);
    const snapshot = await monthCloses.getSnapshot(id);
    if (!snapshot) throw new NotFoundError("Month close snapshot not found");

    const report = await monthCloses.getReportSnapshot(id, reportKey);
    if (!report) throw new NotFoundError("Month close report snapshot not found");

    return Response.json({
      data: {
        snapshot,
        report: parsedReportSnapshot(report)
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
};

export const runMonthCloseChecks: Handler = async ({ env, params, actor: contextActor }) => {
  try {
    const actor = requireActorWithCapability(contextActor, "periodLocks.lock");
    const period = periodValue(params.period);
    const monthCloses = new MonthCloseRepository(env.DB);
    const service = new MonthCloseService(monthCloses, new ReportRepository(env.DB));
    const result = await service.runChecks(period, { personId: actor.personId });

    return Response.json(
      {
        data: {
          period,
          run: result.run,
          checks: result.checks,
          summary: result.summary,
          canLock: result.canLock
        }
      },
      { status: 201 }
    );
  } catch (error) {
    return errorResponse(error);
  }
};

export const listMonthCloseChecks: Handler = async ({ env, params, actor: contextActor }) => {
  try {
    requireActorWithCapability(contextActor, "periodLocks.view");
    const period = periodValue(params.period);
    const monthCloses = new MonthCloseRepository(env.DB);
    const run = await monthCloses.latestRun(period);
    const checks = run ? await monthCloses.listCheckResults(period, run.id) : [];

    return Response.json({ data: { run, checks } });
  } catch (error) {
    return errorResponse(error);
  }
};

export const getMonthCloseReconciliation: Handler = async ({ env, params, actor: contextActor }) => {
  try {
    requireActorWithCapability(contextActor, "periodLocks.view");
    const period = periodValue(params.period);
    const service = new MonthCloseService(new MonthCloseRepository(env.DB), new ReportRepository(env.DB));
    return Response.json({ data: await service.reconciliation(period) });
  } catch (error) {
    return errorResponse(error);
  }
};

export const lockMonthClosePeriod: Handler = async ({ request, env, params, actor: contextActor }) => {
  try {
    const actor = requireActorWithCapability(contextActor, "periodLocks.lock");
    const body = await readBody(request);
    const note = requiredText(body.note, "note");
    const period = periodValue(params.period);
    const monthCloses = new MonthCloseRepository(env.DB);
    const auditLogs = new AuditLogRepository(env.DB);
    const auditStatement = auditLogs.prepareRecord({
      ...auditFieldsForRequest(actor, request),
      action: "month_close.period.lock",
      entityType: "month_close_period",
      entityId: period,
      after: { period, lockedBy: actor.personId, note },
      reason: note
    });
    const service = new MonthCloseService(monthCloses, new ReportRepository(env.DB));
    const result = await service.lockPeriod(period, { personId: actor.personId }, { note, auditStatement });

    return Response.json({ data: result }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
};

export const unlockMonthClosePeriod: Handler = async ({ request, env, params, actor: contextActor }) => {
  try {
    const actor = requireActorWithCapability(contextActor, "periodLocks.unlock");
    const body = await readBody(request);
    const reason = requiredText(body.reason, "reason");
    const period = periodValue(params.period);
    const auditLogs = new AuditLogRepository(env.DB);
    const service = new MonthCloseService(new MonthCloseRepository(env.DB), new ReportRepository(env.DB));
    const result = await service.unlockPeriod(period, {
      auditForLock: (lock) =>
        auditLogs.prepareRecordWhen(
          {
            ...auditFieldsForRequest(actor, request),
            action: "month_close.period.unlock",
            entityType: "month_close_period",
            entityId: period,
            before: lock,
            after: { period, status: "unlocked" },
            reason
          },
          {
            sql: "EXISTS (SELECT 1 FROM period_locks WHERE period = ? AND locked_by = ? AND locked_at = ?)",
            bindings: [lock.period, lock.locked_by, lock.locked_at]
          }
        )
    });

    return Response.json({ data: result });
  } catch (error) {
    return errorResponse(error);
  }
};

export const updateMonthCloseCheckResult: Handler = async ({ request, env, params, actor: contextActor }) => {
  try {
    const actor = requireActorWithCapability(contextActor, "periodLocks.lock");
    const id = requiredText(params.id, "id");
    const body = await readBody(request);
    const patch = patchFromBody(body, actor);
    const monthCloses = new MonthCloseRepository(env.DB);
    const before = await monthCloses.getCheckResult(id);
    if (!before) throw new NotFoundError("Month close check result not found");
    if (before.severity === "critical" && patch.status === "waived") {
      throw new ValidationError("critical checks cannot be waived");
    }

    const updated = await monthCloses.updateCheckResult(id, patch);
    if (!updated) throw new NotFoundError("Month close check result not found");

    await new AuditLogRepository(env.DB).record({
      ...auditFieldsForRequest(actor, request),
      action: "month_close.check_result.update",
      entityType: "month_close_check_result",
      entityId: id,
      before,
      after: updated,
      reason: patch.resolutionNote ?? null
    });

    return Response.json({ data: updated });
  } catch (error) {
    return errorResponse(error);
  }
};

function patchFromBody(body: Record<string, unknown>, actor: AuthenticatedActor) {
  const status = body.status === undefined ? undefined : resultStatus(body.status);
  const assigneePersonId = nullableText(body.assigneePersonId);
  const resolutionNote = nullableText(body.resolutionNote);

  if (status === undefined && assigneePersonId === undefined && resolutionNote === undefined) {
    throw new ValidationError("at least one check result field is required");
  }
  if ((status === "acknowledged" || status === "waived") && !resolutionNote) {
    throw new ValidationError("resolutionNote is required for acknowledged or waived checks");
  }

  const handled = status === "acknowledged" || status === "resolved" || status === "waived";

  return {
    status,
    assigneePersonId,
    resolutionNote,
    resolvedBy: handled ? actor.personId : status === "open" ? null : undefined,
    resolvedAt: handled ? new Date().toISOString() : status === "open" ? null : undefined
  };
}

function requireActorWithCapability(actor: AuthenticatedActor | null, capability: Capability) {
  if (!actor) throw new AuthError(401, "Unauthorized");
  assertCan(actor, capability);
  return actor;
}

async function readBody(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ValidationError("request body is required");
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ValidationError) throw error;
    throw new ValidationError("request body is required");
  }
}

function periodValue(value: unknown) {
  if (typeof value !== "string") throw new ValidationError("period is required");
  const period = value.trim();
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) throw new ValidationError("period must use YYYY-MM format");
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new ValidationError("period month must be 01-12");
  return period;
}

function resultStatus(value: unknown): MonthCloseCheckResultStatus {
  if (typeof value !== "string" || !resultStatuses.has(value as MonthCloseCheckResultStatus)) {
    throw new ValidationError("status is invalid");
  }
  return value as MonthCloseCheckResultStatus;
}

function requiredText(value: unknown, key: string) {
  if (typeof value !== "string" || !value.trim()) throw new ValidationError(`${key} is required`);
  return value.trim();
}

function nullableText(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parsedReportSnapshot(row: MonthCloseReportSnapshotRow) {
  const rows = JSON.parse(row.data_json) as unknown;
  if (!Array.isArray(rows)) throw new Error("Month close report snapshot data is invalid");
  return {
    ...row,
    rows
  };
}

class ValidationError extends Error {
  readonly status = 400;
}

class NotFoundError extends Error {
  readonly status = 404;
}

function errorResponse(error: unknown) {
  if (error instanceof AuthError) return Response.json({ error: error.message }, { status: error.status });
  if (
    error instanceof ValidationError ||
    error instanceof NotFoundError ||
    error instanceof MonthCloseLockError ||
    error instanceof MonthCloseLockNotFoundError
  ) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  return Response.json({ error: "Month close request failed" }, { status: 500 });
}
