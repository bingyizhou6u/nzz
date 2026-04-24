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
