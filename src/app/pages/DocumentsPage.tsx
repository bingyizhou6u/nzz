import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { ActionType, DocumentType } from "../../domain/types";
import { getJson, postJson, type ApiEnvelope } from "../api";

interface DocumentResponse {
  id: string;
  documentNo: string;
  status: string;
}

interface DocumentActionResponse {
  id: string;
  status: string;
}

interface DocumentListItem {
  id: string;
  document_no: string;
  document_type: DocumentType;
  business_date: string;
  status: string;
  summary: string;
}

interface DocumentForm {
  documentType: DocumentType;
  actionType: ActionType;
  businessDate: string;
  period: string;
  originalDocumentId: string;
  summary: string;
  createdBy: string;
  operatorPersonId: string;
  projectId: string;
  merchantId: string;
  categoryId: string;
  accountId: string;
  counterpartyAccountId: string;
  currencyCode: string;
  amountMajor: string;
  usdtAmountMajor: string;
  personId: string;
  borrowerPersonId: string;
}

type WorkflowAction = "submit" | "approve" | "reject";

const documentTypes = [
  "project_income",
  "exchange",
  "account_transfer",
  "petty_cash_issue",
  "petty_cash_return",
  "petty_cash_reimbursement",
  "loan_out",
  "loan_repayment",
  "loan_writeoff",
  "manual_adjustment"
] as const satisfies readonly DocumentType[];

const documentTypeLabels: Record<DocumentType, string> = {
  project_income: "项目收入",
  exchange: "换汇",
  account_transfer: "账户划转",
  petty_cash_issue: "备用金发放",
  petty_cash_return: "备用金退回",
  petty_cash_reimbursement: "备用金报销",
  loan_out: "借款发放",
  loan_repayment: "借款还款",
  loan_writeoff: "借款核销",
  manual_adjustment: "手工调整"
};

const actionTypes = ["normal", "correction", "reversal", "repost"] as const satisfies readonly ActionType[];

const actionTypeLabels: Record<ActionType, string> = {
  normal: "正常",
  correction: "更正",
  reversal: "冲销",
  repost: "重记"
};

const statusLabels: Record<string, string> = {
  draft: "草稿",
  pending: "待审核",
  approved: "已审核",
  rejected: "已退回",
  void: "已作废"
};

function padCalendarPart(value: number) {
  return String(value).padStart(2, "0");
}

export function formatLocalDateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = padCalendarPart(date.getMonth() + 1);
  const day = padCalendarPart(date.getDate());
  return `${year}-${month}-${day}`;
}

export function formatLocalMonthInputValue(date: Date) {
  const year = date.getFullYear();
  const month = padCalendarPart(date.getMonth() + 1);
  return `${year}-${month}`;
}

export function isOriginalDocumentRequired(actionType: ActionType) {
  return actionType === "correction" || actionType === "reversal";
}

export function isLineAccountRequired(documentType: DocumentType) {
  return documentType !== "loan_writeoff";
}

function getToday() {
  return formatLocalDateInputValue(new Date());
}

function getCurrentPeriod() {
  return formatLocalMonthInputValue(new Date());
}

function createInitialForm(): DocumentForm {
  return {
    documentType: "project_income",
    actionType: "normal",
    businessDate: getToday(),
    period: getCurrentPeriod(),
    originalDocumentId: "",
    summary: "",
    createdBy: "",
    operatorPersonId: "",
    projectId: "",
    merchantId: "",
    categoryId: "",
    accountId: "",
    counterpartyAccountId: "",
    currencyCode: "AED",
    amountMajor: "",
    usdtAmountMajor: "",
    personId: "",
    borrowerPersonId: ""
  };
}

function optionalString(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function amountMajorToMinor(value: string) {
  const normalized = value.trim();
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) throw new Error("金额格式必须最多两位小数");
  const [major, minor = ""] = normalized.split(".");
  return Number(major) * 100 + Number(minor.padEnd(2, "0"));
}

export function canSubmitDocument(status: string) {
  return status === "draft" || status === "rejected";
}

export function canApproveDocument(status: string) {
  return status === "pending";
}

export function buildDocumentPayload(
  form: DocumentForm & {
    accountId: string;
    counterpartyAccountId: string;
    currencyCode: string;
    amountMajor: string;
    usdtAmountMajor: string;
    personId: string;
    borrowerPersonId: string;
  }
) {
  const line: Record<string, unknown> = {
    lineType: "main",
    currencyCode: form.currencyCode.trim().toUpperCase(),
    amountMinor: amountMajorToMinor(form.amountMajor)
  };
  if (isLineAccountRequired(form.documentType)) {
    line.accountId = form.accountId.trim();
  }

  const payload: Record<string, unknown> = {
    documentType: form.documentType,
    actionType: form.actionType,
    businessDate: form.businessDate,
    period: form.period,
    summary: form.summary.trim(),
    createdBy: form.createdBy.trim(),
    lines: [line]
  };

  for (const [key, value] of Object.entries({
    originalDocumentId: optionalString(form.originalDocumentId),
    operatorPersonId: optionalString(form.operatorPersonId),
    projectId: optionalString(form.projectId),
    merchantId: optionalString(form.merchantId),
    categoryId: optionalString(form.categoryId)
  })) {
    if (value) payload[key] = value;
  }

  const borrowerPersonId = form.borrowerPersonId.trim();
  if (borrowerPersonId) {
    line.borrowerPersonId = borrowerPersonId;
  }

  const counterpartyAccountId = form.counterpartyAccountId.trim();
  if (counterpartyAccountId) {
    line.counterpartyAccountId = counterpartyAccountId;
  }

  const personId = form.personId.trim();
  if (personId) {
    line.personId = personId;
  }

  if (form.usdtAmountMajor.trim()) {
    line.usdtAmountMinor = amountMajorToMinor(form.usdtAmountMajor);
  }

  return payload;
}

export function DocumentsPage() {
  const initialForm = useMemo(() => createInitialForm(), []);
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState<DocumentForm>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [result, setResult] = useState<DocumentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    async function loadDocuments() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const response = await getJson<ApiEnvelope<DocumentListItem[]>>("/api/documents");
        if (isCurrent) {
          setDocuments(response.data);
        }
      } catch (loadDocumentsError) {
        if (isCurrent) {
          setLoadError(loadDocumentsError instanceof Error ? loadDocumentsError.message : "读取单据失败");
        }
      } finally {
        if (isCurrent) {
          setIsLoading(false);
        }
      }
    }

    void loadDocuments();

    return () => {
      isCurrent = false;
    };
  }, [reloadKey]);

  function refreshDocuments() {
    setReloadKey((value) => value + 1);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setResult(null);
    setError(null);

    try {
      const response = await postJson<ApiEnvelope<DocumentResponse>>("/api/documents", buildDocumentPayload(form));
      setResult(response.data);
      setForm((current) => ({
        ...initialForm,
        documentType: current.documentType,
        actionType: current.actionType,
        businessDate: current.businessDate,
        period: current.period,
        originalDocumentId: isOriginalDocumentRequired(current.actionType) ? current.originalDocumentId : "",
        createdBy: current.createdBy,
        accountId: current.accountId,
        currencyCode: current.currencyCode
      }));
      refreshDocuments();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "创建单据失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleWorkflowAction(document: DocumentListItem, action: WorkflowAction) {
    const nextActionKey = `${document.id}:${action}`;
    setActionKey(nextActionKey);
    setResult(null);
    setError(null);

    const actor = form.createdBy.trim();
    const body =
      action === "approve"
        ? { reviewer: actor }
        : action === "reject"
          ? { actor, reason: "退回修改" }
          : { actor };

    try {
      const response = await postJson<ApiEnvelope<DocumentActionResponse>>(
        `/api/documents/${encodeURIComponent(document.id)}/${action}`,
        body
      );
      setResult({ id: response.data.id, documentNo: document.document_no, status: response.data.status });
      refreshDocuments();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "单据操作失败");
    } finally {
      setActionKey(null);
    }
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <h2>单据列表</h2>
          <div className="document-toolbar">
            <div className="status-slot" role="status" aria-live="polite">
              {isLoading ? "读取中" : loadError ? "读取失败" : `${documents.length} 条`}
            </div>
            <button type="button" className="secondary-button" onClick={refreshDocuments} disabled={isLoading}>
              重新读取
            </button>
          </div>
        </div>

        {loadError ? <div className="notice error">{loadError}</div> : null}

        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>单据号</th>
                <th>类型</th>
                <th>日期</th>
                <th>状态</th>
                <th>摘要</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    读取中
                  </td>
                </tr>
              ) : documents.length > 0 ? (
                documents.map((document) => (
                  <tr key={document.id}>
                    <td className="mono">{document.document_no}</td>
                    <td>{documentTypeLabels[document.document_type] ?? document.document_type}</td>
                    <td className="mono">{document.business_date}</td>
                    <td>
                      <span className={document.status === "approved" ? "tag ok" : "tag muted"}>
                        {statusLabels[document.status] ?? document.status}
                      </span>
                    </td>
                    <td>{document.summary}</td>
                    <td>
                      <div className="inline-actions">
                        {canSubmitDocument(document.status) ? (
                          <button
                            type="button"
                            className="secondary-button"
                            onClick={() => void handleWorkflowAction(document, "submit")}
                            disabled={Boolean(actionKey) || isSubmitting}
                          >
                            {actionKey === `${document.id}:submit` ? "提交中" : "提交"}
                          </button>
                        ) : null}
                        {canApproveDocument(document.status) ? (
                          <>
                            <button
                              type="button"
                              onClick={() => void handleWorkflowAction(document, "approve")}
                              disabled={Boolean(actionKey) || isSubmitting}
                            >
                              {actionKey === `${document.id}:approve` ? "审核中" : "通过"}
                            </button>
                            <button
                              type="button"
                              className="secondary-button"
                              onClick={() => void handleWorkflowAction(document, "reject")}
                              disabled={Boolean(actionKey) || isSubmitting}
                            >
                              {actionKey === `${document.id}:reject` ? "退回中" : "退回"}
                            </button>
                          </>
                        ) : null}
                        {!canSubmitDocument(document.status) && !canApproveDocument(document.status) ? (
                          <span>无</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="empty-cell">
                    暂无数据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>创建草稿单据</h2>
          <div className="status-slot" role="status" aria-live="polite">
            {isSubmitting ? "提交中" : actionKey ? "处理中" : error ? "失败" : result ? "完成" : "待提交"}
          </div>
        </div>

        <form className="form-grid document-form" onSubmit={handleSubmit}>
          <label>
            单据类型
            <select
              value={form.documentType}
              onChange={(event) =>
                setForm((current) => ({ ...current, documentType: event.target.value as DocumentType }))
              }
            >
              {documentTypes.map((documentType) => (
                <option key={documentType} value={documentType}>
                  {documentTypeLabels[documentType]}
                </option>
              ))}
            </select>
          </label>

          <label>
            动作类型
            <select
              value={form.actionType}
              onChange={(event) =>
                setForm((current) => ({ ...current, actionType: event.target.value as ActionType }))
              }
            >
              {actionTypes.map((actionType) => (
                <option key={actionType} value={actionType}>
                  {actionTypeLabels[actionType]}
                </option>
              ))}
            </select>
          </label>

          <label>
            业务日期
            <input
              type="date"
              value={form.businessDate}
              onChange={(event) => setForm((current) => ({ ...current, businessDate: event.target.value }))}
              required
            />
          </label>

          <label>
            期间
            <input
              type="month"
              value={form.period}
              onChange={(event) => setForm((current) => ({ ...current, period: event.target.value }))}
              required
            />
          </label>

          <label>
            原单据ID
            <input
              value={form.originalDocumentId}
              onChange={(event) => setForm((current) => ({ ...current, originalDocumentId: event.target.value }))}
              required={isOriginalDocumentRequired(form.actionType)}
              maxLength={80}
            />
          </label>

          <label className="wide-field">
            摘要
            <input
              value={form.summary}
              onChange={(event) => setForm((current) => ({ ...current, summary: event.target.value }))}
              required
              maxLength={240}
            />
          </label>

          <label>
            创建人
            <input
              value={form.createdBy}
              onChange={(event) => setForm((current) => ({ ...current, createdBy: event.target.value }))}
              required
              maxLength={80}
            />
          </label>

          <label>
            经办人ID
            <input
              value={form.operatorPersonId}
              onChange={(event) => setForm((current) => ({ ...current, operatorPersonId: event.target.value }))}
              maxLength={80}
            />
          </label>

          <label>
            项目ID
            <input
              value={form.projectId}
              onChange={(event) => setForm((current) => ({ ...current, projectId: event.target.value }))}
              maxLength={80}
            />
          </label>

          <label>
            商户ID
            <input
              value={form.merchantId}
              onChange={(event) => setForm((current) => ({ ...current, merchantId: event.target.value }))}
              maxLength={80}
            />
          </label>

          <label>
            分类ID
            <input
              value={form.categoryId}
              onChange={(event) => setForm((current) => ({ ...current, categoryId: event.target.value }))}
              maxLength={80}
            />
          </label>

          <label>
            账户ID
            <input
              value={form.accountId}
              onChange={(event) => setForm((current) => ({ ...current, accountId: event.target.value }))}
              required={isLineAccountRequired(form.documentType)}
              maxLength={80}
            />
          </label>

          <label>
            对方账户ID
            <input
              value={form.counterpartyAccountId}
              onChange={(event) => setForm((current) => ({ ...current, counterpartyAccountId: event.target.value }))}
              maxLength={80}
            />
          </label>

          <label>
            币种代码
            <input
              value={form.currencyCode}
              onChange={(event) => setForm((current) => ({ ...current, currencyCode: event.target.value }))}
              required
              maxLength={12}
            />
          </label>

          <label>
            金额
            <input
              value={form.amountMajor}
              onChange={(event) => setForm((current) => ({ ...current, amountMajor: event.target.value }))}
              required
              inputMode="decimal"
              maxLength={24}
            />
          </label>

          <label>
            USDT成本
            <input
              value={form.usdtAmountMajor}
              onChange={(event) => setForm((current) => ({ ...current, usdtAmountMajor: event.target.value }))}
              inputMode="decimal"
              maxLength={24}
            />
          </label>

          <label>
            人员ID
            <input
              value={form.personId}
              onChange={(event) => setForm((current) => ({ ...current, personId: event.target.value }))}
              maxLength={80}
            />
          </label>

          <label>
            借款人ID
            <input
              value={form.borrowerPersonId}
              onChange={(event) => setForm((current) => ({ ...current, borrowerPersonId: event.target.value }))}
              maxLength={80}
            />
          </label>

          <div className="form-actions">
            <button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "提交中" : "创建草稿"}
            </button>
          </div>
        </form>

        <div className="message-line" role="status" aria-live="polite">
          {error ? (
            <span className="text-error">{error}</span>
          ) : result ? (
            <span>
              {result.documentNo} / {statusLabels[result.status] ?? result.status}
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
}
