import {
  approveDocument,
  createDocument,
  getDocument,
  listDocuments,
  rejectDocument,
  submitDocument
} from "../api/documents";
import { createProject, listCurrencies } from "../api/masterData";
import { accountBalances, loanBalances, pettyCashPendingMatches } from "../api/reports";
import type { Env, Handler } from "./env";

interface Route {
  method: string;
  pathname: string;
  handler: Handler;
  regex: RegExp;
  paramNames: string[];
}

function defineRoute(method: string, pathname: string, handler: Handler): Route {
  const { regex, paramNames } = compilePath(pathname);
  return { method, pathname, handler, regex, paramNames };
}

function compilePath(pathname: string) {
  const paramNames: string[] = [];
  const pattern = pathname
    .split("/")
    .map((segment) => {
      if (segment.startsWith(":")) {
        paramNames.push(segment.slice(1));
        return "([^/]+)";
      }
      return segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");

  return { regex: new RegExp(`^${pattern}$`), paramNames };
}

const routes: Route[] = [
  defineRoute("GET", "/api/currencies", listCurrencies),
  defineRoute("GET", "/api/reports/account-balances", accountBalances),
  defineRoute("GET", "/api/reports/petty-cash-pending", pettyCashPendingMatches),
  defineRoute("GET", "/api/reports/loan-balances", loanBalances),
  defineRoute("GET", "/api/documents", listDocuments),
  defineRoute("GET", "/api/documents/:id", getDocument),
  defineRoute("POST", "/api/documents", createDocument),
  defineRoute("POST", "/api/documents/:id/submit", submitDocument),
  defineRoute("POST", "/api/documents/:id/approve", approveDocument),
  defineRoute("POST", "/api/documents/:id/reject", rejectDocument),
  defineRoute("POST", "/api/projects", createProject)
];

export async function route(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const match = routes
    .filter((candidate) => candidate.method === request.method)
    .map((candidate) => ({ candidate, result: candidate.regex.exec(url.pathname) }))
    .find((candidate) => candidate.result);
  if (!match) {
    return Response.json({ error: "Not found" }, { status: 404 });
  }

  let params: Record<string, string>;
  try {
    params = Object.fromEntries(
      match.candidate.paramNames.map((name, index) => [name, decodeURIComponent(match.result?.[index + 1] ?? "")])
    );
  } catch (error) {
    if (error instanceof URIError) {
      return Response.json({ error: "Invalid route parameter" }, { status: 400 });
    }
    throw error;
  }

  return match.candidate.handler({ request, env, params });
}
