import { MasterDataRepository } from "../repositories/masterDataRepository";
import type { Handler } from "../worker/env";

export const listCurrencies: Handler = async ({ env }) => {
  const repo = new MasterDataRepository(env.DB);
  return Response.json({ data: await repo.listCurrencies() });
};

export const createProject: Handler = async ({ request, env }) => {
  const body = (await request.json()) as { code?: string; name?: string; note?: string };
  if (!body.code || !body.name) {
    return Response.json({ error: "code and name are required" }, { status: 400 });
  }
  const repo = new MasterDataRepository(env.DB);
  const project = await repo.createProject({ code: body.code, name: body.name, note: body.note ?? null });
  return Response.json({ data: project }, { status: 201 });
};
