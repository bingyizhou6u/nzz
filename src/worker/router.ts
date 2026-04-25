import {
  approveDocument,
  createDocument,
  getDocument,
  listDocuments,
  rejectDocument,
  submitDocument
} from "../api/documents";
import { listDocumentEntryOptions, listOriginalDocuments } from "../api/documentEntryOptions";
import { createProject, listCurrencies } from "../api/masterData";
import {
  createMasterDataAccount,
  createMasterDataCategory,
  createMasterDataCurrency,
  createMasterDataMerchant,
  createMasterDataPerson,
  createMasterDataProject,
  listMasterDataAccounts,
  listMasterDataCategories,
  listMasterDataCurrencies,
  listMasterDataMerchants,
  listMasterDataPeople,
  listMasterDataProjects,
  listMasterDataSnapshot,
  masterDataReferenceSummary,
  updateMasterDataAccount,
  updateMasterDataCategory,
  updateMasterDataCurrency,
  updateMasterDataMerchant,
  updateMasterDataPerson,
  updateMasterDataProject
} from "../api/masterDataGovernance";
import {
  accountBalances,
  exceptionChecks,
  expenseDetails,
  expenseSummary,
  loanAging,
  loanAllocations,
  loanBalances,
  loanWriteoffs,
  lotBalances,
  lotMovements,
  merchantIncome,
  monthlyOperatingSummary,
  pendingCostMatches,
  pettyCashPendingMatches,
  projectIncome,
  projectProfitLoss
} from "../api/reports";
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
  defineRoute("GET", "/api/reports/loan-aging", loanAging),
  defineRoute("GET", "/api/reports/loan-allocations", loanAllocations),
  defineRoute("GET", "/api/reports/loan-writeoffs", loanWriteoffs),
  defineRoute("GET", "/api/reports/lots", lotBalances),
  defineRoute("GET", "/api/reports/lot-movements", lotMovements),
  defineRoute("GET", "/api/reports/pending-costs", pendingCostMatches),
  defineRoute("GET", "/api/reports/project-income", projectIncome),
  defineRoute("GET", "/api/reports/merchant-income", merchantIncome),
  defineRoute("GET", "/api/reports/expense-details", expenseDetails),
  defineRoute("GET", "/api/reports/expense-summary", expenseSummary),
  defineRoute("GET", "/api/reports/project-profit-loss", projectProfitLoss),
  defineRoute("GET", "/api/reports/monthly-operating", monthlyOperatingSummary),
  defineRoute("GET", "/api/reports/exception-checks", exceptionChecks),
  defineRoute("GET", "/api/master-data", listMasterDataSnapshot),
  defineRoute("GET", "/api/master-data/reference-summary", masterDataReferenceSummary),
  defineRoute("GET", "/api/master-data/people", listMasterDataPeople),
  defineRoute("GET", "/api/master-data/projects", listMasterDataProjects),
  defineRoute("GET", "/api/master-data/merchants", listMasterDataMerchants),
  defineRoute("GET", "/api/master-data/accounts", listMasterDataAccounts),
  defineRoute("GET", "/api/master-data/currencies", listMasterDataCurrencies),
  defineRoute("GET", "/api/master-data/categories", listMasterDataCategories),
  defineRoute("POST", "/api/master-data/people", createMasterDataPerson),
  defineRoute("PATCH", "/api/master-data/people/:id", updateMasterDataPerson),
  defineRoute("POST", "/api/master-data/projects", createMasterDataProject),
  defineRoute("PATCH", "/api/master-data/projects/:id", updateMasterDataProject),
  defineRoute("POST", "/api/master-data/merchants", createMasterDataMerchant),
  defineRoute("PATCH", "/api/master-data/merchants/:id", updateMasterDataMerchant),
  defineRoute("POST", "/api/master-data/accounts", createMasterDataAccount),
  defineRoute("PATCH", "/api/master-data/accounts/:id", updateMasterDataAccount),
  defineRoute("POST", "/api/master-data/currencies", createMasterDataCurrency),
  defineRoute("PATCH", "/api/master-data/currencies/:code", updateMasterDataCurrency),
  defineRoute("POST", "/api/master-data/categories", createMasterDataCategory),
  defineRoute("PATCH", "/api/master-data/categories/:id", updateMasterDataCategory),
  defineRoute("GET", "/api/document-entry/options", listDocumentEntryOptions),
  defineRoute("GET", "/api/document-entry/original-documents", listOriginalDocuments),
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

  return match.candidate.handler({ request, env, params, actor: null });
}
