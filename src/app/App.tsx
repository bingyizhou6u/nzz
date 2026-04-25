import { useEffect, useMemo, useState } from "react";
import { AppShell } from "./layout/AppShell";
import { DocumentsPage } from "./pages/DocumentsPage";
import { MasterDataPage } from "./pages/MasterDataPage";
import { PeriodLocksPage } from "./pages/PeriodLocksPage";
import { ReportsPage } from "./pages/ReportsPage";
import { ReviewCenterPage } from "./pages/ReviewCenterPage";
import { WorkspacePage } from "./pages/WorkspacePage";
import { getSession } from "./session/sessionApi";
import { visibleNavigationItems } from "./session/sessionModel";
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
    <AppShell session={session} pages={pages} activePage={activePageKey} onPageChange={setActivePage}>
      {session.status === "loading" ? <SessionStatusPanel title="读取会话" message="正在加载当前登录身份..." /> : null}
      {session.status === "error" ? <SessionStatusPanel title="无法进入系统" message={session.message} isError /> : null}
      {session.status === "authenticated" && pages.length === 0 ? (
        <SessionStatusPanel title="暂无可访问功能" message="当前账号没有可用功能，请联系管理员调整权限。" />
      ) : null}
      {session.status === "authenticated" && activePageKey === "workspace" ? (
        <WorkspacePage session={session} onNavigate={setActivePage} />
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
    </AppShell>
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
