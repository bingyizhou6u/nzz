// @vitest-environment jsdom

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Capability } from "../session/sessionTypes";
import {
  buildDocumentPayload,
  formatLocalDateInputValue,
  formatLocalMonthInputValue,
  isOriginalDocumentRequired,
  validateDocumentForm
} from "./documents/documentEntryModel";
import {
  DocumentsPage,
  canApproveDocument,
  canCreateDraftDocument,
  canSubmitDocument,
  documentWorkflowActions,
  isLineAccountRequired,
  isSelectedOriginalDocumentValid,
  originalDocumentQueryType,
  supportedDraftActionTypes,
  supportedDraftDocumentTypes,
  workflowActionBody
} from "./DocumentsPage";

const reactActEnvironment = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
reactActEnvironment.IS_REACT_ACT_ENVIRONMENT = true;

let root: Root | null = null;

afterEach(async () => {
  if (root) {
    await act(async () => {
      root?.unmount();
    });
    root = null;
  }

  document.body.innerHTML = "";
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("document page capability gating", () => {
  it("renders the list and entry panels inside the documents workspace", async () => {
    const container = await renderDocumentsPage(["documents.view", "documents.create"], [
      draftDocument("doc_1", "DOC-001", "draft")
    ]);

    await waitFor(() => {
      const workspace = container.querySelector(".documents-workspace");
      const listPanel = workspace?.querySelector(".document-list-panel");
      const entryPanel = workspace?.querySelector(".document-entry-panel");

      expect(workspace).not.toBeNull();
      expect(listPanel?.textContent).toContain("单据列表");
      expect(entryPanel?.textContent).toContain("创建草稿单据");
    });
  });

  it("filters visible documents by selected status", async () => {
    const container = await renderDocumentsPage(["documents.view"], [
      draftDocument("doc_draft", "DOC-DRAFT", "draft"),
      draftDocument("doc_approved", "DOC-APPROVED", "approved"),
      draftDocument("doc_pending", "DOC-PENDING", "pending")
    ]);

    await waitFor(() => {
      expect(documentNumbers(container)).toEqual(["DOC-DRAFT", "DOC-APPROVED", "DOC-PENDING"]);
      expect(documentListStatusText(container)).toBe("3 条");
    });

    const statusSelect = container.querySelector('select[aria-label="单据状态"]') as HTMLSelectElement | null;
    expect(statusSelect).not.toBeNull();

    await act(async () => {
      statusSelect!.value = "draft";
      statusSelect!.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(documentListStatusText(container)).toBe("显示 1 / 总计 3");
    expect(documentNumbers(container)).toEqual(["DOC-DRAFT"]);
    expect(documentTableBodyText(container)).not.toContain("DOC-APPROVED");
    expect(documentTableBodyText(container)).not.toContain("DOC-PENDING");
  });

  it("shows filtered counts and empty state when no documents match the selected status", async () => {
    const container = await renderDocumentsPage(["documents.view"], [
      draftDocument("doc_draft", "DOC-DRAFT", "draft"),
      draftDocument("doc_approved", "DOC-APPROVED", "approved"),
      draftDocument("doc_pending", "DOC-PENDING", "pending")
    ]);

    await waitFor(() => {
      expect(documentNumbers(container)).toEqual(["DOC-DRAFT", "DOC-APPROVED", "DOC-PENDING"]);
    });

    const statusSelect = container.querySelector('select[aria-label="单据状态"]') as HTMLSelectElement | null;
    expect(statusSelect).not.toBeNull();

    await act(async () => {
      statusSelect!.value = "rejected";
      statusSelect!.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(documentListStatusText(container)).toBe("显示 0 / 总计 3");
    expect(documentNumbers(container)).toEqual([]);
    expect(documentEmptyCellText(container)).toBe("当前筛选下暂无单据");
    expect(documentTableBodyText(container)).not.toContain("DOC-DRAFT");
    expect(documentTableBodyText(container)).not.toContain("DOC-APPROVED");
    expect(documentTableBodyText(container)).not.toContain("DOC-PENDING");
  });

  it("surfaces document list load failures without a filtered-count empty state", async () => {
    const container = await renderDocumentsPage(
      ["documents.view"],
      [],
      documentsFetchFailure("单据读取服务不可用")
    );

    await waitFor(() => {
      expect(documentListStatusText(container)).toBe("读取失败");
      expect(documentListNoticeText(container)).toContain("单据读取服务不可用");
    });

    const emptyCellText = documentEmptyCellText(container);
    expect(emptyCellText).toBeTruthy();
    expect(emptyCellText).not.toContain("显示");
    expect(emptyCellText).not.toContain("总计");
  });

  it("derives create and row workflow actions from capabilities", () => {
    expect(canCreateDraftDocument(["documents.view", "documents.create"])).toBe(true);
    expect(canCreateDraftDocument(["documents.view"])).toBe(false);
    expect(documentWorkflowActions("draft", ["documents.view", "documents.submit"])).toEqual(["submit"]);
    expect(documentWorkflowActions("rejected", ["documents.view"])).toEqual([]);
    expect(documentWorkflowActions("pending", ["documents.view", "documents.approve"])).toEqual(["approve"]);
    expect(documentWorkflowActions("pending", ["documents.view", "documents.reject"])).toEqual(["reject"]);
  });

  it("keeps the list readable but removes draft creation for users without document create capability", async () => {
    const container = await renderDocumentsPage(["documents.view"], [
      draftDocument("doc_1", "DOC-001", "pending")
    ]);

    await waitFor(() => {
      expect(container.textContent).toContain("DOC-001");
      expect(container.textContent).toContain("只读");
      expect(buttonTexts(container)).not.toContain("创建草稿");
    });
  });

  it("does not render submit actions without document submit capability", async () => {
    const container = await renderDocumentsPage(["documents.view", "documents.create"], [
      draftDocument("doc_1", "DOC-001", "draft"),
      draftDocument("doc_2", "DOC-002", "rejected")
    ]);

    await waitFor(() => {
      expect(container.textContent).toContain("DOC-001");
      expect(container.textContent).toContain("DOC-002");
      expect(buttonTexts(container)).not.toContain("提交");
    });
  });

  it("gates approve and reject actions independently", async () => {
    const approveOnly = await renderDocumentsPage(["documents.view", "documents.approve"], [
      draftDocument("doc_1", "DOC-001", "pending")
    ]);

    await waitFor(() => {
      expect(buttonTexts(approveOnly)).toContain("通过");
      expect(buttonTexts(approveOnly)).not.toContain("退回");
    });

    await unmountRoot();

    const rejectOnly = await renderDocumentsPage(["documents.view", "documents.reject"], [
      draftDocument("doc_1", "DOC-001", "pending")
    ]);

    await waitFor(() => {
      expect(buttonTexts(rejectOnly)).not.toContain("通过");
      expect(buttonTexts(rejectOnly)).toContain("退回");
    });
  });
});

describe("document date defaults", () => {
  it("formats date inputs from local calendar fields", () => {
    const date = {
      getFullYear: () => 2026,
      getMonth: () => 0,
      getDate: () => 5
    } as Date;

    expect(formatLocalDateInputValue(date)).toBe("2026-01-05");
  });

  it("formats month inputs from local calendar fields", () => {
    const date = {
      getFullYear: () => 2026,
      getMonth: () => 8,
      getDate: () => 30
    } as Date;

    expect(formatLocalMonthInputValue(date)).toBe("2026-09");
  });

  it("requires original document IDs for correction and reversal drafts", () => {
    expect(isOriginalDocumentRequired("correction")).toBe(true);
    expect(isOriginalDocumentRequired("reversal")).toBe(true);
    expect(isOriginalDocumentRequired("normal")).toBe(false);
    expect(isOriginalDocumentRequired("repost")).toBe(false);
  });

  it("exposes only workflow-supported document and action choices for new drafts", () => {
    expect(supportedDraftDocumentTypes).toEqual([
      "project_income",
      "exchange",
      "account_transfer",
      "petty_cash_issue",
      "petty_cash_return",
      "petty_cash_reimbursement",
      "loan_out",
      "loan_repayment",
      "loan_writeoff"
    ]);
    expect(supportedDraftActionTypes).toEqual(["normal", "reversal"]);
  });

  it("does not require a line account for loan writeoffs", () => {
    expect(isLineAccountRequired("loan_writeoff")).toBe(false);
    expect(isLineAccountRequired("loan_out")).toBe(true);
  });

  it("builds a document payload with one line", () => {
    expect(
      buildDocumentPayload({
        documentType: "project_income",
        actionType: "normal",
        businessDate: "2026-04-24",
        period: "2026-04",
        originalDocumentId: "",
        summary: "Income",
        operatorPersonId: "",
        projectId: "proj_1",
        merchantId: "merchant_1",
        categoryId: "cat_income",
        accountId: "acct_usdt",
        currencyCode: "USDT",
        amountMajor: "100.50",
        borrowerPersonId: "",
        counterpartyAccountId: "",
        personId: "",
        usdtAmountMajor: ""
      }, "user_1")
    ).toEqual({
      documentType: "project_income",
      actionType: "normal",
      businessDate: "2026-04-24",
      period: "2026-04",
      summary: "Income",
      createdBy: "user_1",
      projectId: "proj_1",
      merchantId: "merchant_1",
      categoryId: "cat_income",
      lines: [{ lineType: "main", accountId: "acct_usdt", currencyCode: "USDT", amountMinor: 10050 }]
    });
  });

  it("omits createdBy when no actor is supplied", () => {
    expect(
      buildDocumentPayload({
        documentType: "project_income",
        actionType: "normal",
        businessDate: "2026-04-24",
        period: "2026-04",
        originalDocumentId: "",
        summary: "Income",
        operatorPersonId: "",
        projectId: "proj_1",
        merchantId: "merchant_1",
        categoryId: "cat_income",
        accountId: "acct_usdt",
        currencyCode: "USDT",
        amountMajor: "100.50",
        borrowerPersonId: "",
        counterpartyAccountId: "",
        personId: "",
        usdtAmountMajor: ""
      }, "")
    ).not.toHaveProperty("createdBy");
  });

  it("omits createdBy from reversal payloads when no actor is supplied", () => {
    expect(
      buildDocumentPayload({
        documentType: "project_income",
        actionType: "reversal",
        businessDate: "2026-04-24",
        period: "2026-04",
        originalDocumentId: "doc_1",
        summary: "Reverse income",
        operatorPersonId: "",
        projectId: "",
        merchantId: "",
        categoryId: "",
        accountId: "",
        currencyCode: "USDT",
        amountMajor: "",
        borrowerPersonId: "",
        counterpartyAccountId: "",
        personId: "",
        usdtAmountMajor: ""
      }, "")
    ).toEqual({
      documentType: "project_income",
      actionType: "reversal",
      businessDate: "2026-04-24",
      period: "2026-04",
      originalDocumentId: "doc_1",
      summary: "Reverse income"
    });
  });

  it("includes counterparty account and USDT cost on exchange lines", () => {
    expect(
      buildDocumentPayload({
        documentType: "exchange",
        actionType: "normal",
        businessDate: "2026-04-24",
        period: "2026-04",
        originalDocumentId: "",
        summary: "Exchange",
        operatorPersonId: "",
        projectId: "",
        merchantId: "",
        categoryId: "",
        accountId: "acct_aed",
        currencyCode: "AED",
        amountMajor: "367.25",
        borrowerPersonId: "",
        counterpartyAccountId: " acct_usdt ",
        personId: "",
        usdtAmountMajor: "100.25"
      }, "user_1")
    ).toEqual({
      documentType: "exchange",
      actionType: "normal",
      businessDate: "2026-04-24",
      period: "2026-04",
      summary: "Exchange",
      createdBy: "user_1",
      lines: [
        {
          lineType: "main",
          accountId: "acct_aed",
          currencyCode: "AED",
          amountMinor: 36725,
          counterpartyAccountId: "acct_usdt",
          usdtAmountMinor: 10025
        }
      ]
    });
  });

  it("includes person ID and omits blank FIFO line fields on petty cash reimbursements", () => {
    expect(
      buildDocumentPayload({
        documentType: "petty_cash_reimbursement",
        actionType: "normal",
        businessDate: "2026-04-24",
        period: "2026-04",
        originalDocumentId: "",
        summary: "Reimbursement",
        operatorPersonId: "",
        projectId: "",
        merchantId: "",
        categoryId: "cat_travel",
        accountId: "acct_cash",
        currencyCode: "AED",
        amountMajor: "42",
        borrowerPersonId: "",
        counterpartyAccountId: " ",
        personId: " person_1 ",
        usdtAmountMajor: " "
      }, "user_1")
    ).toEqual({
      documentType: "petty_cash_reimbursement",
      actionType: "normal",
      businessDate: "2026-04-24",
      period: "2026-04",
      summary: "Reimbursement",
      createdBy: "user_1",
      categoryId: "cat_travel",
      lines: [
        {
          lineType: "main",
          accountId: "acct_cash",
          currencyCode: "AED",
          amountMinor: 4200,
          personId: "person_1"
        }
      ]
    });
  });

  it("omits account ID when building loan writeoff payloads", () => {
    expect(
      buildDocumentPayload({
        documentType: "loan_writeoff",
        actionType: "normal",
        businessDate: "2026-04-24",
        period: "2026-04",
        originalDocumentId: "doc_loan",
        summary: "Write off bad loan",
        operatorPersonId: "",
        projectId: "proj_1",
        merchantId: "",
        categoryId: "cat_bad_debt",
        accountId: "acct_should_not_be_sent",
        currencyCode: "AED",
        amountMajor: "120",
        borrowerPersonId: " person_1 ",
        counterpartyAccountId: "",
        personId: "",
        usdtAmountMajor: ""
      }, "user_1")
    ).toEqual({
      documentType: "loan_writeoff",
      actionType: "normal",
      businessDate: "2026-04-24",
      period: "2026-04",
      originalDocumentId: "doc_loan",
      summary: "Write off bad loan",
      createdBy: "user_1",
      projectId: "proj_1",
      categoryId: "cat_bad_debt",
      lines: [{ lineType: "main", currencyCode: "AED", amountMinor: 12000, borrowerPersonId: "person_1" }]
    });
  });

  it("shows workflow actions by status", () => {
    expect(canSubmitDocument("draft")).toBe(true);
    expect(canSubmitDocument("rejected")).toBe(true);
    expect(canSubmitDocument("pending")).toBe(false);
    expect(canApproveDocument("pending")).toBe(true);
    expect(canApproveDocument("approved")).toBe(false);
  });

  it("uses selected people ids for workflow actions when supplied", () => {
    expect(workflowActionBody("submit", "person_finance")).toEqual({ actor: "person_finance" });
    expect(workflowActionBody("approve", "person_manager")).toEqual({ reviewer: "person_manager" });
    expect(workflowActionBody("reject", "person_manager")).toEqual({ actor: "person_manager", reason: "退回修改" });
  });

  it("omits workflow actor fields when no actor is supplied", () => {
    expect(workflowActionBody("submit", "")).toEqual({});
    expect(workflowActionBody("approve", "")).toEqual({});
    expect(workflowActionBody("reject", "")).toEqual({ reason: "退回修改" });
  });

  it("does not require a current actor to validate document drafts", () => {
    const errors = validateDocumentForm(
      {
        documentType: "project_income",
        actionType: "normal",
        businessDate: "2026-04-24",
        period: "2026-04",
        originalDocumentId: "",
        summary: "Income",
        operatorPersonId: "person_1",
        projectId: "proj_1",
        merchantId: "merchant_1",
        categoryId: "cat_income",
        accountId: "acct_usdt",
        currencyCode: "USDT",
        amountMajor: "100.50",
        borrowerPersonId: "",
        counterpartyAccountId: "",
        personId: "",
        usdtAmountMajor: ""
      },
      {
        people: [{ id: "person_1", name: "Alice", alias: null, roles_json: "[\"finance_entry\"]", is_enabled: 1 }],
        projects: [],
        merchants: [],
        accounts: [
          {
            id: "acct_usdt",
            name: "USDT",
            currency_code: "USDT",
            account_type: "usdt_wallet",
            owner_person_id: null,
            is_company_account: 1,
            allow_negative: 0,
            status: "active"
          }
        ],
        currencies: [{ code: "USDT", name: "Tether", minor_units: 2, is_enabled: 1 }],
        categories: []
      },
      ""
    );

    expect(errors).not.toContain("请选择当前操作人");
  });

  it("loads loan origin documents for normal loan settlement documents", () => {
    expect(originalDocumentQueryType("loan_repayment", "normal")).toBe("loan_out");
    expect(originalDocumentQueryType("loan_writeoff", "normal")).toBe("loan_out");
    expect(originalDocumentQueryType("project_income", "reversal")).toBe("project_income");
    expect(originalDocumentQueryType("project_income", "normal")).toBeNull();
  });

  it("accepts only original document ids from the loaded options", () => {
    const originalDocuments = [{ id: "doc_1" }];

    expect(isSelectedOriginalDocumentValid("doc_1", originalDocuments)).toBe(true);
    expect(isSelectedOriginalDocumentValid("stale_doc", originalDocuments)).toBe(false);
    expect(isSelectedOriginalDocumentValid("", originalDocuments)).toBe(true);
  });
});

type FetchHandler = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function draftDocument(id: string, documentNo: string, status: string) {
  return {
    id,
    document_no: documentNo,
    document_type: "project_income" as const,
    business_date: "2026-04-25",
    status,
    summary: `${documentNo} summary`
  };
}

async function renderDocumentsPage(
  capabilities: Capability[],
  documents: ReturnType<typeof draftDocument>[],
  fetchHandler: FetchHandler = documentsFetch(documents)
) {
  vi.stubGlobal("fetch", fetchHandler);

  const container = document.createElement("div");
  document.body.appendChild(container);

  await act(async () => {
    root = createRoot(container);
    root.render(createElement(DocumentsPage, { capabilities }));
  });

  return container;
}

function documentsFetch(documents: ReturnType<typeof draftDocument>[]) {
  return vi.fn<FetchHandler>().mockImplementation((input) => {
    const url = String(input);
    if (url === "/api/documents") {
      return Promise.resolve(jsonResponse({ data: documents }));
    }
    if (url === "/api/document-entry/options") {
      return Promise.resolve(
        jsonResponse({
          data: { people: [], projects: [], merchants: [], accounts: [], currencies: [], categories: [] }
        })
      );
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

function documentsFetchFailure(message: string) {
  return vi.fn<FetchHandler>().mockImplementation((input) => {
    const url = String(input);
    if (url === "/api/documents") {
      return Promise.resolve(
        jsonResponse({ error: message }, { status: 503, statusText: "Service Unavailable" })
      );
    }
    if (url === "/api/document-entry/options") {
      return Promise.resolve(
        jsonResponse({
          data: { people: [], projects: [], merchants: [], accounts: [], currencies: [], categories: [] }
        })
      );
    }
    throw new Error(`Unexpected request: ${url}`);
  });
}

function jsonResponse(body: unknown, init?: ResponseInit): Response {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      "content-type": "application/json",
      ...init?.headers
    }
  });
}

async function waitFor(assertion: () => void): Promise<void> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }

  throw lastError;
}

async function unmountRoot() {
  if (!root) return;
  await act(async () => {
    root?.unmount();
  });
  root = null;
  document.body.innerHTML = "";
}

function buttonTexts(container: HTMLElement) {
  return Array.from(container.querySelectorAll("button")).map((button) => button.textContent?.trim() ?? "");
}

function documentListPanel(container: HTMLElement) {
  const panel = container.querySelector(".document-list-panel");
  expect(panel).not.toBeNull();
  return panel as HTMLElement;
}

function documentListStatusText(container: HTMLElement) {
  return documentListPanel(container).querySelector(".status-slot")?.textContent?.trim();
}

function documentTableRows(container: HTMLElement) {
  return Array.from(documentListPanel(container).querySelectorAll("tbody tr"));
}

function documentNumbers(container: HTMLElement) {
  return documentTableRows(container)
    .filter((row) => !row.querySelector(".empty-cell"))
    .map((row) => row.querySelector("td")?.textContent?.trim() ?? "");
}

function documentEmptyCellText(container: HTMLElement) {
  return documentListPanel(container).querySelector(".empty-cell")?.textContent?.trim();
}

function documentListNoticeText(container: HTMLElement) {
  return documentListPanel(container).querySelector(".notice")?.textContent?.trim();
}

function documentTableBodyText(container: HTMLElement) {
  return documentListPanel(container).querySelector("tbody")?.textContent ?? "";
}
