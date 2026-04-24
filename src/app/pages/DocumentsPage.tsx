import { type FormEvent, useMemo, useState } from "react";
import type { ActionType, DocumentType } from "../../domain/types";
import { postJson, type ApiEnvelope } from "../api";

interface DocumentResponse {
  id: string;
  documentNo: string;
  status: string;
}

interface DocumentForm {
  documentType: DocumentType;
  actionType: ActionType;
  businessDate: string;
  period: string;
  summary: string;
  createdBy: string;
  operatorPersonId: string;
  projectId: string;
  merchantId: string;
  categoryId: string;
}

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
    summary: "",
    createdBy: "",
    operatorPersonId: "",
    projectId: "",
    merchantId: "",
    categoryId: ""
  };
}

function optionalString(value: string) {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function DocumentsPage() {
  const initialForm = useMemo(() => createInitialForm(), []);
  const [form, setForm] = useState<DocumentForm>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [result, setResult] = useState<DocumentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsSubmitting(true);
    setResult(null);
    setError(null);

    const payload = {
      documentType: form.documentType,
      actionType: form.actionType,
      businessDate: form.businessDate,
      period: form.period,
      summary: form.summary.trim(),
      createdBy: form.createdBy.trim(),
      operatorPersonId: optionalString(form.operatorPersonId),
      projectId: optionalString(form.projectId),
      merchantId: optionalString(form.merchantId),
      categoryId: optionalString(form.categoryId)
    };

    try {
      const response = await postJson<ApiEnvelope<DocumentResponse>>("/api/documents", payload);
      setResult(response.data);
      setForm((current) => ({
        ...initialForm,
        documentType: current.documentType,
        actionType: current.actionType,
        businessDate: current.businessDate,
        period: current.period,
        createdBy: current.createdBy
      }));
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "创建单据失败");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="panel-header">
          <h2>创建草稿单据</h2>
          <div className="status-slot" role="status" aria-live="polite">
            {isSubmitting ? "提交中" : error ? "失败" : result ? "完成" : "待提交"}
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
              {result.documentNo} / {result.status}
            </span>
          ) : null}
        </div>
      </section>
    </div>
  );
}
