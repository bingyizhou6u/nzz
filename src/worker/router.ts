import {
  approveDocument,
  createDocument,
  getDocument,
  listDocuments,
  rejectDocument,
  submitDocument
} from "../api/documents";
import { listDocumentEntryOptions, listOriginalDocuments } from "../api/documentEntryOptions";
import { listCurrencies } from "../api/masterData";
import { getMe } from "../api/me";
import {
  getMonthCloseOverview,
  listMonthCloseChecks,
  listMonthClosePeriods,
  runMonthCloseChecks,
  updateMonthCloseCheckResult
} from "../api/monthClose";
import { createPeriodLock, deletePeriodLock, listPeriodLocks } from "../api/periodLocks";
import {
  approveReviewDocument,
  getReviewDocument,
  listReviewDocuments,
  previewReviewDocument,
  rejectReviewDocument
} from "../api/review";
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
  projectProfitLoss,
  reportFilterOptions
} from "../api/reports";
import { assertCan, type Capability } from "../auth/permissions";
import { authenticateRequest } from "../auth/authenticate";
import { AuthError } from "../auth/types";
import type { Env, Handler } from "./env";

interface Route {
  method: string;
  pathname: string;
  handler: Handler;
  regex: RegExp;
  paramNames: string[];
  auth: "optional" | "required";
  capability?: Capability;
}

function defineRoute(
  method: string,
  pathname: string,
  handler: Handler,
  capability?: Capability,
  auth: "optional" | "required" = "required"
): Route {
  const { regex, paramNames } = compilePath(pathname);
  return { method, pathname, handler, regex, paramNames, auth, capability };
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
  defineRoute("GET", "/api/me", getMe, "session.view"),
  defineRoute("GET", "/api/currencies", listCurrencies, "masterData.view"),
  defineRoute("GET", "/api/reports/account-balances", accountBalances, "reports.view"),
  defineRoute("GET", "/api/reports/petty-cash-pending", pettyCashPendingMatches, "reports.view"),
  defineRoute("GET", "/api/reports/loan-balances", loanBalances, "reports.view"),
  defineRoute("GET", "/api/reports/loan-aging", loanAging, "reports.view"),
  defineRoute("GET", "/api/reports/loan-allocations", loanAllocations, "reports.view"),
  defineRoute("GET", "/api/reports/loan-writeoffs", loanWriteoffs, "reports.view"),
  defineRoute("GET", "/api/reports/lots", lotBalances, "reports.view"),
  defineRoute("GET", "/api/reports/lot-movements", lotMovements, "reports.view"),
  defineRoute("GET", "/api/reports/pending-costs", pendingCostMatches, "reports.view"),
  defineRoute("GET", "/api/reports/project-income", projectIncome, "reports.view"),
  defineRoute("GET", "/api/reports/merchant-income", merchantIncome, "reports.view"),
  defineRoute("GET", "/api/reports/expense-details", expenseDetails, "reports.view"),
  defineRoute("GET", "/api/reports/expense-summary", expenseSummary, "reports.view"),
  defineRoute("GET", "/api/reports/project-profit-loss", projectProfitLoss, "reports.view"),
  defineRoute("GET", "/api/reports/monthly-operating", monthlyOperatingSummary, "reports.view"),
  defineRoute("GET", "/api/reports/exception-checks", exceptionChecks, "reports.view"),
  defineRoute("GET", "/api/reports/filter-options", reportFilterOptions, "reports.view"),
  defineRoute("GET", "/api/period-locks", listPeriodLocks, "periodLocks.view"),
  defineRoute("POST", "/api/period-locks", createPeriodLock, "periodLocks.lock"),
  defineRoute("DELETE", "/api/period-locks/:period", deletePeriodLock, "periodLocks.unlock"),
  defineRoute("GET", "/api/month-close/periods", listMonthClosePeriods, "periodLocks.view"),
  defineRoute("GET", "/api/month-close/:period", getMonthCloseOverview, "periodLocks.view"),
  defineRoute("POST", "/api/month-close/:period/checks/run", runMonthCloseChecks, "periodLocks.lock"),
  defineRoute("GET", "/api/month-close/:period/checks", listMonthCloseChecks, "periodLocks.view"),
  defineRoute("PATCH", "/api/month-close/check-results/:id", updateMonthCloseCheckResult, "periodLocks.lock"),
  defineRoute("GET", "/api/master-data", listMasterDataSnapshot, "masterData.view"),
  defineRoute("GET", "/api/master-data/reference-summary", masterDataReferenceSummary, "masterData.view"),
  defineRoute("GET", "/api/master-data/people", listMasterDataPeople, "masterData.view"),
  defineRoute("GET", "/api/master-data/projects", listMasterDataProjects, "masterData.view"),
  defineRoute("GET", "/api/master-data/merchants", listMasterDataMerchants, "masterData.view"),
  defineRoute("GET", "/api/master-data/accounts", listMasterDataAccounts, "masterData.view"),
  defineRoute("GET", "/api/master-data/currencies", listMasterDataCurrencies, "masterData.view"),
  defineRoute("GET", "/api/master-data/categories", listMasterDataCategories, "masterData.view"),
  defineRoute("POST", "/api/master-data/people", createMasterDataPerson, "masterData.write"),
  defineRoute("PATCH", "/api/master-data/people/:id", updateMasterDataPerson, "masterData.write"),
  defineRoute("POST", "/api/master-data/projects", createMasterDataProject, "masterData.write"),
  defineRoute("PATCH", "/api/master-data/projects/:id", updateMasterDataProject, "masterData.write"),
  defineRoute("POST", "/api/master-data/merchants", createMasterDataMerchant, "masterData.write"),
  defineRoute("PATCH", "/api/master-data/merchants/:id", updateMasterDataMerchant, "masterData.write"),
  defineRoute("POST", "/api/master-data/accounts", createMasterDataAccount, "masterData.write"),
  defineRoute("PATCH", "/api/master-data/accounts/:id", updateMasterDataAccount, "masterData.write"),
  defineRoute("POST", "/api/master-data/currencies", createMasterDataCurrency, "masterData.write"),
  defineRoute("PATCH", "/api/master-data/currencies/:code", updateMasterDataCurrency, "masterData.write"),
  defineRoute("POST", "/api/master-data/categories", createMasterDataCategory, "masterData.write"),
  defineRoute("PATCH", "/api/master-data/categories/:id", updateMasterDataCategory, "masterData.write"),
  defineRoute("GET", "/api/document-entry/options", listDocumentEntryOptions, "documents.create"),
  defineRoute("GET", "/api/document-entry/original-documents", listOriginalDocuments, "documents.create"),
  defineRoute("GET", "/api/documents", listDocuments, "documents.view"),
  defineRoute("GET", "/api/documents/:id", getDocument, "documents.view"),
  defineRoute("POST", "/api/documents", createDocument, "documents.create"),
  defineRoute("POST", "/api/documents/:id/submit", submitDocument, "documents.submit"),
  defineRoute("POST", "/api/documents/:id/approve", approveDocument, "documents.approve"),
  defineRoute("POST", "/api/documents/:id/reject", rejectDocument, "documents.reject"),
  defineRoute("GET", "/api/review/documents", listReviewDocuments, "documents.approve"),
  defineRoute("GET", "/api/review/documents/:id", getReviewDocument, "documents.approve"),
  defineRoute("GET", "/api/review/documents/:id/preview", previewReviewDocument, "documents.previewApproval"),
  defineRoute("POST", "/api/review/documents/:id/approve", approveReviewDocument, "documents.approve"),
  defineRoute("POST", "/api/review/documents/:id/reject", rejectReviewDocument, "documents.reject")
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

  let actor = null;
  if (match.candidate.auth === "required") {
    try {
      actor = await authenticateRequest(request, env);
    } catch (error) {
      if (error instanceof AuthError) {
        return Response.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
  }

  if (match.candidate.capability && actor) {
    try {
      assertCan(actor, match.candidate.capability);
    } catch (error) {
      if (error instanceof AuthError) {
        return Response.json({ error: error.message }, { status: error.status });
      }
      throw error;
    }
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

  return match.candidate.handler({ request, env, params, actor });
}
