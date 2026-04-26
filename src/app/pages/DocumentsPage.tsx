import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { ActionType, DocumentType } from "../../domain/types";
import { getJson, postJson, type ApiEnvelope } from "../api";
import { DetailPanel, FilterStrip, RecordList, SplitWorkspace, WorkflowStepper } from "../components/interaction";
import { EmptyState, Notice, StatusTag } from "../components/ui";
import type { Capability } from "../session/sessionTypes";
import { DocumentTypeFields } from "./documents/DocumentTypeFields";
import {
  buildDocumentPayload,
  createInitialDocumentForm,
  filterDocumentsByStatus,
  validateDocumentForm
} from "./documents/documentEntryModel";
import {
  actionTypeLabels,
  canCreateDraftDocument,
  documentMatchesSearch,
  documentTypeLabels,
  documentTypeOptions,
  documentWorkflowActions,
  isSelectedOriginalDocumentValid,
  originalDocumentQueryType,
  scenarioDefaults,
  statusLabels,
  statusTone,
  supportedDraftActionTypes,
  supportedDraftDocumentTypes,
  workflowActionBody,
  type DocumentActionResponse,
  type DocumentListItem,
  type DocumentResponse,
  type EntryWizardStep,
  type RightPanelMode,
  type WorkflowAction
} from "./documents/documentPageModel";
import { deriveDocumentEntryState } from "./documents/documentEntryRules";
import type { DocumentEntryForm, DocumentEntryOptions, OriginalDocumentOption } from "./documents/documentEntryTypes";
import {
  documentScenarioCards,
  documentTypeGroup,
  entryStepState,
  nextStepLabel,
  type DocumentWorkflowGroupId
} from "./documents/documentWorkflowModel";

export {
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
} from "./documents/documentPageModel";

interface DocumentsPageProps { capabilities: readonly Capability[]; }


export function DocumentsPage({ capabilities }: DocumentsPageProps) {
  const initialForm = useMemo(() => createInitialDocumentForm(), []);
  const emptyOptions = useMemo<DocumentEntryOptions>(
    () => ({ people: [], projects: [], merchants: [], accounts: [], currencies: [], categories: [] }),
    []
  );
  const canCreate = canCreateDraftDocument(capabilities);
  const [documents, setDocuments] = useState<DocumentListItem[]>([]);
  const [statusFilter, setStatusFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState<"all" | DocumentType>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedDocumentId, setSelectedDocumentId] = useState<string | null>(null);
  const [rightPanelMode, setRightPanelMode] = useState<RightPanelMode>("detail");
  const [entryWizardStep, setEntryWizardStep] = useState<EntryWizardStep>("type");
  const [rejectReason, setRejectReason] = useState("");
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionKey, setActionKey] = useState<string | null>(null);
  const [result, setResult] = useState<DocumentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const entryState = useMemo(
    () => deriveDocumentEntryState(form, entryOptions, originalDocuments),
    [entryOptions, form, originalDocuments]
  );
  const workflowSteps = useMemo(
    () => entryStepState(form, entryState.requiredFields, entryState.validationErrors),
    [entryState.requiredFields, entryState.validationErrors, form]
  );
  const detailStep = workflowSteps.find((step) => step.id === "details");
  const isReviewReady =
    Boolean(detailStep?.canProceed) && !areOriginalDocumentsLoading && !originalDocumentsError && !optionsError;
  const visibleDocuments = useMemo(
    () =>
      filterDocumentsByStatus(documents, statusFilter)
        .filter((document) => typeFilter === "all" || document.document_type === typeFilter)
        .filter((document) => documentMatchesSearch(document, searchTerm)),
    [documents, searchTerm, statusFilter, typeFilter]
  );
  const selectedDocument = useMemo(
    () => documents.find((document) => document.id === selectedDocumentId) ?? null,
    [documents, selectedDocumentId]
  );
  const hasListFilter = statusFilter !== "all" || typeFilter !== "all" || searchTerm.trim() !== "";
  const documentListStatusText = hasListFilter
    ? `显示 ${visibleDocuments.length} / 总计 ${documents.length}`
    : `${documents.length} 条`;
  const emptyDocumentListText = hasListFilter ? "当前筛选下暂无单据" : "暂无数据";

  useEffect(() => {
    let isCurrent = true;

    async function loadOptions() {
      if (!canCreate) {
        setAreOptionsLoading(false);
        setOptionsError(null);
        return;
      }

      setAreOptionsLoading(true);
      setOptionsError(null);
      try {
        const response = await getJson<ApiEnvelope<DocumentEntryOptions>>("/api/document-entry/options");
        if (isCurrent) {
          setEntryOptions(response.data);
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
  }, [canCreate]);

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
    setSelectedDocumentId((current) => current && documents.some((document) => document.id === current) ? current : documents[0]?.id ?? null);
  }, [documents]);

  useEffect(() => {
    let isCurrent = true;

    async function loadOriginalDocuments() {
      if (!canCreate) {
        setOriginalDocuments([]);
        setOriginalDocumentsError(null);
        setAreOriginalDocumentsLoading(false);
        return;
      }

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
  }, [canCreate, form.actionType, form.documentType]);

  function refreshDocuments() {
    setReloadKey((value) => value + 1);
  }

  function resetFormFor(documentType: DocumentType, actionType: ActionType) {
    setForm((current) => ({
      ...createInitialDocumentForm(),
      documentType,
      actionType,
      businessDate: current.businessDate,
      period: current.period,
      currencyCode: current.currencyCode
    }));
  }

  function openCreateWizard() {
    setRightPanelMode("create");
    setEntryWizardStep("type");
    setResult(null);
    setError(null);
  }

  function selectScenario(groupId: DocumentWorkflowGroupId) {
    const next = scenarioDefaults[groupId];
    resetFormFor(next.documentType, next.actionType);
    setEntryWizardStep("details");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResult(null);
    setError(null);

    if (!canCreate) {
      setError("当前账号没有创建单据权限，不能创建草稿。");
      return;
    }

    const validationErrors = validateDocumentForm(form, entryOptions, "", entryState);
    if (validationErrors.length > 0) {
      setError(validationErrors.join("；"));
      setEntryWizardStep("details");
      return;
    }
    if (originalDocumentsError) {
      setError(originalDocumentsError);
      setEntryWizardStep("details");
      return;
    }
    if (!isSelectedOriginalDocumentValid(form.originalDocumentId, originalDocuments)) {
      setError("请选择有效原单据");
      setEntryWizardStep("details");
      return;
    }

    setIsSubmitting(true);

    try {
      const response = await postJson<ApiEnvelope<DocumentResponse>>(
        "/api/documents",
        buildDocumentPayload(form, "")
      );
      setResult(response.data);
      setDocuments((current) => [
        {
          id: response.data.id,
          document_no: response.data.documentNo,
          document_type: form.documentType,
          business_date: form.businessDate,
          status: response.data.status,
          summary: form.summary
        },
        ...current.filter((document) => document.id !== response.data.id)
      ]);
      setSelectedDocumentId(response.data.id);
      setRightPanelMode("detail");
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

  async function handleWorkflowAction(document: DocumentListItem, action: WorkflowAction, reason = rejectReason) {
    setResult(null);
    setError(null);

    if (!documentWorkflowActions(document.status, capabilities).includes(action)) {
      setError("当前账号没有该单据操作权限。");
      return;
    }

    if (action === "reject" && !reason.trim()) {
      setError("请填写退回原因。");
      return;
    }

    const nextActionKey = `${document.id}:${action}`;
    setActionKey(nextActionKey);

    try {
      const response = await postJson<ApiEnvelope<DocumentActionResponse>>(
        `/api/documents/${encodeURIComponent(document.id)}/${action}`,
        workflowActionBody(action, "", reason)
      );
      setResult({ id: response.data.id, documentNo: document.document_no, status: response.data.status });
      setRejectReason("");
      refreshDocuments();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "单据操作失败");
    } finally {
      setActionKey(null);
    }
  }

  return (
    <div className="page-stack">
      <SplitWorkspace
        className="documents-workspace"
        list={renderDocumentList()}
        detail={rightPanelMode === "create" ? renderCreateWizard() : renderDocumentDetail()}
      />
    </div>
  );

  function renderDocumentList() {
    const recordItems = visibleDocuments.map((document) => ({
      id: document.id,
      title: document.document_no,
      description: `${documentTypeLabels[document.document_type] ?? document.document_type} / ${document.business_date}`,
      document
    }));

    return (
      <section className="panel document-list-panel">
        <div className="panel-header">
          <div>
            <h2>单据列表</h2>
            <p className="panel-subtitle">筛选只影响左侧列表，右侧详情保持当前选中单据。</p>
          </div>
          <div className="header-actions">
            {!canCreate ? <StatusTag tone="muted">只读</StatusTag> : null}
            {canCreate ? (
              <button type="button" onClick={openCreateWizard}>
                新建单据
              </button>
            ) : null}
          </div>
        </div>

        <FilterStrip
          className="document-filter-strip"
          actions={
            <>
              <div className="status-slot" role="status" aria-live="polite">
                {isLoading ? "读取中" : loadError ? "读取失败" : documentListStatusText}
              </div>
              <button type="button" className="secondary-button" onClick={refreshDocuments} disabled={isLoading}>
                重新读取
              </button>
            </>
          }
        >
          <label>
            状态
            <select aria-label="单据状态" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">全部状态</option>
              <option value="draft">草稿</option>
              <option value="pending">待审核</option>
              <option value="approved">已审核</option>
              <option value="rejected">已退回</option>
            </select>
          </label>
          <label>
            类型
            <select
              aria-label="单据类型"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value as "all" | DocumentType)}
            >
              <option value="all">全部类型</option>
              {documentTypeOptions.map((documentType) => (
                <option key={documentType} value={documentType}>
                  {documentTypeLabels[documentType]}
                </option>
              ))}
            </select>
          </label>
          <label>
            搜索
            <input
              aria-label="搜索单据"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              onInput={(event) => setSearchTerm(event.currentTarget.value)}
              placeholder="单据号、摘要、类型"
              maxLength={80}
            />
          </label>
        </FilterStrip>

        {loadError ? <Notice tone="danger">{loadError}</Notice> : null}

        <div className="document-record-list-region">
          <RecordList
            aria-label="单据列表"
            items={isLoading || loadError ? [] : recordItems}
            selectedId={rightPanelMode === "detail" ? selectedDocumentId : null}
            onSelect={(id) => {
              setSelectedDocumentId(id);
              setRightPanelMode("detail");
              setError(null);
              setResult(null);
            }}
            emptyState={
              isLoading ? (
                <EmptyState title="读取中" message="正在读取单据列表" />
              ) : loadError ? (
                <EmptyState title="读取失败" message="请处理错误后重新读取" />
              ) : (
                <EmptyState title={emptyDocumentListText} message="调整筛选条件或新建单据" />
              )
            }
            renderMeta={(item) => item.document.summary}
            renderStatus={(item) => <StatusTag tone={statusTone(item.document.status)}>{statusLabels[item.document.status] ?? item.document.status}</StatusTag>}
          />
        </div>
      </section>
    );
  }

  function renderDocumentDetail() {
    if (!selectedDocument) {
      return (
        <DetailPanel
          className="document-detail-panel"
          title="选择单据"
          description="从左侧列表选择一条单据查看详情和可执行动作。"
          actions={canCreate ? <button type="button" onClick={openCreateWizard}>新建单据</button> : null}
        >
          <EmptyState title={isLoading ? "读取中" : "暂无单据"} message="当前没有可展示的单据详情" />
        </DetailPanel>
      );
    }

    const actions = documentWorkflowActions(selectedDocument.status, capabilities);

    return (
      <DetailPanel
        className="document-detail-panel"
        title={selectedDocument.document_no}
        description={`${documentTypeLabels[selectedDocument.document_type] ?? selectedDocument.document_type} / ${selectedDocument.business_date}`}
        status={<StatusTag tone={statusTone(selectedDocument.status)}>{statusLabels[selectedDocument.status] ?? selectedDocument.status}</StatusTag>}
        actions={canCreate ? <button type="button" onClick={openCreateWizard}>新建单据</button> : null}
      >
        <div className="document-detail-grid">
          <div>
            <span>摘要</span>
            <strong>{selectedDocument.summary || "未填写"}</strong>
          </div>
          <div>
            <span>单据类型</span>
            <strong>{documentTypeLabels[selectedDocument.document_type] ?? selectedDocument.document_type}</strong>
          </div>
          <div>
            <span>业务日期</span>
            <strong className="mono">{selectedDocument.business_date}</strong>
          </div>
          <div>
            <span>当前状态</span>
            <strong>{statusLabels[selectedDocument.status] ?? selectedDocument.status}</strong>
          </div>
        </div>

        {actions.length > 0 ? (
          <div className="document-detail-action-bar">
            <div className="document-detail-action-copy">
              <strong>可执行动作</strong>
              <span>操作会写入工作流状态，详情区保留当前单据上下文。</span>
            </div>
            <div className="document-detail-actions">
              {actions.includes("submit") ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void handleWorkflowAction(selectedDocument, "submit")}
                  disabled={Boolean(actionKey) || isSubmitting}
                >
                  {actionKey === `${selectedDocument.id}:submit` ? "提交中" : "提交"}
                </button>
              ) : null}
              {actions.includes("approve") ? (
                <button
                  type="button"
                  onClick={() => void handleWorkflowAction(selectedDocument, "approve")}
                  disabled={Boolean(actionKey) || isSubmitting}
                >
                  {actionKey === `${selectedDocument.id}:approve` ? "审核中" : "通过"}
                </button>
              ) : null}
              {actions.includes("reject") ? (
                <label className="reject-reason-field">
                  退回原因
                  <textarea
                    aria-label="退回原因"
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                    onInput={(event) => setRejectReason(event.currentTarget.value)}
                    maxLength={240}
                    placeholder="说明需要补充或修正的内容"
                  />
                </label>
              ) : null}
              {actions.includes("reject") ? (
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => void handleWorkflowAction(selectedDocument, "reject")}
                  disabled={Boolean(actionKey) || isSubmitting || !rejectReason.trim()}
                >
                  {actionKey === `${selectedDocument.id}:reject` ? "退回中" : "退回"}
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <Notice tone="muted">当前状态没有可执行动作。</Notice>
        )}

        <div className="message-line" role="status" aria-live="polite">
          {error ? (
            <span className="text-error">{error}</span>
          ) : result ? (
            <span>
              {result.documentNo} / {statusLabels[result.status] ?? result.status}
            </span>
          ) : null}
        </div>
      </DetailPanel>
    );
  }

  function renderCreateWizard() {
    const stepperSteps = workflowSteps.map((step) => ({
      id: step.id,
      label: step.id === "type" ? "选择业务场景" : step.title,
      description: step.summary
    }));

    return (
      <DetailPanel
        className="document-detail-panel document-entry-panel"
        title="新建单据"
        description="按业务场景录入，先确认类型，再填写字段，最后预览保存为草稿。"
        status={<StatusTag tone={error ? "danger" : result ? "ok" : "warning"}>{isSubmitting ? "提交中" : error ? "失败" : result ? "完成" : "录入中"}</StatusTag>}
        actions={selectedDocument ? <button type="button" className="secondary-button" onClick={() => setRightPanelMode("detail")}>返回详情</button> : null}
      >
        {!canCreate ? <Notice>当前账号没有创建单据权限，不能创建草稿。</Notice> : null}
        {canCreate && optionsError ? <Notice tone="danger">{optionsError}</Notice> : null}

        {canCreate ? (
          <form className="document-wizard" onSubmit={handleSubmit}>
            <WorkflowStepper steps={stepperSteps} currentStepId={entryWizardStep} aria-label="单据创建步骤" />
            {entryWizardStep === "type" ? renderWizardTypeStep() : null}
            {entryWizardStep === "details" ? renderWizardDetailsStep() : null}
            {entryWizardStep === "review" ? renderWizardReviewStep() : null}
          </form>
        ) : null}

        <div className="message-line" role="status" aria-live="polite">
          {error ? (
            <span className="text-error">{error}</span>
          ) : result ? (
            <span>
              {result.documentNo} / {statusLabels[result.status] ?? result.status}
            </span>
          ) : null}
        </div>
      </DetailPanel>
    );
  }

  function renderWizardTypeStep() {
    const selectedGroup = documentTypeGroup(form.documentType, form.actionType);

    return (
      <div className="document-wizard-step">
        <div className="document-scenario-grid">
          {documentScenarioCards().map((card) => (
            <button
              key={card.id}
              type="button"
              className={card.id === selectedGroup ? "document-scenario-card selected" : "document-scenario-card"}
              onClick={() => selectScenario(card.id)}
            >
              <strong>{card.title}</strong>
              <span>{card.description}</span>
              <small>{card.requiredHint}</small>
            </button>
          ))}
        </div>

        <div className="form-grid document-form">
          <label>
            单据类型
            <select
              value={form.documentType}
              onChange={(event) => resetFormFor(event.target.value as DocumentType, form.actionType)}
            >
              {supportedDraftDocumentTypes.map((documentType) => (
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
              onChange={(event) => setForm((current) => ({ ...current, actionType: event.target.value as ActionType, originalDocumentId: "" }))}
            >
              {supportedDraftActionTypes.map((actionType) => (
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
        </div>

        <div className="document-wizard-actions">
          <button type="button" onClick={() => setEntryWizardStep("details")}>
            继续填写业务字段
          </button>
        </div>
      </div>
    );
  }

  function renderWizardDetailsStep() {
    return (
      <div className="document-wizard-step">
        <div className="form-grid document-form">
          <DocumentTypeFields
            form={form}
            setForm={setForm}
            entryState={entryState}
            originalDocuments={originalDocuments}
          />
        </div>

        {areOptionsLoading ? <Notice tone="muted">正在读取基础资料选项。</Notice> : null}
        {areOriginalDocumentsLoading ? <Notice tone="muted">正在读取可关联的原单据。</Notice> : null}
        {originalDocumentsError ? <Notice tone="danger">{originalDocumentsError}</Notice> : null}
        {entryState.validationErrors.length > 0 ? <Notice tone="danger">{entryState.validationErrors.join("；")}</Notice> : null}
        {!isReviewReady && detailStep?.missingFieldLabels.length ? (
          <Notice tone="warning">还需要填写：{detailStep.missingFieldLabels.join("、")}</Notice>
        ) : null}

        <div className="document-wizard-actions">
          <button type="button" className="secondary-button" onClick={() => setEntryWizardStep("type")}>
            返回场景
          </button>
          <button
            type="button"
            onClick={() => setEntryWizardStep("review")}
            disabled={!isReviewReady}
          >
            预览单据
          </button>
        </div>
      </div>
    );
  }

  function renderWizardReviewStep() {
    return (
      <div className="document-wizard-step">
        <div className="document-review-summary">
          <div>
            <span>单据类型</span>
            <strong>{documentTypeLabels[form.documentType]}</strong>
          </div>
          <div>
            <span>动作类型</span>
            <strong>{actionTypeLabels[form.actionType]}</strong>
          </div>
          <div>
            <span>业务日期</span>
            <strong className="mono">{form.businessDate}</strong>
          </div>
          <div>
            <span>下一步</span>
            <strong>{nextStepLabel(form, entryState.requiredFields, entryState.validationErrors)}</strong>
          </div>
          <div className="wide-field">
            <span>摘要</span>
            <strong>{form.summary || "未填写"}</strong>
          </div>
        </div>

        {!isReviewReady ? <Notice tone="warning">请返回业务字段步骤补齐必填项后再创建草稿。</Notice> : null}

        <div className="document-wizard-actions">
          <button type="button" className="secondary-button" onClick={() => setEntryWizardStep("details")}>
            返回字段
          </button>
          <button
            type="submit"
            disabled={
              !isReviewReady ||
              isSubmitting ||
              areOptionsLoading ||
              areOriginalDocumentsLoading ||
              Boolean(optionsError) ||
              Boolean(originalDocumentsError)
            }
          >
            {isSubmitting ? "提交中" : "创建草稿"}
          </button>
        </div>
      </div>
    );
  }
}
