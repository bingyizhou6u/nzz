import { MasterDataRepository } from "../repositories/masterDataRepository";
import type { Handler } from "../worker/env";

const requiredProjectFieldsResponse = () =>
  Response.json({ error: "code and name are required" }, { status: 400 });

export const listCurrencies: Handler = async ({ env }) => {
  const repo = new MasterDataRepository(env.DB);
  return Response.json({ data: await repo.listCurrencies() });
};

export const createProject: Handler = async ({ request, env }) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return requiredProjectFieldsResponse();
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return requiredProjectFieldsResponse();
  }

  const { code, name, note } = body as { code?: unknown; name?: unknown; note?: unknown };
  if (typeof code !== "string" || typeof name !== "string" || !code.trim() || !name.trim()) {
    return requiredProjectFieldsResponse();
  }

  const repo = new MasterDataRepository(env.DB);
  const project = await repo.createProject({ code, name, note: typeof note === "string" ? note : null });
  return Response.json({ data: project }, { status: 201 });
};
