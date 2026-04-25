import { ReportRepository } from "../repositories/reportRepository";
import type { ReportFilters } from "../repositories/reportRepository";
import type { Handler } from "../worker/env";

export function optionalParam(value: string | null): string | undefined {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : undefined;
}

export function reportFiltersFromRequest(request: Request): ReportFilters {
  const search = new URL(request.url).searchParams;
  const staleDaysText = search.get("staleDays")?.trim() ?? "";
  const staleDays = staleDaysText ? Number(staleDaysText) : undefined;

  return {
    period: optionalParam(search.get("period")),
    projectId: optionalParam(search.get("projectId")),
    merchantId: optionalParam(search.get("merchantId")),
    personId: optionalParam(search.get("personId")),
    currencyCode: optionalParam(search.get("currencyCode"))?.toUpperCase(),
    staleDays: staleDays !== undefined && Number.isSafeInteger(staleDays) && staleDays > 0 ? staleDays : undefined
  };
}

export const accountBalances: Handler = async ({ env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.accountBalances() });
};

export const pettyCashPendingMatches: Handler = async ({ env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.pettyCashPendingMatches() });
};

export const loanBalances: Handler = async ({ env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.loanBalances() });
};

export const loanAging: Handler = async ({ env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.loanAging() });
};

export const loanAllocations: Handler = async ({ env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.loanAllocations() });
};

export const loanWriteoffs: Handler = async ({ env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.loanWriteoffs() });
};

export const lotBalances: Handler = async ({ env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.lotBalances() });
};

export const lotMovements: Handler = async ({ env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.lotMovements() });
};

export const pendingCostMatches: Handler = async ({ env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.pendingCostMatches() });
};

export const projectIncome: Handler = async ({ request, env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.projectIncome(reportFiltersFromRequest(request)) });
};

export const merchantIncome: Handler = async ({ request, env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.merchantIncome(reportFiltersFromRequest(request)) });
};

export const expenseDetails: Handler = async ({ request, env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.expenseDetails(reportFiltersFromRequest(request)) });
};

export const expenseSummary: Handler = async ({ request, env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.expenseSummary(reportFiltersFromRequest(request)) });
};

export const projectProfitLoss: Handler = async ({ request, env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.projectProfitLoss(reportFiltersFromRequest(request)) });
};

export const monthlyOperatingSummary: Handler = async ({ request, env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.monthlyOperatingSummary(reportFiltersFromRequest(request)) });
};

export const exceptionChecks: Handler = async ({ request, env }) => {
  const repo = new ReportRepository(env.DB);
  return Response.json({ data: await repo.exceptionChecks(reportFiltersFromRequest(request)) });
};
