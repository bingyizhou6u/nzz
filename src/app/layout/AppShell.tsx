import type { ReactNode } from "react";
import { StatusTag, type Tone } from "../components/ui";
import { roleLabels } from "../session/sessionModel";
import type { NavigationItem, PageKey, SessionState } from "../session/sessionTypes";
import { PageHeader } from "./PageHeader";

interface AppShellProps {
  session: SessionState;
  pages: NavigationItem[];
  activePage: PageKey | null;
  onPageChange: (page: PageKey) => void;
  children: ReactNode;
}

interface PageHeaderMetadata {
  title: string;
  description: string;
  navDescription: string;
  section: string;
}

const pageHeaderMetadata: Record<PageKey, PageHeaderMetadata> = {
  workspace: {
    title: "工作台",
    description: "集中查看待处理事项、单据快照和常用业务入口。",
    navDescription: "下一步任务",
    section: "工作流入口"
  },
  documents: {
    title: "单据中心",
    description: "创建、提交、查看和跟踪业务单据。",
    navDescription: "源数据录入",
    section: "源数据"
  },
  review: {
    title: "审核中心",
    description: "处理待审核单据，查看入账影响后再确认。",
    navDescription: "审批入账",
    section: "审核"
  },
  reports: {
    title: "报表中心",
    description: "按资金、项目、费用、备用金、借款和异常口径查看管理报表。",
    navDescription: "经营分析",
    section: "报表"
  },
  "master-data": {
    title: "基础资料治理",
    description: "维护人员、项目、商户、账户、币种和管理科目。",
    navDescription: "资料治理",
    section: "基础资料"
  },
  "month-close": {
    title: "对账月结",
    description: "运行月结检查，处理异常项，并确认期间进入锁账前状态。",
    navDescription: "期间锁账",
    section: "月结"
  }
};

const systemStatusItems: Array<{ label: string; tone: Tone }> = [
  { label: "部署目标：Cloudflare Workers", tone: "ok" },
  { label: "数据模式：演示数据保留", tone: "warning" },
  { label: "当前期间：2026-04（演示）", tone: "muted" }
];

export function AppShell({ session, pages, activePage, onPageChange, children }: AppShellProps) {
  const activePageMetadata = activePage ? pageHeaderMetadata[activePage] : null;
  const pageTitle = activePageMetadata?.title ?? "内部管理会计台账";
  const pageDescription = activePageMetadata?.description ?? "正式系统 Beta";

  return (
    <div className="app-shell">
      <aside className="app-sidebar" aria-label="主导航">
        <div className="app-brand">
          <strong>内部管理会计台账</strong>
          <span>正式系统 Beta</span>
        </div>
        {session.status === "authenticated" && pages.length > 0 ? (
          <nav className="sidebar-nav">
            {pages.map((page) => (
              <button
                key={page.key}
                type="button"
                className={page.key === activePage ? "sidebar-nav-button active" : "sidebar-nav-button"}
                data-page-key={page.key}
                onClick={() => onPageChange(page.key)}
                aria-current={page.key === activePage ? "page" : undefined}
              >
                <span className="sidebar-nav-label">{page.label}</span>
                <small>{pageHeaderMetadata[page.key].navDescription}</small>
              </button>
            ))}
          </nav>
        ) : null}
      </aside>

      <div className="app-main-column">
        <div className="top-status-bar">
          <div className="system-status-strip" aria-label="系统运行状态">
            {systemStatusItems.map((item) => (
              <StatusTag key={item.label} tone={item.tone}>
                {item.label}
              </StatusTag>
            ))}
          </div>
          {session.status === "authenticated" ? (
            <div className="identity-bar" aria-label="当前登录身份">
              <div>
                <strong>
                  {session.person.alias ? `${session.person.name} / ${session.person.alias}` : session.person.name}
                </strong>
                <span>{session.person.loginEmail}</span>
              </div>
              <div className="role-tags" aria-label="角色">
                {session.person.roles.map((role) => (
                  <span key={role} className="tag muted">
                    {roleLabels[role]}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div className="identity-bar" role="status" aria-live="polite">
              {session.status === "loading" ? "正在确认登录身份" : "身份不可用"}
            </div>
          )}
        </div>

        <PageHeader
          title={pageTitle}
          description={pageDescription}
          status={activePageMetadata ? <StatusTag tone="muted">{activePageMetadata.section}</StatusTag> : null}
        />

        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
