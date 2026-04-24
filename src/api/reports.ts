import { ReportRepository } from "../repositories/reportRepository";
import type { Handler } from "../worker/env";

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
