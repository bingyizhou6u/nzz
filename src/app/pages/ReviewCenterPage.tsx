import { useEffect, useMemo, useState } from "react";
import {
  approveReviewDocument,
  getReviewDocument,
  listReviewDocuments,
  previewReviewDocument,
  rejectReviewDocument
} from "./review/reviewApi";
import { DetailPanel, RecordList, SplitWorkspace } from "../components/interaction";
import { EmptyState, Notice, StatusTag } from "../components/ui";
import {
  documentTypeLabels,
  formatPreviewRecord,
  previewGroups,
  reviewActionAvailability,
  reviewRiskTone,
  sortReviewQueueByRisk,
  waitingLabel,
  type ReviewLoadState,
  type ReviewRiskTone
} from "./review/reviewModel";
import type { ApprovalPreviewState, ReviewDocumentRow } from "./review/reviewTypes";

type LoadState = ReviewLoadState;

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
  const selectedContext = detail ?? selectedDocument;
  const groups = useMemo(() => (preview ? previewGroups(preview, selectedContext) : []), [preview, selectedContext]);
  const actionAvailability = reviewActionAvailability({ selectedId, previewState, actionKey, rejectReason });

  useEffect(() => {
    if (!canRenderReviewCenter(capabilities)) return;
    let isCurrent = true;

    async function loadQueue() {
      setQueueState("loading");
      setError(null);
      try {
        const nextDocuments = sortReviewQueueByRisk(await listReviewDocuments());
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
          <h2>审核权限</h2>
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
      const nextDocuments = sortReviewQueueByRisk(await listReviewDocuments());
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
    if (!selectedId || !actionAvailability.canApprove) return;

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

  async function handleReject() {
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

  const queueItems = documents.map((document) => ({
    id: document.id,
    title: document.document_no,
    description: `${documentTypeLabels[document.document_type] ?? document.document_type} / ${document.business_date}`,
    document
  }));
  const detailStatus = reviewDetailStatus(detailState, previewState, selectedId);
  const previewStatus = reviewPreviewStatus(previewState, preview, groups.length);

  return (
    <div className="page-stack">
      <SplitWorkspace
        className="review-workspace"
        list={
          <section className="panel review-queue-panel">
            <div className="panel-header">
              <div>
                <h2>审核队列</h2>
                <p className="panel-subtitle">按风险和等待时间排序，优先处理超时单据。</p>
              </div>
              <div className="status-slot" role="status" aria-live="polite">
                {queueState === "loading" ? "读取中" : queueState === "error" ? "读取失败" : `${documents.length} 条`}
              </div>
            </div>

            {queueState === "error" && error ? <Notice tone="danger">{error}</Notice> : null}

            <div className="review-record-list-region">
              <RecordList
                aria-label="审核队列"
                items={queueState === "loading" || queueState === "error" ? [] : queueItems}
                selectedId={selectedId}
                onSelect={(id) => setSelectedId(id)}
                emptyState={
                  queueState === "loading" ? (
                    <EmptyState title="读取中" message="正在读取待审单据" />
                  ) : queueState === "error" ? (
                    <EmptyState title="读取失败" message="请处理错误后重新读取" />
                  ) : (
                    <EmptyState title="暂无待审核单据" message="当前队列没有需要处理的单据" />
                  )
                }
                renderMeta={(item) => item.document.summary}
                renderStatus={(item) => {
                  const tone = reviewRiskTone(item.document);
                  return (
                    <span className="review-queue-status">
                      <StatusTag tone={tone}>{reviewRiskLabel(tone)}</StatusTag>
                      <span>{waitingLabel(item.document.submitted_at)}</span>
                    </span>
                  );
                }}
              />
            </div>
          </section>
        }
        detail={
          <DetailPanel
            className="review-detail-panel"
            title="审核详情"
            description={
              selectedContext
                ? `${selectedContext.document_no} / ${documentTypeLabels[selectedContext.document_type] ?? selectedContext.document_type}`
                : "从左侧队列选择一条单据查看详情、影响预览和审批动作。"
            }
            status={<StatusTag tone={detailStatus.tone}>{detailStatus.label}</StatusTag>}
          >
            {error && queueState !== "error" ? <Notice tone="danger">{error}</Notice> : null}
            {actionMessage ? <Notice tone="ok">{actionMessage}</Notice> : null}

            {selectedContext ? (
              <div className="review-detail-grid">
                <DetailItem label="单据号" value={selectedContext.document_no} mono />
                <DetailItem
                  label="类型"
                  value={documentTypeLabels[selectedContext.document_type] ?? selectedContext.document_type}
                />
                <DetailItem label="业务日期" value={selectedContext.business_date} mono />
                <DetailItem label="期间" value={selectedContext.period} mono />
                <DetailItem label="提交时间" value={selectedContext.submitted_at ?? "未记录"} mono />
                <DetailItem label="创建人" value={selectedContext.created_by} mono />
                <DetailItem label="经办人" value={selectedContext.operator_person_id ?? "-"} mono />
                <DetailItem label="项目" value={selectedContext.project_id ?? "-"} mono />
                <DetailItem label="商户" value={selectedContext.merchant_id ?? "-"} mono />
                <DetailItem label="摘要" value={selectedContext.summary} />
              </div>
            ) : (
              <EmptyState title={queueState === "loading" ? "读取中" : "未选择单据"} message="左侧队列选中后会在这里显示审核上下文" />
            )}

            <section className="review-impact-panel">
              <div className="review-section-heading">
                <div>
                  <h3>入账影响预览</h3>
                  <p>预览只读取将要写入的资金、备用金、借款和项目影响。</p>
                </div>
                <StatusTag tone={previewStatus.tone}>{previewStatus.label}</StatusTag>
              </div>

              {previewState === "loading" ? <EmptyState title="计算中" message="正在计算审批后的入账影响" /> : null}
              {previewState === "error" ? <EmptyState title="预览失败" message="预览失败时不能通过审核" /> : null}
              {previewState === "ready" && groups.length === 0 ? <EmptyState title="无入账影响" message="当前单据不会产生可展示的影响记录" /> : null}
              {groups.length > 0 ? (
                <div className="preview-groups">
                  {groups.map((group) => (
                    <div key={group.title} className="preview-group">
                      <div className="preview-group-header">
                        <strong>{group.title}</strong>
                        <StatusTag tone="muted">{group.count} 条</StatusTag>
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

            <div className="review-action-dock">
              <div className="review-action-copy">
                <strong>审批动作</strong>
                <span>通过会正式入账；退回会保留原因，等待制单人修正后重新提交。</span>
              </div>
              <div className="review-action-controls">
                <button type="button" onClick={() => void handleApprove()} disabled={!actionAvailability.canApprove}>
                  {actionKey === "approve" ? "通过中" : "通过"}
                </button>
                <label className="reject-reason-field">
                  退回原因
                  <textarea
                    aria-label="退回原因"
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                    onInput={(event) => setRejectReason(event.currentTarget.value)}
                    rows={3}
                    maxLength={240}
                    placeholder="说明需要补充或修正的内容"
                    disabled={!selectedId || actionAvailability.isBusy}
                  />
                </label>
                <button type="button" className="secondary-button" onClick={() => void handleReject()} disabled={!actionAvailability.canReject}>
                  {actionKey === "reject" ? "退回中" : "退回"}
                </button>
              </div>
            </div>
          </DetailPanel>
        }
      />
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

function reviewRiskLabel(tone: ReviewRiskTone): string {
  if (tone === "warning") return "超时";
  if (tone === "ok") return "正常";
  return "未记录";
}

function reviewDetailStatus(detailState: LoadState, previewState: LoadState, selectedId: string | null) {
  if (!selectedId) return { label: "未选择", tone: "muted" as const };
  if (detailState === "loading") return { label: "读取中", tone: "warning" as const };
  if (previewState === "loading") return { label: "计算中", tone: "warning" as const };
  if (previewState === "error" || detailState === "error") return { label: "需处理", tone: "danger" as const };
  if (previewState === "ready") return { label: "可审核", tone: "ok" as const };
  return { label: "待预览", tone: "muted" as const };
}

function reviewPreviewStatus(previewState: LoadState, preview: ApprovalPreviewState | null, groupCount: number) {
  if (previewState === "loading") return { label: "计算中", tone: "warning" as const };
  if (previewState === "error") return { label: "失败", tone: "danger" as const };
  if (preview) return { label: `${groupCount} 组`, tone: groupCount > 0 ? ("ok" as const) : ("muted" as const) };
  return { label: "未选择", tone: "muted" as const };
}
