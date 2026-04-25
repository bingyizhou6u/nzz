import type { ReactNode } from "react";
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

const pageDescriptions: Partial<Record<PageKey, string>> = {
  workspace: "集中查看待处理事项与常用业务入口。",
  documents: "创建、提交和查询业务单据。",
  review: "处理待审核单据并查看入账影响。",
  reports: "按期间、项目、往来和账户查看正式报表。",
  "master-data": "维护人员、项目、账户、币种和分类等基础资料。",
  "period-locks": "管理期间锁账状态和月结控制。"
};

export function AppShell({ session, pages, activePage, onPageChange, children }: AppShellProps) {
  const activeNavigationItem = pages.find((page) => page.key === activePage);
  const pageTitle = activeNavigationItem?.label ?? "内部管理会计台账";

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
                {page.label}
              </button>
            ))}
          </nav>
        ) : null}
      </aside>

      <div className="app-main-column">
        <div className="top-status-bar">
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

        <PageHeader title={pageTitle} description={activePage ? pageDescriptions[activePage] : "正式系统 Beta"} />

        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
