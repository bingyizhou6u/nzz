import { useEffect, useMemo, useState } from "react";
import { getJson, type ApiEnvelope } from "../api";
import { EmptyState, Notice, SectionTitle, StatusTag, type Tone } from "../components/ui";
import { hasCapability, type Capability, type PageKey, type SessionState } from "../session/sessionTypes";
import { buildWorkspaceTasks, summarizeDocumentCounts, type WorkspaceDocument } from "./workspace/workspaceModel";

interface WorkspacePageProps {
  session: Extract<SessionState, { status: "authenticated" }>;
  onNavigate: (page: PageKey) => void;
}

const statusLabels: Record<string, string> = {
  draft: "草稿",
  pending: "待审核",
  rejected: "已退回",
  approved: "已审核"
};

const statusTones: Record<string, Tone> = {
  draft: "muted",
  pending: "warning",
  rejected: "danger",
  approved: "ok"
};

export function WorkspacePage({ session, onNavigate }: WorkspacePageProps) {
  const canViewDocuments = hasCapability(session.capabilities, "documents.view");
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [isLoading, setIsLoading] = useState(canViewDocuments);
  const [loadError, setLoadError] = useState<string | null>(null);
  const counts = useMemo(() => summarizeDocumentCounts(documents), [documents]);
  const tasks = useMemo(() => buildWorkspaceTasks(documents), [documents]);
  const quickActions = useMemo(() => buildQuickActions(session.capabilities, onNavigate), [onNavigate, session.capabilities]);
  const workspaceStatus = !canViewDocuments ? "无权限" : isLoading ? "读取中" : loadError ? "读取失败" : "工作台已更新";

  useEffect(() => {
    let isCurrent = true;

    if (!canViewDocuments) {
      setDocuments([]);
      setLoadError(null);
      setIsLoading(false);
      return () => {
        isCurrent = false;
      };
    }

    async function loadDocuments() {
      setIsLoading(true);
      setLoadError(null);

      try {
        const response = await getJson<ApiEnvelope<WorkspaceDocument[]>>("/api/documents");
        if (isCurrent) {
          setDocuments(response.data);
        }
      } catch (error) {
        if (isCurrent) {
          setLoadError(error instanceof Error ? error.message : "读取工作台失败");
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
  }, [canViewDocuments]);

  function navigateTask(status: "draft" | "pending" | "rejected") {
    if (status === "pending" && hasCapability(session.capabilities, "documents.approve")) {
      onNavigate("review");
      return;
    }

    if (hasCapability(session.capabilities, "documents.view")) {
      onNavigate("documents");
    }
  }

  return (
    <div className="page-stack">
      {isLoading ? <Notice tone="muted">工作台单据读取中...</Notice> : null}
      {loadError ? <Notice tone="danger">{loadError}</Notice> : null}

      <section className="workspace-grid" aria-label="工作台内容">
        <article className="workspace-card">
          <div className="workspace-card-header">
            <SectionTitle title="待处理" />
            <StatusTag tone={!canViewDocuments ? "muted" : loadError ? "danger" : isLoading ? "muted" : "ok"}>
              {workspaceStatus}
            </StatusTag>
          </div>

          {!canViewDocuments ? (
            <EmptyState title="无单据查看权限" message="当前账号没有单据查看权限，无法读取或打开待处理单据。" />
          ) : isLoading ? (
            <EmptyState title="正在读取待处理单据" message="请稍候，系统正在读取现有单据。" />
          ) : loadError ? (
            <EmptyState title="无法读取单据" message="请稍后重试，或联系管理员检查单据服务状态。" />
          ) : tasks.length > 0 ? (
            <div className="task-list">
              {tasks.map((task) => (
                <button
                  key={task.id}
                  type="button"
                  className="task-row"
                  onClick={() => navigateTask(task.status)}
                >
                  <span>{task.label}</span>
                  <small>{task.meta}</small>
                  <StatusTag tone={statusTones[task.status]}>{statusLabels[task.status]}</StatusTag>
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="暂无待处理单据" message="草稿、待审核和退回单据会出现在这里。" />
          )}
        </article>

        <article className="workspace-card">
          <SectionTitle title="单据快照" />
          {!canViewDocuments ? (
            <EmptyState title="无可查看单据" message="当前账号没有单据查看权限，单据快照不可用。" />
          ) : isLoading ? (
            <EmptyState title="正在读取单据快照" message="快照会在单据列表读取完成后显示。" />
          ) : loadError ? (
            <EmptyState title="无法读取单据快照" message="单据读取失败，暂不显示数量快照。" />
          ) : (
            <div className="metric-grid">
              <Metric label="草稿" value={counts.draft} tone="muted" />
              <Metric label="待审核" value={counts.pending} tone="warning" />
              <Metric label="已退回" value={counts.rejected} tone="danger" />
              <Metric label="已审核" value={counts.approved} tone="ok" />
            </div>
          )}
        </article>

        <article className="workspace-card">
          <SectionTitle title="快捷入口" />
          {quickActions.length > 0 ? (
            <div className="quick-actions">
              {quickActions.map((action) => (
                <button
                  key={action.page}
                  type="button"
                  className={action.isPrimary ? undefined : "secondary-button"}
                  onClick={() => action.onClick()}
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : (
            <EmptyState title="暂无快捷入口" message="当前账号没有额外业务功能权限。" />
          )}
        </article>
      </section>
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: number; tone: Tone }) {
  return (
    <div className="metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
      <StatusTag tone={tone}>{statusLabelsByMetric[label] ?? label}</StatusTag>
    </div>
  );
}

const statusLabelsByMetric: Record<string, string> = {
  草稿: "可提交",
  待审核: "待处理",
  已退回: "需修订",
  已审核: "已入账"
};

function buildQuickActions(capabilities: readonly Capability[], onNavigate: (page: PageKey) => void) {
  const actions: Array<{ label: string; page: PageKey; isPrimary?: boolean; onClick: () => void }> = [];

  if (hasCapability(capabilities, "documents.view")) {
    actions.push({
      label: "单据中心",
      page: "documents",
      isPrimary: true,
      onClick: () => onNavigate("documents")
    });
  }

  if (hasCapability(capabilities, "documents.approve")) {
    actions.push({
      label: "审核中心",
      page: "review",
      onClick: () => onNavigate("review")
    });
  }

  if (hasCapability(capabilities, "reports.view")) {
    actions.push({
      label: "报表中心",
      page: "reports",
      onClick: () => onNavigate("reports")
    });
  }

  if (hasCapability(capabilities, "masterData.view")) {
    actions.push({
      label: "基础资料",
      page: "master-data",
      onClick: () => onNavigate("master-data")
    });
  }

  return actions;
}
