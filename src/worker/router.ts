import { createProject, listCurrencies } from "../api/masterData";
import type { Env, Handler } from "./env";

interface Route {
  method: string;
  pathname: string;
  handler: Handler;
}

const routes: Route[] = [
  { method: "GET", pathname: "/api/currencies", handler: listCurrencies },
  { method: "POST", pathname: "/api/projects", handler: createProject }
];

export async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const match = routes.find((candidate) => candidate.method === request.method && candidate.pathname === url.pathname);
  if (!match) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  return match.handler({ request, env, params: {} });
}
