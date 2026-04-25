import { useEffect, useMemo, useState } from "react";
import { DocumentsPage } from "./pages/DocumentsPage";
import { MasterDataPage } from "./pages/MasterDataPage";
import { PeriodLocksPage } from "./pages/PeriodLocksPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ReviewCenterPage } from "./pages/ReviewCenterPage";
import { getSession } from "./session/sessionApi";
import { roleLabels, visibleNavigationItems } from "./session/sessionModel";
import type { PageKey, SessionState } from "./session/sessionTypes";

const unboundPersonMessage = "当前登录邮箱未绑定启用人员，请联系管理员。";

export function App() {
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const [activePage, setActivePage] = useState<PageKey | null>(null);
  const pages = useMemo(() => visibleNavigationItems(session), [session]);
  const activePageKey = pages.find((page) => page.key === activePage)?.key ?? pages[0]?.key ?? null;

  useEffect(() => {
    let isCurrent = true;

    async function loadSession() {
      try {
        const response = await getSession();
        if (isCurrent) {
          setSession({ status: "authenticated", person: response.person, capabilities: response.capabilities });
        }
      } catch {
        if (isCurrent) {
          setSession({ status: "error", message: unboundPersonMessage });
        }
      }
    }

    void loadSession();

    return () => {
      isCurrent = false;
    };
  }, []);

  useEffect(() => {
    if (session.status !== "authenticated") return;
    if (pages.length === 0) {
      setActivePage(null);
      return;
    }
    if (!activePage || !pages.some((page) => page.key === activePage)) {
      setActivePage(pages[0].key);
    }
  }, [activePage, pages, session.status]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>内部管理会计台账</h1>
          <p>正式系统 Beta</p>
        </div>
        <div className="header-session">
          {session.status === "authenticated" ? (
            <div className="identity-bar" aria-label="当前登录身份">
              <div>
                <strong>{session.person.alias ? `${session.person.name} / ${session.person.alias}` : session.person.name}</strong>
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
          {session.status === "authenticated" && pages.length > 0 ? (
            <nav className="tabs" aria-label="主导航">
              {pages.map((page) => (
                <button
                  key={page.key}
                  type="button"
                  className={page.key === activePageKey ? "tab active" : "tab"}
                  onClick={() => setActivePage(page.key)}
                  aria-current={page.key === activePageKey ? "page" : undefined}
                >
                  {page.label}
                </button>
              ))}
            </nav>
          ) : null}
        </div>
      </header>

      <main>
        {session.status === "loading" ? <SessionStatusPanel title="读取会话" message="正在加载当前登录身份..." /> : null}
        {session.status === "error" ? <SessionStatusPanel title="无法进入系统" message={session.message} isError /> : null}
        {session.status === "authenticated" && pages.length === 0 ? (
          <SessionStatusPanel title="暂无可访问功能" message="当前账号没有可用功能，请联系管理员调整权限。" />
        ) : null}
        {session.status === "authenticated" && activePageKey === "documents" ? (
          <DocumentsPage capabilities={session.capabilities} />
        ) : null}
        {session.status === "authenticated" && activePageKey === "review" ? (
          <ReviewCenterPage capabilities={session.capabilities} />
        ) : null}
        {session.status === "authenticated" && activePageKey === "reports" ? <ReportsPage /> : null}
        {session.status === "authenticated" && activePageKey === "master-data" ? (
          <MasterDataPage capabilities={session.capabilities} />
        ) : null}
        {session.status === "authenticated" && activePageKey === "period-locks" ? (
          <PeriodLocksPage capabilities={session.capabilities} />
        ) : null}
      </main>
    </div>
  );
}

function SessionStatusPanel({ title, message, isError = false }: { title: string; message: string; isError?: boolean }) {
  return (
    <section className="panel">
      <div className="panel-header">
        <h2>{title}</h2>
      </div>
      <div className={isError ? "notice error" : "workspace-placeholder"}>{message}</div>
    </section>
  );
}
