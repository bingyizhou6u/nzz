import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { ActionType, DocumentType } from "../../domain/types";
import { getJson, postJson, type ApiEnvelope } from "../api";
import { DocumentTypeFields } from "./documents/DocumentTypeFields";
import { personLabel, SelectField } from "./documents/DocumentEntrySelectors";
import {
  buildDocumentPayload,
  createInitialDocumentForm,
  isOriginalDocumentRequired,
  validateDocumentForm
} from "./documents/documentEntryModel";
import type { DocumentEntryForm, DocumentEntryOptions, OriginalDocumentOption } from "./documents/documentEntryTypes";

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

export function isLineAccountRequired(documentType: DocumentType) {
  return documentType !== "loan_writeoff";
}

export function canSubmitDocument(status: string) {
  return status === "draft" || status === "rejected";
}

export function canApproveDocument(status: string) {
  return status === "pending";
}

export function workflowActionBody(action: WorkflowAction, actorId: string) {
  const actor = actorId.trim();
  if (action === "approve") return { reviewer: actor };
  if (action === "reject") return { actor, reason: "退回修改" };
  return { actor };
}

export function originalDocumentQueryType(documentType: DocumentType, actionType: ActionType): DocumentType | null {
  if (isOriginalDocumentRequired(actionType)) return documentType;
  if (actionType === "normal" && (documentType === "loan_repayment" || documentType === "loan_writeoff")) {
    return "loan_out";
  }
  return null;
}

export function isSelectedOriginalDocumentValid(
  originalDocumentId: string,
  originalDocuments: Array<{ id: string }>
) {
  const selectedId = originalDocumentId.trim();
  if (!selectedId) return true;
  return originalDocuments.some((document) => document.id === selectedId);
}

export function DocumentsPage() {
  const initialForm = useMemo(() => createInitialDocumentForm(), []);
  const emptyOptions = useMemo<DocumentEntryOptions>(
    () => ({ people: [], projects: [], merchants: [], accounts: [], currencies: [], categories: [] }),
    []
  );
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [form, setForm] = useState<DocumentEntryForm>(initialForm);
  const [entryOptions, setEntryOptions] = useState<DocumentEntryOptions>(emptyOptions);
  const [originalDocuments, setOriginalDocuments] = useState<OriginalDocumentOption[]>([]);
  const [areOptionsLoading, setAreOptionsLoading] = useState(true);
  const [areOriginalDocumentsLoading, setAreOriginalDocumentsLoading] = useState(false);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [originalDocumentsError, setOriginalDocumentsError] = useState<string | null>(null);
  const [currentActorId, setCurrentActorId] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [result, setResult] = useState<DocumentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;

    async function loadOptions() {
      setAreOptionsLoading(true);
      setOptionsError(null);
      try {
        const response = await getJson<ApiEnvelope<DocumentEntryOptions>>("/api/document-entry/options");
        if (isCurrent) {
          setEntryOptions(response.data);
          setCurrentActorId((current) => current || response.data.people[0]?.id || "");
        }
      } catch (loadOptionsError) {
        if (isCurrent) {
          setOptionsError(loadOptionsError instanceof Error ? loadOptionsError.message : "读取单据选项失败");
        }
      } finally {
        if (isCurrent) {
          setAreOptionsLoading(false);
        }
      }
    }

    void loadOptions();

    return () => {
      isCurrent = false;
    };
  }, []);

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

  useEffect(() => {
    let isCurrent = true;

    async function loadOriginalDocuments() {
      const queryDocumentType = originalDocumentQueryType(form.documentType, form.actionType);
      if (!queryDocumentType) {
        setOriginalDocuments([]);
        setOriginalDocumentsError(null);
        setAreOriginalDocumentsLoading(false);
        return;
      }

      setAreOriginalDocumentsLoading(true);
      setOriginalDocumentsError(null);
      const query = `?documentType=${encodeURIComponent(queryDocumentType)}`;
      const response = await getJson<ApiEnvelope<OriginalDocumentOption[]>>(
        `/api/document-entry/original-documents${query}`
      );
      if (isCurrent) {
        setOriginalDocuments(response.data);
      }
    }

    void loadOriginalDocuments()
      .catch((loadOriginalDocumentsError) => {
        if (isCurrent) {
          setOriginalDocuments([]);
          setOriginalDocumentsError(
            loadOriginalDocumentsError instanceof Error ? loadOriginalDocumentsError.message : "读取原单据失败"
          );
        }
      })
      .finally(() => {
        if (isCurrent) {
          setAreOriginalDocumentsLoading(false);
        }
      });

    return () => {
      isCurrent = false;
    };
  }, [form.actionType, form.documentType]);

  function refreshDocuments() {
    setReloadKey((value) => value + 1);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    setError(null);

    const validationErrors = validateDocumentForm(form, entryOptions, currentActorId);
    if (validationErrors.length > 0) {
      setError(validationErrors.join("；"));
      return;
    }
    if (originalDocumentsError) {
      setError(originalDocumentsError);
      return;
    }
    if (!isSelectedOriginalDocumentValid(form.originalDocumentId, originalDocuments)) {
      setError("请选择有效原单据");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await postJson<ApiEnvelope<DocumentResponse>>(
        "/api/documents",
        buildDocumentPayload(form, currentActorId)
      );
      setResult(response.data);
      setForm((current) => ({
        ...createInitialDocumentForm(),
        documentType: current.documentType,
        actionType: current.actionType,
        businessDate: current.businessDate,
        period: current.period,
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
    setResult(null);
    setError(null);

    if (!currentActorId.trim()) {
      setError("请选择当前操作人");
      return;
    }

    const nextActionKey = `${document.id}:${action}`;
    setActionKey(nextActionKey);

    try {
      const response = await postJson<ApiEnvelope<DocumentActionResponse>>(
        `/api/documents/${encodeURIComponent(document.id)}/${action}`,
        workflowActionBody(action, currentActorId)
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
          <h2>当前操作人</h2>
          <div className="status-slot" role="status" aria-live="polite">
            {areOptionsLoading ? "读取中" : optionsError ? "失败" : currentActorId ? "已选择" : "未选择"}
          </div>
        </div>
        <div className="actor-panel">
          <SelectField
            label="当前操作人"
            value={currentActorId}
            options={entryOptions.people}
            getValue={(person) => person.id}
            getLabel={personLabel}
            onChange={setCurrentActorId}
            required
            disabled={areOptionsLoading || Boolean(optionsError)}
          />
          <div className="document-entry-notice">
            创建、提交、审核、驳回都会使用当前操作人，并保存为人员主数据 ID。
          </div>
        </div>
        {optionsError ? <div className="notice error">{optionsError}</div> : null}
      </section>

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
                setForm((current) => ({
                  ...createInitialDocumentForm(),
                  documentType: event.target.value as DocumentType,
                  actionType: current.actionType,
                  businessDate: current.businessDate,
                  period: current.period
                }))
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
                setForm((current) => ({
                  ...current,
                  actionType: event.target.value as ActionType,
                  originalDocumentId: ""
                }))
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
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  businessDate: event.target.value,
                  period: event.target.value.slice(0, 7)
                }))
              }
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

          <DocumentTypeFields
            form={form}
            setForm={setForm}
            options={entryOptions}
            originalDocuments={originalDocuments}
          />

          {originalDocumentsError ? <div className="notice error wide-field">{originalDocumentsError}</div> : null}

          <div className="form-actions">
            <button
              type="submit"
              disabled={
                isSubmitting ||
                areOptionsLoading ||
                areOriginalDocumentsLoading ||
                Boolean(optionsError) ||
                Boolean(originalDocumentsError) ||
                !currentActorId
              }
            >
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
