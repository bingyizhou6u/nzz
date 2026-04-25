import { useEffect, useMemo, useState } from "react";
import {
  approveReviewDocument,
  getReviewDocument,
  listReviewDocuments,
  previewReviewDocument,
  rejectReviewDocument
} from "./review/reviewApi";
import { documentTypeLabels, formatPreviewRecord, previewGroups, waitingLabel } from "./review/reviewModel";
import type { ApprovalPreviewState, ReviewDocumentRow } from "./review/reviewTypes";

type LoadState = "idle" | "loading" | "ready" | "error";

interface ClearedReviewActionState {
  documents: ReviewDocumentRow[];
  selectedId: null;
  detail: null;
  preview: null;
  detailState: LoadState;
  previewState: LoadState;
  rejectReason: string;
  actionMessage: string;
}

interface ReviewActionRefreshFailureState extends ClearedReviewActionState {
  queueState: Extract<LoadState, "error">;
  error: string;
}

interface ReviewCenterPageProps {
  capabilities: string[];
}

export function canRenderReviewCenter(capabilities: string[]) {
  return capabilities.includes("documents.approve");
}

export function clearedReviewActionState(message: string): ClearedReviewActionState {
  return {
    documents: [],
    selectedId: null,
    detail: null,
    preview: null,
    detailState: "idle",
    previewState: "idle",
    rejectReason: "",
    actionMessage: message
  };
}

export function reviewActionRefreshFailureState(message: string, loadError: unknown): ReviewActionRefreshFailureState {
  return {
    ...clearedReviewActionState(message),
    queueState: "error",
    error: loadError instanceof Error ? loadError.message : "刷新待审队列失败"
  };
}

export function ReviewCenterPage({ capabilities }: ReviewCenterPageProps) {
  const [documents, setDocuments] = useState<ReviewDocumentRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ReviewDocumentRow | null>(null);
  const [preview, setPreview] = useState<ApprovalPreviewState | null>(null);
  const [queueState, setQueueState] = useState<LoadState>("loading");
  const [detailState, setDetailState] = useState<LoadState>("idle");
  const [previewState, setPreviewState] = useState<LoadState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actionKey, setActionKey] = useState<"approve" | "reject" | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === selectedId) ?? null,
    [documents, selectedId]
  );
  const groups = useMemo(() => (preview ? previewGroups(preview) : []), [preview]);

  useEffect(() => {
    if (!canRenderReviewCenter(capabilities)) return;
    let isCurrent = true;

    async function loadQueue() {
      setQueueState("loading");
      setError(null);
      try {
        const nextDocuments = await listReviewDocuments();
        if (!isCurrent) return;
        setDocuments(nextDocuments);
        setSelectedId((current) =>
          current && nextDocuments.some((document) => document.id === current) ? current : nextDocuments[0]?.id ?? null
        );
        setQueueState("ready");
      } catch (loadError) {
        if (!isCurrent) return;
        setError(loadError instanceof Error ? loadError.message : "读取待审队列失败");
        setQueueState("error");
      }
    }

    void loadQueue();

    return () => {
      isCurrent = false;
    };
  }, [capabilities]);

  useEffect(() => {
    if (!selectedId) {
      setDetail(null);
      setPreview(null);
      setDetailState("idle");
      setPreviewState("idle");
      return;
    }

    let isCurrent = true;
    setDetail(null);
    setPreview(null);
    setRejectReason("");
    setDetailState("loading");
    setPreviewState("loading");
    setError(null);
    setActionMessage(null);

    void getReviewDocument(selectedId)
      .then((nextDetail) => {
        if (!isCurrent) return;
        setDetail(nextDetail);
        setDetailState("ready");
      })
      .catch((loadError) => {
        if (!isCurrent) return;
        setError(loadError instanceof Error ? loadError.message : "读取单据详情失败");
        setDetailState("error");
      });

    void previewReviewDocument(selectedId)
      .then((nextPreview) => {
        if (!isCurrent) return;
        setPreview(nextPreview);
        setPreviewState("ready");
      })
      .catch((loadError) => {
        if (!isCurrent) return;
        setPreview(null);
        setError(loadError instanceof Error ? loadError.message : "读取审批预览失败");
        setPreviewState("error");
      });

    return () => {
      isCurrent = false;
    };
  }, [selectedId]);

  if (!canRenderReviewCenter(capabilities)) {
    return (
      <section className="panel">
        <div className="panel-header">
          <h2>审核中心</h2>
          <div className="status-slot">无权限</div>
        </div>
        <div className="workspace-placeholder">当前账号没有审核权限。</div>
      </section>
    );
  }

  async function reloadAfterAction(message: string) {
    const clearedState = clearedReviewActionState(message);
    setDocuments(clearedState.documents);
    setSelectedId(clearedState.selectedId);
    setDetail(clearedState.detail);
    setPreview(clearedState.preview);
    setDetailState(clearedState.detailState);
    setPreviewState(clearedState.previewState);
    setRejectReason(clearedState.rejectReason);
    setActionMessage(clearedState.actionMessage);
    setQueueState("loading");

    try {
      const nextDocuments = await listReviewDocuments();
      const nextSelectedId = nextDocuments[0]?.id ?? null;
      setDocuments(nextDocuments);
      setSelectedId(nextSelectedId);
      setDetailState(nextSelectedId ? "loading" : "idle");
      setPreviewState(nextSelectedId ? "loading" : "idle");
      setQueueState("ready");
    } catch (loadError) {
      const failedState = reviewActionRefreshFailureState(message, loadError);
      setError(failedState.error);
      setQueueState(failedState.queueState);
    }
  }

  async function handleApprove() {
    if (!selectedId || previewState !== "ready") return;

    setActionKey("approve");
    setError(null);
    setActionMessage(null);
    try {
      await approveReviewDocument(selectedId);
      await reloadAfterAction("已通过审核");
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "审核通过失败");
    } finally {
      setActionKey(null);
    }
  }

  async function handleReject(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedId) return;

    const reason = rejectReason.trim();
    if (!reason) {
      setError("请填写退回原因");
      return;
    }

    setActionKey("reject");
    setError(null);
    setActionMessage(null);
    try {
      await rejectReviewDocument(selectedId, reason);
      await reloadAfterAction("已退回单据");
    } catch (rejectError) {
      setError(rejectError instanceof Error ? rejectError.message : "退回失败");
    } finally {
      setActionKey(null);
    }
  }

  return (
    <div className="review-layout">
      <section className="panel review-queue">
        <div className="panel-header">
          <h2>待审队列</h2>
          <div className="status-slot" role="status" aria-live="polite">
            {queueState === "loading" ? "读取中" : queueState === "error" ? "读取失败" : `${documents.length} 条`}
          </div>
        </div>
        <div className="table-wrap">
          <table className="data-table review-queue-table">
            <thead>
              <tr>
                <th>单据号</th>
                <th>类型</th>
                <th>业务日期</th>
                <th>等待</th>
                <th>摘要</th>
              </tr>
            </thead>
            <tbody>
              {queueState === "loading" ? (
                <tr>
                  <td colSpan={5} className="empty-cell">
                    读取中
                  </td>
                </tr>
              ) : documents.length > 0 ? (
                documents.map((document) => (
                  <tr
                    key={document.id}
                    className={document.id === selectedId ? "selected-row" : undefined}
                    onClick={() => setSelectedId(document.id)}
                  >
                    <td>
                      <button type="button" className="row-select-button" onClick={() => setSelectedId(document.id)}>
                        {document.document_no}
                      </button>
                    </td>
                    <td>{documentTypeLabels[document.document_type] ?? document.document_type}</td>
                    <td className="mono">{document.business_date}</td>
                    <td>
                      <span className="tag muted">{waitingLabel(document.submitted_at)}</span>
                    </td>
                    <td>{document.summary}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="empty-cell">
                    暂无待审核单据
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel review-detail">
        <div className="panel-header">
          <h2>审核详情</h2>
          <div className="status-slot" role="status" aria-live="polite">
            {detailState === "loading" ? "读取中" : previewState === "ready" ? "可审核" : selectedId ? "待预览" : "未选择"}
          </div>
        </div>

        {selectedDocument || detail ? (
          <div className="review-detail-grid">
            <DetailItem label="单据号" value={detail?.document_no ?? selectedDocument?.document_no} mono />
            <DetailItem
              label="类型"
              value={documentTypeLabels[detail?.document_type ?? selectedDocument?.document_type ?? ""] ?? detail?.document_type}
            />
            <DetailItem label="业务日期" value={detail?.business_date ?? selectedDocument?.business_date} mono />
            <DetailItem label="期间" value={detail?.period ?? selectedDocument?.period} mono />
            <DetailItem label="提交时间" value={detail?.submitted_at ?? selectedDocument?.submitted_at ?? "未记录"} mono />
            <DetailItem label="创建人" value={detail?.created_by ?? selectedDocument?.created_by} mono />
            <DetailItem label="经办人" value={detail?.operator_person_id ?? selectedDocument?.operator_person_id ?? "-"} mono />
            <DetailItem label="项目" value={detail?.project_id ?? selectedDocument?.project_id ?? "-"} mono />
            <DetailItem label="商户" value={detail?.merchant_id ?? selectedDocument?.merchant_id ?? "-"} mono />
            <DetailItem label="摘要" value={detail?.summary ?? selectedDocument?.summary} />
          </div>
        ) : (
          <div className="workspace-placeholder">请选择一条待审单据。</div>
        )}

        <div className="review-actions">
          <button
            type="button"
            onClick={() => void handleApprove()}
            disabled={!selectedId || previewState !== "ready" || Boolean(actionKey)}
          >
            {actionKey === "approve" ? "通过中" : "通过"}
          </button>
          <form className="reject-form" onSubmit={(event) => void handleReject(event)}>
            <label>
              退回原因
              <textarea
                value={rejectReason}
                onChange={(event) => setRejectReason(event.target.value)}
                rows={3}
                required
                disabled={!selectedId || Boolean(actionKey)}
              />
            </label>
            <button type="submit" className="secondary-button" disabled={!selectedId || Boolean(actionKey)}>
              {actionKey === "reject" ? "退回中" : "退回"}
            </button>
          </form>
        </div>

        {error ? <div className="notice error">{error}</div> : null}
        {actionMessage ? (
          <div className="message-line" role="status" aria-live="polite">
            {actionMessage}
          </div>
        ) : null}
      </section>

      <section className="panel review-preview">
        <div className="panel-header">
          <h2>审批预览</h2>
          <div className="status-slot" role="status" aria-live="polite">
            {previewState === "loading" ? "计算中" : previewState === "error" ? "失败" : preview ? `${groups.length} 组` : "未选择"}
          </div>
        </div>

        {previewState === "loading" ? <div className="workspace-placeholder">正在计算审批影响...</div> : null}
        {previewState === "error" ? <div className="workspace-placeholder">预览失败时不能通过审核。</div> : null}
        {previewState === "ready" && groups.length === 0 ? <div className="workspace-placeholder">无入账影响。</div> : null}
        {groups.length > 0 ? (
          <div className="preview-groups">
            {groups.map((group) => (
              <div key={group.title} className="preview-group">
                <div className="preview-group-header">
                  <strong>{group.title}</strong>
                  <span className="tag muted">{group.count} 条</span>
                </div>
                {group.sections.map((section) => (
                  <div key={section.label} className="preview-section">
                    <div className="risk-line">
                      <span>{section.label}</span>
                      <strong>{section.rows.length}</strong>
                    </div>
                    <ul>
                      {section.rows.map((row, index) => (
                        <li key={`${section.label}-${index}`} className="mono">
                          {formatPreviewRecord(row)}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function DetailItem({ label, value, mono = false }: { label: string; value: string | null | undefined; mono?: boolean }) {
  return (
    <div>
      <span>{label}</span>
      <strong className={mono ? "mono" : undefined}>{value || "-"}</strong>
    </div>
  );
}
