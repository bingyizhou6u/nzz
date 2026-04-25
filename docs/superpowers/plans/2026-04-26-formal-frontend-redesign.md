# Formal Frontend Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the current MVP-style frontend into a formal internal financial operations workspace while preserving the existing React, Worker API, D1 schema, permissions, and accounting logic.

**Architecture:** Keep the existing single React app and API boundaries. Add a formal app shell, shared UI primitives, a workspace page, and staged page-level refactors so each phase is deployable. Page refactors should improve task flow and information hierarchy first; they must not change posting, FIFO, report, loan, petty cash, or permission semantics.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, native CSS, Cloudflare Workers, D1.

---

## File Structure

Create or modify these files during the redesign:

- Create `src/app/layout/AppShell.tsx` for sidebar navigation, top status bar, and content shell.
- Create `src/app/layout/PageHeader.tsx` for consistent page titles, descriptions, status, and actions.
- Create `src/app/components/ui.tsx` for small shared UI primitives: `StatusTag`, `AmountCell`, `EmptyState`, `Notice`, `SectionTitle`.
- Create `src/app/pages/WorkspacePage.tsx` for the formal task dashboard.
- Create `src/app/pages/workspace/workspaceModel.ts` for dashboard summaries derived from existing documents, reports, and master data.
- Create `src/app/pages/workspace/workspaceModel.test.ts` for pure dashboard model tests.
- Modify `src/app/session/sessionTypes.ts` to add the `workspace` page key.
- Modify `src/app/session/sessionModel.ts` so authenticated users land on `workspace` when they have any useful capability.
- Modify `src/app/session/sessionModel.test.ts` to cover workspace navigation.
- Modify `src/app/App.tsx` to use `AppShell` and route `workspace`.
- Modify `src/app/styles.css` to replace the MVP shell with formal layout tokens and responsive behavior.
- Modify `src/app/pages/DocumentsPage.tsx` in stages: first layout split, then filters, then detail/entry panels.
- Modify `src/app/pages/ReviewCenterPage.tsx` in stages: queue plus detail, then impact preview hierarchy.
- Modify `src/app/pages/ReportsPage.tsx`, `src/app/pages/reports/reportGroups.tsx`, and `src/app/pages/reports/ReportTable.tsx` for formal report groups and denser tables.
- Modify `src/app/pages/MasterDataPage.tsx` and existing `src/app/pages/master-data/*Tab.tsx` pages for governance layout and identity field presentation.
- Extend page tests where behavior is already covered: `DocumentsPage.test.ts`, `ReviewCenterPage.test.ts`, `PeriodLocksPage.test.ts`, and `masterDataModel.test.ts`.

Do not introduce a large UI component library in this plan. If a chart library is needed later, add it in a separate plan after the report redesign identifies concrete chart requirements.

---

## Task 1: Add Workspace Navigation Model

**Files:**

- Modify: `src/app/session/sessionTypes.ts`
- Modify: `src/app/session/sessionModel.ts`
- Test: `src/app/session/sessionModel.test.ts`

- [ ] **Step 1: Write failing navigation tests**

Add tests showing the new workspace entry appears first for authenticated users with any main capability, and does not appear for loading/error sessions.

```ts
import { describe, expect, it } from "vitest";
import { visibleNavigationItems } from "./sessionModel";
import type { SessionState } from "./sessionTypes";

describe("visibleNavigationItems formal shell", () => {
  it("shows workspace first when the user has at least one app capability", () => {
    const session: SessionState = {
      status: "authenticated",
      person: { id: "person_admin", name: "Admin", alias: null, loginEmail: "admin@example.com", roles: ["admin"] },
      capabilities: ["session.view", "documents.view", "reports.view"]
    };

    expect(visibleNavigationItems(session).map((item) => item.key)).toEqual(["workspace", "documents", "reports"]);
  });

  it("does not show workspace while session is unavailable", () => {
    expect(visibleNavigationItems({ status: "loading" })).toEqual([]);
    expect(visibleNavigationItems({ status: "error", message: "nope" })).toEqual([]);
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npm test -- src/app/session/sessionModel.test.ts
```

Expected: TypeScript or assertion failure because `workspace` is not part of `PageKey` and navigation does not include it.

- [ ] **Step 3: Add `workspace` to page types**

Update `src/app/session/sessionTypes.ts`:

```ts
export type PageKey = "workspace" | "documents" | "review" | "reports" | "master-data" | "period-locks";
```

- [ ] **Step 4: Add workspace navigation item**

Update `src/app/session/sessionModel.ts` so `workspace` is first and is visible when the user has `session.view`:

```ts
const navigationItems: NavigationItem[] = [
  { key: "workspace", label: "工作台", capability: "session.view" },
  { key: "documents", label: "单据中心", capability: "documents.view" },
  { key: "review", label: "审核中心", capability: "documents.approve" },
  { key: "reports", label: "报表中心", capability: "reports.view" },
  { key: "master-data", label: "基础资料", capability: "masterData.view" },
  { key: "period-locks", label: "期间锁账", capability: "periodLocks.view" }
];
```

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- src/app/session/sessionModel.test.ts
```

Expected: all session model tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/app/session/sessionTypes.ts src/app/session/sessionModel.ts src/app/session/sessionModel.test.ts
git commit -m "feat: add workspace navigation entry"
```

---

## Task 2: Create Shared UI Primitives

**Files:**

- Create: `src/app/components/ui.tsx`
- Modify: `src/app/styles.css`
- Test: `src/app/session/sessionModel.test.ts` is not enough; add small render assertions in `src/app/pages/master-data/masterDataModel.test.ts` or create `src/app/components/ui.test.tsx` if preferred.

- [ ] **Step 1: Write failing render tests for UI primitives**

Create `src/app/components/ui.test.tsx`:

```tsx
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { AmountCell, EmptyState, Notice, StatusTag } from "./ui";

let root: Root | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.innerHTML = "";
});

async function render(element: React.ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  root.render(element);
  await Promise.resolve();
  return container;
}

describe("formal ui primitives", () => {
  it("renders status tags with semantic tones", async () => {
    const container = await render(createElement(StatusTag, { tone: "warning", children: "待处理" }));
    expect(container.querySelector(".status-tag.warning")?.textContent).toBe("待处理");
  });

  it("formats amount cells as right-aligned mono text", async () => {
    const container = await render(createElement(AmountCell, { value: "1,200.00", currency: "USDT" }));
    expect(container.querySelector(".amount-cell")?.textContent).toContain("1,200.00");
    expect(container.querySelector(".amount-cell")?.textContent).toContain("USDT");
  });

  it("renders empty and notice states", async () => {
    const container = await render(
      createElement("div", null, createElement(EmptyState, { title: "暂无任务", message: "当前没有待处理事项" }), createElement(Notice, { tone: "error", children: "读取失败" }))
    );
    expect(container.textContent).toContain("暂无任务");
    expect(container.textContent).toContain("读取失败");
  });
});
```

- [ ] **Step 2: Run the tests and verify RED**

Run:

```bash
npm test -- src/app/components/ui.test.tsx
```

Expected: module import failure because `src/app/components/ui.tsx` does not exist.

- [ ] **Step 3: Implement UI primitives**

Create `src/app/components/ui.tsx`:

```tsx
import type { ReactNode } from "react";

export type Tone = "default" | "ok" | "warning" | "danger" | "muted";

export function StatusTag({ tone = "default", children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`status-tag ${tone}`}>{children}</span>;
}

export function AmountCell({ value, currency }: { value: string | number; currency?: string | null }) {
  return (
    <span className="amount-cell">
      <strong>{value}</strong>
      {currency ? <span>{currency}</span> : null}
    </span>
  );
}

export function EmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="empty-state">
      <strong>{title}</strong>
      <span>{message}</span>
    </div>
  );
}

export function Notice({ tone = "default", children }: { tone?: Tone; children: ReactNode }) {
  return <div className={`notice ${tone}`}>{children}</div>;
}

export function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
  );
}
```

- [ ] **Step 4: Add primitive styles**

Append to `src/app/styles.css` after existing tag styles or in the new design-token block:

```css
.status-tag {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  border: 1px solid #d9dde3;
  border-radius: 999px;
  padding: 0 9px;
  color: #344054;
  background: #ffffff;
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.status-tag.ok {
  border-color: #b8dfd1;
  background: #e4f4ef;
  color: #116149;
}

.status-tag.warning {
  border-color: #f6d889;
  background: #fff4d6;
  color: #8a5a00;
}

.status-tag.danger {
  border-color: #f2b8b5;
  background: #fdeceb;
  color: #b42318;
}

.status-tag.muted {
  border-color: #d9dde3;
  background: #eef0f3;
  color: #596272;
}

.amount-cell {
  display: inline-flex;
  justify-content: flex-end;
  gap: 6px;
  width: 100%;
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
  font-size: 13px;
  white-space: nowrap;
}

.amount-cell span {
  color: #667085;
}

.empty-state {
  display: grid;
  gap: 4px;
  padding: 24px;
  color: #667085;
  text-align: center;
}

.empty-state strong {
  color: #17202a;
}

.section-title {
  display: grid;
  gap: 4px;
}

.section-title p {
  color: #667085;
  font-size: 13px;
}
```

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- src/app/components/ui.test.tsx
npx tsc --noEmit
```

Expected: UI tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/app/components/ui.tsx src/app/components/ui.test.tsx src/app/styles.css
git commit -m "feat: add formal ui primitives"
```

---

## Task 3: Build Formal App Shell

**Files:**

- Create: `src/app/layout/AppShell.tsx`
- Create: `src/app/layout/PageHeader.tsx`
- Modify: `src/app/App.tsx`
- Modify: `src/app/styles.css`
- Test: `src/app/App.test.tsx` or extend an existing page smoke test.

- [ ] **Step 1: Write failing shell render test**

Create `src/app/App.test.tsx` with mocked session and API fetches:

```tsx
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

let root: Root | null = null;

afterEach(() => {
  root?.unmount();
  root = null;
  document.body.innerHTML = "";
  vi.unstubAllGlobals();
});

function json(data: unknown) {
  return new Response(JSON.stringify(data), { headers: { "content-type": "application/json" } });
}

describe("formal app shell", () => {
  it("renders sidebar navigation and authenticated top status", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        json({
          data: {
            person: { id: "person_admin", name: "系统管理员", alias: "admin", loginEmail: "admin@example.com", roles: ["admin"] },
            capabilities: ["session.view", "documents.view", "reports.view", "masterData.view", "periodLocks.view"]
          }
        })
      )
    );

    const container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    root.render(createElement(App));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(container.querySelector(".app-sidebar")?.textContent).toContain("工作台");
    expect(container.querySelector(".top-status-bar")?.textContent).toContain("系统管理员");
  });
});
```

- [ ] **Step 2: Run the test and verify RED**

Run:

```bash
npm test -- src/app/App.test.tsx
```

Expected: failure because `.app-sidebar` and `.top-status-bar` do not exist.

- [ ] **Step 3: Create `PageHeader`**

Create `src/app/layout/PageHeader.tsx`:

```tsx
import type { ReactNode } from "react";

export function PageHeader({
  title,
  description,
  status,
  actions
}: {
  title: string;
  description?: string;
  status?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div className="page-heading">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      <div className="page-header-meta">
        {status ? <div className="page-status">{status}</div> : null}
        {actions ? <div className="page-actions">{actions}</div> : null}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create `AppShell`**

Create `src/app/layout/AppShell.tsx`:

```tsx
import type { ReactNode } from "react";
import { roleLabels } from "../session/sessionModel";
import type { NavigationItem, PageKey, SessionState } from "../session/sessionTypes";

export function AppShell({
  session,
  pages,
  activePage,
  onPageChange,
  children
}: {
  session: SessionState;
  pages: NavigationItem[];
  activePage: PageKey | null;
  onPageChange: (page: PageKey) => void;
  children: ReactNode;
}) {
  return (
    <div className="formal-app-shell">
      <aside className="app-sidebar" aria-label="主导航">
        <div className="app-brand">
          <strong>管理会计台账</strong>
          <span>Finance Ops</span>
        </div>
        <nav className="side-nav">
          {pages.map((page) => (
            <button
              key={page.key}
              type="button"
              className={page.key === activePage ? "side-nav-item active" : "side-nav-item"}
              onClick={() => onPageChange(page.key)}
              aria-current={page.key === activePage ? "page" : undefined}
            >
              {page.label}
            </button>
          ))}
        </nav>
      </aside>
      <div className="app-main-column">
        <header className="top-status-bar">
          {session.status === "authenticated" ? (
            <>
              <div className="top-period">当前期间：未锁定视图</div>
              <div className="top-identity">
                <strong>{session.person.alias ? `${session.person.name} / ${session.person.alias}` : session.person.name}</strong>
                <span>{session.person.loginEmail}</span>
                <span>{session.person.roles.map((role) => roleLabels[role]).join("、")}</span>
              </div>
            </>
          ) : (
            <div className="top-period">{session.status === "loading" ? "正在确认登录身份" : "身份不可用"}</div>
          )}
        </header>
        <main className="app-content">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Update `App.tsx` to use shell**

Replace the top-level `<div className="app-shell">` structure with:

```tsx
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
```

Add imports:

```ts
import { AppShell } from "./layout/AppShell";
import { WorkspacePage } from "./pages/WorkspacePage";
```

- [ ] **Step 6: Add shell styles**

Add styles to `src/app/styles.css` and keep existing page styles working:

```css
.formal-app-shell {
  display: grid;
  grid-template-columns: 224px minmax(0, 1fr);
  min-height: 100vh;
  background: #f4f6f8;
  color: #17202a;
}

.app-sidebar {
  display: flex;
  flex-direction: column;
  gap: 18px;
  min-width: 0;
  border-right: 1px solid #d9dde3;
  background: #10201f;
  padding: 18px 14px;
  color: #ffffff;
}

.app-brand {
  display: grid;
  gap: 4px;
  padding: 4px 6px 14px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.14);
}

.app-brand strong {
  font-size: 15px;
}

.app-brand span {
  color: #b9c5c2;
  font-size: 12px;
}

.side-nav {
  display: grid;
  gap: 6px;
}

.side-nav-item {
  justify-content: flex-start;
  width: 100%;
  border-color: transparent;
  background: transparent;
  color: #d9e4e1;
  text-align: left;
}

.side-nav-item:hover:not(:disabled),
.side-nav-item.active {
  background: #1f5e5a;
  color: #ffffff;
}

.app-main-column {
  display: grid;
  grid-template-rows: 56px minmax(0, 1fr);
  min-width: 0;
}

.top-status-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid #d9dde3;
  background: #ffffff;
  padding: 0 24px;
}

.top-period,
.top-identity {
  color: #667085;
  font-size: 13px;
}

.top-identity {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
  min-width: 0;
}

.top-identity strong {
  color: #17202a;
}

.app-content {
  min-width: 0;
  padding: 20px 24px 32px;
}

.page-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;
}

.page-heading {
  display: grid;
  gap: 4px;
}

.page-heading h1 {
  font-size: 22px;
}

.page-heading p {
  color: #667085;
  font-size: 13px;
}

.page-header-meta,
.page-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 10px;
}

@media (max-width: 780px) {
  .formal-app-shell {
    grid-template-columns: 1fr;
  }

  .app-sidebar {
    position: sticky;
    top: 0;
    z-index: 10;
    border-right: 0;
    padding: 12px;
  }

  .side-nav {
    display: flex;
    overflow-x: auto;
  }

  .side-nav-item {
    width: auto;
  }

  .app-main-column {
    grid-template-rows: auto minmax(0, 1fr);
  }

  .top-status-bar,
  .page-header {
    align-items: flex-start;
    flex-direction: column;
  }

  .app-content {
    padding: 16px;
  }
}
```

- [ ] **Step 7: Verify shell behavior**

Run:

```bash
npm test -- src/app/App.test.tsx src/app/session/sessionModel.test.ts
npx tsc --noEmit
```

Expected: tests pass and TypeScript exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/app/App.tsx src/app/App.test.tsx src/app/layout/AppShell.tsx src/app/layout/PageHeader.tsx src/app/styles.css
git commit -m "feat: add formal app shell"
```

---

## Task 4: Add Workspace Page

**Files:**

- Create: `src/app/pages/WorkspacePage.tsx`
- Create: `src/app/pages/workspace/workspaceModel.ts`
- Create: `src/app/pages/workspace/workspaceModel.test.ts`
- Modify: `src/app/App.tsx`
- Modify: `src/app/styles.css`

- [ ] **Step 1: Write failing workspace model tests**

Create `src/app/pages/workspace/workspaceModel.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { buildWorkspaceTasks, summarizeDocumentCounts } from "./workspaceModel";

describe("workspace model", () => {
  const documents = [
    { id: "doc_1", document_no: "D-001", document_type: "project_income", business_date: "2026-04-24", status: "draft", summary: "收入草稿" },
    { id: "doc_2", document_no: "D-002", document_type: "exchange", business_date: "2026-04-24", status: "pending", summary: "换汇待审" },
    { id: "doc_3", document_no: "D-003", document_type: "loan_out", business_date: "2026-04-23", status: "rejected", summary: "借款退回" }
  ];

  it("summarizes document counts by workflow status", () => {
    expect(summarizeDocumentCounts(documents)).toEqual({ draft: 1, pending: 1, rejected: 1, approved: 0 });
  });

  it("builds actionable workspace tasks", () => {
    expect(buildWorkspaceTasks(documents).map((task) => task.label)).toEqual(["收入草稿", "换汇待审", "借款退回"]);
  });
});
```

- [ ] **Step 2: Run model tests and verify RED**

Run:

```bash
npm test -- src/app/pages/workspace/workspaceModel.test.ts
```

Expected: module import failure because `workspaceModel.ts` does not exist.

- [ ] **Step 3: Implement workspace model**

Create `src/app/pages/workspace/workspaceModel.ts`:

```ts
export interface WorkspaceDocument {
  id: string;
  document_no: string;
  document_type: string;
  business_date: string;
  status: string;
  summary: string;
}

export interface WorkspaceTask {
  id: string;
  label: string;
  meta: string;
  status: string;
}

export function summarizeDocumentCounts(documents: WorkspaceDocument[]) {
  return documents.reduce(
    (summary, document) => {
      if (document.status === "draft") summary.draft += 1;
      if (document.status === "pending") summary.pending += 1;
      if (document.status === "rejected") summary.rejected += 1;
      if (document.status === "approved") summary.approved += 1;
      return summary;
    },
    { draft: 0, pending: 0, rejected: 0, approved: 0 }
  );
}

export function buildWorkspaceTasks(documents: WorkspaceDocument[]): WorkspaceTask[] {
  return documents
    .filter((document) => ["draft", "pending", "rejected"].includes(document.status))
    .slice(0, 8)
    .map((document) => ({
      id: document.id,
      label: document.summary || document.document_no,
      meta: `${document.document_no} / ${document.business_date}`,
      status: document.status
    }));
}
```

- [ ] **Step 4: Create `WorkspacePage`**

Create `src/app/pages/WorkspacePage.tsx`:

```tsx
import { useEffect, useMemo, useState } from "react";
import { getJson, type ApiEnvelope } from "../api";
import { EmptyState, StatusTag } from "../components/ui";
import { PageHeader } from "../layout/PageHeader";
import type { PageKey, SessionState } from "../session/sessionTypes";
import { buildWorkspaceTasks, summarizeDocumentCounts, type WorkspaceDocument } from "./workspace/workspaceModel";

const statusLabels: Record<string, string> = {
  draft: "草稿",
  pending: "待审核",
  rejected: "已退回",
  approved: "已审核"
};

export function WorkspacePage({
  session,
  onNavigate
}: {
  session: Extract<SessionState, { status: "authenticated" }>;
  onNavigate: (page: PageKey) => void;
}) {
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const counts = useMemo(() => summarizeDocumentCounts(documents), [documents]);
  const tasks = useMemo(() => buildWorkspaceTasks(documents), [documents]);

  useEffect(() => {
    let isCurrent = true;

    async function load() {
      setIsLoading(true);
      setError(null);
      try {
        const response = await getJson<ApiEnvelope<WorkspaceDocument[]>>("/api/documents");
        if (isCurrent) setDocuments(response.data);
      } catch (loadError) {
        if (isCurrent) setError(loadError instanceof Error ? loadError.message : "读取工作台失败");
      } finally {
        if (isCurrent) setIsLoading(false);
      }
    }

    void load();

    return () => {
      isCurrent = false;
    };
  }, []);

  return (
    <div className="page-stack">
      <PageHeader
        title="工作台"
        description={`你好，${session.person.alias || session.person.name}。这里汇总当前单据任务和经营入口。`}
        status={isLoading ? "读取中" : error ? "读取失败" : "已更新"}
      />
      {error ? <div className="notice error">{error}</div> : null}
      <section className="workspace-grid">
        <div className="workspace-card">
          <h2>待处理</h2>
          {tasks.length === 0 ? (
            <EmptyState title="暂无待处理单据" message="草稿、待审核和退回单据会出现在这里。" />
          ) : (
            <div className="task-list">
              {tasks.map((task) => (
                <button key={task.id} type="button" className="task-row" onClick={() => onNavigate(task.status === "pending" ? "review" : "documents")}>
                  <span>{task.label}</span>
                  <small>{task.meta}</small>
                  <StatusTag tone={task.status === "pending" ? "warning" : task.status === "rejected" ? "danger" : "muted"}>
                    {statusLabels[task.status] ?? task.status}
                  </StatusTag>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="workspace-card">
          <h2>单据快照</h2>
          <div className="metric-grid">
            <Metric label="草稿" value={counts.draft} />
            <Metric label="待审核" value={counts.pending} />
            <Metric label="已退回" value={counts.rejected} />
            <Metric label="已审核" value={counts.approved} />
          </div>
        </div>
        <div className="workspace-card">
          <h2>快捷入口</h2>
          <div className="quick-actions">
            <button type="button" onClick={() => onNavigate("documents")}>新增或查看单据</button>
            <button type="button" className="secondary-button" onClick={() => onNavigate("review")}>进入审核中心</button>
            <button type="button" className="secondary-button" onClick={() => onNavigate("reports")}>查看报表</button>
          </div>
        </div>
      </section>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric-tile">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
```

- [ ] **Step 5: Add workspace styles**

Append:

```css
.workspace-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(260px, 0.8fr);
  gap: 16px;
}

.workspace-card {
  display: grid;
  gap: 14px;
  min-width: 0;
  border: 1px solid #d9dde3;
  border-radius: 8px;
  background: #ffffff;
  padding: 16px;
}

.workspace-card:nth-child(3) {
  grid-column: 1 / -1;
}

.task-list,
.quick-actions {
  display: grid;
  gap: 8px;
}

.task-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 4px 10px;
  min-height: 56px;
  border-color: #d9dde3;
  background: #ffffff;
  color: #17202a;
  text-align: left;
}

.task-row small {
  color: #667085;
}

.task-row .status-tag {
  grid-row: 1 / span 2;
  grid-column: 2;
  align-self: center;
}

.metric-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.metric-tile {
  display: grid;
  gap: 6px;
  border: 1px solid #eaecf0;
  border-radius: 8px;
  padding: 12px;
}

.metric-tile span {
  color: #667085;
  font-size: 12px;
}

.metric-tile strong {
  font-size: 24px;
}

@media (max-width: 980px) {
  .workspace-grid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 6: Verify**

Run:

```bash
npm test -- src/app/pages/workspace/workspaceModel.test.ts src/app/App.test.tsx
npx tsc --noEmit
```

Expected: tests pass and TypeScript exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/app/pages/WorkspacePage.tsx src/app/pages/workspace/workspaceModel.ts src/app/pages/workspace/workspaceModel.test.ts src/app/App.tsx src/app/styles.css
git commit -m "feat: add formal workspace page"
```

---

## Task 5: Apply Formal Page Headers to Existing Pages

**Files:**

- Modify: `src/app/pages/DocumentsPage.tsx`
- Modify: `src/app/pages/ReviewCenterPage.tsx`
- Modify: `src/app/pages/ReportsPage.tsx`
- Modify: `src/app/pages/MasterDataPage.tsx`
- Modify: `src/app/pages/PeriodLocksPage.tsx`
- Test: existing page smoke tests.

- [ ] **Step 1: Write page header assertions**

Extend existing tests with assertions such as:

```ts
expect(container.querySelector(".page-header")?.textContent).toContain("单据中心");
expect(container.querySelector(".page-header")?.textContent).toContain("审核中心");
expect(container.querySelector(".page-header")?.textContent).toContain("报表中心");
```

Use the test file that already renders the page:

- `src/app/pages/DocumentsPage.test.ts`
- `src/app/pages/ReviewCenterPage.test.ts`
- `src/app/pages/PeriodLocksPage.test.ts`
- `src/app/pages/master-data/masterDataModel.test.ts` for master-data module smoke checks if no dedicated page test exists.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- src/app/pages/DocumentsPage.test.ts src/app/pages/ReviewCenterPage.test.ts src/app/pages/PeriodLocksPage.test.ts src/app/pages/master-data/masterDataModel.test.ts
```

Expected: failures for missing `.page-header` in pages that still use panel headers only.

- [ ] **Step 3: Replace top panel headers with `PageHeader`**

For each page, import:

```ts
import { PageHeader } from "../layout/PageHeader";
```

For `DocumentsPage`, render:

```tsx
<PageHeader
  title="单据中心"
  description="创建、提交、查看和跟踪业务单据。"
  status={isLoading ? "读取中" : loadError ? "读取失败" : `${documents.length} 张单据` }
/>
```

For `ReviewCenterPage`, render:

```tsx
<PageHeader
  title="审核中心"
  description="处理待审核单据，查看过账影响后再确认。"
  status={isLoading ? "读取中" : error ? "读取失败" : `${documents.length} 张待处理` }
/>
```

For `ReportsPage`, render:

```tsx
<PageHeader title="报表中心" description="按资金、项目、费用、备用金、借款和异常口径查看管理报表。" />
```

For `MasterDataPage`, render:

```tsx
<PageHeader
  title="基础资料治理"
  description="维护人员、项目、商户、账户、币种和管理科目。"
  status={isLoading ? "读取中" : error ? "读取失败" : "已读取"}
  actions={<button type="button" className="secondary-button" onClick={refreshMasterData} disabled={isLoading}>重新读取</button>}
/>
```

For `PeriodLocksPage`, render:

```tsx
<PageHeader title="期间锁账" description="锁定已完成期间，防止历史期间继续产生过账变化。" />
```

- [ ] **Step 4: Keep existing forms and tables intact**

Do not rewrite page internals in this task. Keep the existing `panel`, forms, and tables below each `PageHeader`.

- [ ] **Step 5: Verify GREEN**

Run:

```bash
npm test -- src/app/pages/DocumentsPage.test.ts src/app/pages/ReviewCenterPage.test.ts src/app/pages/PeriodLocksPage.test.ts src/app/pages/master-data/masterDataModel.test.ts
npx tsc --noEmit
```

Expected: tests pass and TypeScript exits 0.

- [ ] **Step 6: Commit**

```bash
git add src/app/pages/DocumentsPage.tsx src/app/pages/ReviewCenterPage.tsx src/app/pages/ReportsPage.tsx src/app/pages/MasterDataPage.tsx src/app/pages/PeriodLocksPage.tsx src/app/pages/*.test.ts src/app/pages/master-data/masterDataModel.test.ts
git commit -m "feat: standardize formal page headers"
```

---

## Task 6: Redesign Documents Page Layout

**Files:**

- Modify: `src/app/pages/DocumentsPage.tsx`
- Modify: `src/app/pages/documents/documentEntryModel.ts`
- Modify: `src/app/styles.css`
- Test: `src/app/pages/DocumentsPage.test.ts`, `src/app/pages/documents/documentEntryModel.test.ts`

- [ ] **Step 1: Write layout behavior tests**

Add tests to `DocumentsPage.test.ts`:

```ts
expect(container.querySelector(".documents-workspace")?.textContent).toContain("单据列表");
expect(container.querySelector(".document-entry-panel")?.textContent).toContain("新增单据");
expect(container.querySelector(".document-list-panel")?.textContent).toContain("状态");
```

Add a model test for status filtering if no helper exists:

```ts
expect(filterDocumentsByStatus([{ status: "draft" }, { status: "approved" }], "draft")).toHaveLength(1);
expect(filterDocumentsByStatus([{ status: "draft" }], "all")).toHaveLength(1);
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- src/app/pages/DocumentsPage.test.ts src/app/pages/documents/documentEntryModel.test.ts
```

Expected: missing classes and missing `filterDocumentsByStatus` failure.

- [ ] **Step 3: Add filter helper**

In `documentEntryModel.ts`:

```ts
export function filterDocumentsByStatus<T extends { status: string }>(documents: T[], status: string) {
  if (status === "all") return documents;
  return documents.filter((document) => document.status === status);
}
```

- [ ] **Step 4: Introduce split layout state**

In `DocumentsPage.tsx`, add:

```ts
const [statusFilter, setStatusFilter] = useState("all");
const visibleDocuments = useMemo(() => filterDocumentsByStatus(documents, statusFilter), [documents, statusFilter]);
```

Import `filterDocumentsByStatus`.

- [ ] **Step 5: Wrap list and entry in formal layout**

Render structure:

```tsx
<div className="documents-workspace">
  <section className="panel document-list-panel">
    <div className="panel-header">
      <h2>单据列表</h2>
      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="状态">
        <option value="all">全部状态</option>
        <option value="draft">草稿</option>
        <option value="pending">待审核</option>
        <option value="approved">已审核</option>
        <option value="rejected">已退回</option>
      </select>
    </div>
    {/* existing document table uses visibleDocuments */}
  </section>
  {canCreate ? (
    <section className="panel document-entry-panel">
      <div className="panel-header">
        <h2>新增单据</h2>
      </div>
      {/* existing document form */}
    </section>
  ) : null}
</div>
```

Do not remove existing validation or submit behavior.

- [ ] **Step 6: Add layout styles**

```css
.documents-workspace {
  display: grid;
  grid-template-columns: minmax(420px, 0.95fr) minmax(520px, 1.05fr);
  gap: 16px;
  align-items: start;
}

.document-list-panel,
.document-entry-panel {
  min-width: 0;
}

.document-entry-panel .form-grid {
  padding: 16px;
}

@media (max-width: 1120px) {
  .documents-workspace {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 7: Verify**

Run:

```bash
npm test -- src/app/pages/DocumentsPage.test.ts src/app/pages/documents/documentEntryModel.test.ts
npx tsc --noEmit
```

Expected: tests pass and TypeScript exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/app/pages/DocumentsPage.tsx src/app/pages/DocumentsPage.test.ts src/app/pages/documents/documentEntryModel.ts src/app/pages/documents/documentEntryModel.test.ts src/app/styles.css
git commit -m "feat: redesign documents workspace layout"
```

---

## Task 7: Redesign Review Center Layout

**Files:**

- Modify: `src/app/pages/ReviewCenterPage.tsx`
- Modify: `src/app/pages/review/reviewModel.ts`
- Modify: `src/app/pages/review/reviewModel.test.ts`
- Modify: `src/app/styles.css`
- Test: `src/app/pages/ReviewCenterPage.test.ts`

- [ ] **Step 1: Write failing queue/detail tests**

Add to `ReviewCenterPage.test.ts`:

```ts
expect(container.querySelector(".review-workspace")?.textContent).toContain("审核队列");
expect(container.querySelector(".review-detail-panel")?.textContent).toContain("影响预览");
```

Add to `reviewModel.test.ts`:

```ts
expect(reviewRiskTone({ submitted_at: "2026-04-20T00:00:00.000Z" }, new Date("2026-04-25T00:00:00.000Z"))).toBe("warning");
expect(reviewRiskTone({ submitted_at: null }, new Date("2026-04-25T00:00:00.000Z"))).toBe("muted");
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- src/app/pages/ReviewCenterPage.test.ts src/app/pages/review/reviewModel.test.ts
```

Expected: failures for missing layout classes and `reviewRiskTone`.

- [ ] **Step 3: Add review risk helper**

In `reviewModel.ts`:

```ts
export function reviewRiskTone(input: { submitted_at: string | null | undefined }, now = new Date()) {
  if (!input.submitted_at) return "muted" as const;
  const submitted = new Date(input.submitted_at).getTime();
  if (!Number.isFinite(submitted)) return "muted" as const;
  const days = (now.getTime() - submitted) / (24 * 60 * 60 * 1000);
  return days >= 3 ? ("warning" as const) : ("ok" as const);
}
```

- [ ] **Step 4: Wrap review UI as queue plus detail**

In `ReviewCenterPage.tsx`, preserve existing fetch, preview, approve, and reject logic. Change layout to:

```tsx
<div className="review-workspace">
  <section className="panel review-queue-panel">
    <div className="panel-header">
      <h2>审核队列</h2>
    </div>
    {/* existing pending list */}
  </section>
  <section className="panel review-detail-panel">
    <div className="panel-header">
      <h2>影响预览</h2>
    </div>
    {/* existing selected document detail and preview groups */}
  </section>
</div>
```

- [ ] **Step 5: Add review styles**

```css
.review-workspace {
  display: grid;
  grid-template-columns: minmax(360px, 0.8fr) minmax(560px, 1.2fr);
  gap: 16px;
  align-items: start;
}

.review-queue-panel,
.review-detail-panel {
  min-width: 0;
}

.review-detail-panel {
  position: sticky;
  top: 76px;
}

@media (max-width: 1120px) {
  .review-workspace {
    grid-template-columns: 1fr;
  }

  .review-detail-panel {
    position: static;
  }
}
```

- [ ] **Step 6: Verify**

Run:

```bash
npm test -- src/app/pages/ReviewCenterPage.test.ts src/app/pages/review/reviewModel.test.ts
npx tsc --noEmit
```

Expected: tests pass and TypeScript exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/app/pages/ReviewCenterPage.tsx src/app/pages/ReviewCenterPage.test.ts src/app/pages/review/reviewModel.ts src/app/pages/review/reviewModel.test.ts src/app/styles.css
git commit -m "feat: redesign review center workspace"
```

---

## Task 8: Formalize Report Center Groups and Tables

**Files:**

- Modify: `src/app/pages/ReportsPage.tsx`
- Modify: `src/app/pages/reports/reportGroups.tsx`
- Modify: `src/app/pages/reports/ReportTable.tsx`
- Modify: `src/app/pages/reports/reportFilters.ts`
- Test: `src/app/pages/reports/reportFilters.test.ts`

- [ ] **Step 1: Write failing report grouping tests**

Extend `reportFilters.test.ts` or create a new pure model test for group metadata:

```ts
import { reportGroupLabels } from "./reportGroups";

expect(reportGroupLabels).toEqual(["资金", "项目经营", "费用", "备用金", "借款", "异常"]);
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- src/app/pages/reports/reportFilters.test.ts
```

Expected: import or assertion failure because `reportGroupLabels` is not exported.

- [ ] **Step 3: Export formal report group labels**

In `reportGroups.tsx`:

```ts
export const reportGroupLabels = ["资金", "项目经营", "费用", "备用金", "借款", "异常"] as const;
```

- [ ] **Step 4: Reorder rendered report groups**

Ensure the page renders report groups in this order:

```tsx
<FundingReports reports={reports} emptyLabel={emptyLabel} />
<ProjectReports reports={reports} emptyLabel={emptyLabel} />
<ExpenseReports reports={reports} emptyLabel={emptyLabel} />
<PettyCashReports reports={reports} emptyLabel={emptyLabel} />
<LoanReports reports={reports} emptyLabel={emptyLabel} />
<ExceptionReports reports={reports} emptyLabel={emptyLabel} />
```

If current components are named differently, rename exports in the same task and update imports in `ReportsPage.tsx`.

- [ ] **Step 5: Improve table shell without changing columns**

In `ReportTable.tsx`, keep the `columns` API and wrap title plus row count:

```tsx
<div className="report-table-header">
  <h2>{title}</h2>
  <span>{rows.length} 行</span>
</div>
```

- [ ] **Step 6: Add report styles**

```css
.report-table-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 16px;
  border-bottom: 1px solid #eaecf0;
}

.report-table-header span {
  color: #667085;
  font-size: 12px;
}

.report-panel table {
  font-size: 13px;
}

.report-panel .number-cell {
  font-family: "SFMono-Regular", Consolas, "Liberation Mono", monospace;
}
```

- [ ] **Step 7: Verify**

Run:

```bash
npm test -- src/app/pages/reports/reportFilters.test.ts
npx tsc --noEmit
```

Expected: tests pass and TypeScript exits 0.

- [ ] **Step 8: Commit**

```bash
git add src/app/pages/ReportsPage.tsx src/app/pages/reports/reportGroups.tsx src/app/pages/reports/ReportTable.tsx src/app/pages/reports/reportFilters.test.ts src/app/styles.css
git commit -m "feat: formalize report center groups"
```

---

## Task 9: Redesign Master Data Governance Layout

**Files:**

- Modify: `src/app/pages/MasterDataPage.tsx`
- Modify: `src/app/pages/master-data/PeopleTab.tsx`
- Modify: `src/app/pages/master-data/MasterDataOverview.tsx`
- Modify: `src/app/styles.css`
- Test: `src/app/pages/master-data/masterDataModel.test.ts`

- [ ] **Step 1: Write failing governance layout tests**

Add render assertions to the existing master-data render tests:

```ts
expect(container.querySelector(".master-data-governance-layout")?.textContent).toContain("人员");
expect(container.querySelector(".master-data-side-nav")?.textContent).toContain("管理科目");
expect(container.querySelector(".person-identity-section")?.textContent).toContain("登录身份");
```

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
npm test -- src/app/pages/master-data/masterDataModel.test.ts
```

Expected: failures for missing layout and identity section classes.

- [ ] **Step 3: Change master data page layout**

In `MasterDataPage.tsx`, wrap tabs and active content:

```tsx
<section className="panel master-data-governance-layout">
  <div className="master-data-side-nav" role="tablist" aria-label="基础资料分类">
    {tabs.map((tab) => (
      <button
        key={tab.key}
        type="button"
        className={activeTab === tab.key ? "side-nav-lite active" : "side-nav-lite"}
        onClick={() => setActiveTab(tab.key)}
        aria-selected={activeTab === tab.key}
        role="tab"
      >
        {tab.label}
      </button>
    ))}
  </div>
  <div className="master-data-detail-region">{/* active tab content */}</div>
</section>
```

- [ ] **Step 4: Add person identity visual section**

In `PeopleTab.tsx`, group login email, status, and roles:

```tsx
<fieldset className="person-identity-section wide-field">
  <legend>登录身份</legend>
  <label>
    登录邮箱
    <input value={form.loginEmail} onChange={(event) => setForm((current) => ({ ...current, loginEmail: event.target.value }))} disabled={!canManagePeopleRoles} />
  </label>
  <label>
    状态
    <select value={form.isEnabled ? "enabled" : "disabled"} onChange={(event) => setForm((current) => ({ ...current, isEnabled: event.target.value === "enabled" }))} disabled={!canManagePeopleRoles}>
      <option value="enabled">启用</option>
      <option value="disabled">停用</option>
    </select>
  </label>
  {/* existing role checkboxes remain here */}
</fieldset>
```

Keep business name and alias fields outside the identity section.

- [ ] **Step 5: Add governance layout styles**

```css
.master-data-governance-layout {
  display: grid;
  grid-template-columns: 180px minmax(0, 1fr);
}

.master-data-side-nav {
  display: grid;
  align-content: start;
  gap: 6px;
  border-right: 1px solid #eaecf0;
  padding: 12px;
}

.side-nav-lite {
  justify-content: flex-start;
  border-color: transparent;
  background: transparent;
  color: #344054;
}

.side-nav-lite.active {
  background: #e4f4ef;
  color: #116149;
}

.master-data-detail-region {
  min-width: 0;
}

.person-identity-section {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 12px;
  border: 1px solid #d9dde3;
  border-radius: 8px;
  padding: 12px;
}

.person-identity-section legend {
  padding: 0 6px;
  color: #475467;
  font-size: 12px;
  font-weight: 700;
}

@media (max-width: 900px) {
  .master-data-governance-layout {
    grid-template-columns: 1fr;
  }

  .master-data-side-nav {
    display: flex;
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid #eaecf0;
  }
}
```

- [ ] **Step 6: Verify**

Run:

```bash
npm test -- src/app/pages/master-data/masterDataModel.test.ts
npx tsc --noEmit
```

Expected: tests pass and TypeScript exits 0.

- [ ] **Step 7: Commit**

```bash
git add src/app/pages/MasterDataPage.tsx src/app/pages/master-data/PeopleTab.tsx src/app/pages/master-data/MasterDataOverview.tsx src/app/pages/master-data/masterDataModel.test.ts src/app/styles.css
git commit -m "feat: redesign master data governance layout"
```

---

## Task 10: Responsive and Browser Verification Pass

**Files:**

- Modify: `src/app/styles.css`
- Modify page files only if browser verification finds layout breakage.
- Test: full app verification.

- [ ] **Step 1: Run full automated verification**

Run:

```bash
npm test
npx tsc --noEmit
npm run build
```

Expected:

- Vitest reports all test files passing.
- TypeScript exits 0.
- Vite build exits 0.

- [ ] **Step 2: Start local Worker**

Run:

```bash
npm run cf:dev
```

Expected: Wrangler starts a local Worker URL, usually `http://localhost:8787`.

- [ ] **Step 3: Verify desktop layout in browser**

Use the in-app browser or Playwright to open:

```text
http://localhost:8787
```

Check at desktop width:

- Sidebar is visible and does not overlap content.
- Top status bar shows the logged-in identity or a clear auth message.
- Workspace cards align without text overlap.
- Documents page list and entry panel are both usable.
- Review page queue and detail panel are readable.
- Reports tables scroll horizontally when needed.
- Master data side navigation and detail region fit.

- [ ] **Step 4: Verify mobile/narrow layout**

Use a narrow viewport around 390px width. Check:

- Navigation becomes horizontally scrollable or stacked without losing module labels.
- Page headers wrap without overlapping actions.
- Forms are single-column.
- Tables keep horizontal scroll.
- Buttons keep readable labels and do not overflow their containers.

- [ ] **Step 5: Fix concrete layout failures**

For each browser issue, make the smallest CSS or markup adjustment. Examples:

```css
.page-actions {
  flex-wrap: wrap;
}

.table-wrap {
  max-width: 100%;
  overflow-x: auto;
}

button {
  max-width: 100%;
}
```

- [ ] **Step 6: Re-run final verification**

Run:

```bash
npm test
npx tsc --noEmit
npm run build
git status --short
```

Expected:

- Tests pass.
- TypeScript exits 0.
- Build exits 0.
- Only intended files are modified.

- [ ] **Step 7: Commit**

```bash
git add src/app src/app/styles.css
git commit -m "fix: polish formal frontend responsiveness"
```

---

## Self-Review Notes

- Spec coverage: Tasks 1 through 4 cover information architecture, app shell, shared UI, and workspace. Tasks 5 through 9 cover page-level redesigns for documents, review, reports, master data, and period-lock page headers. Task 10 covers responsive and browser verification.
- Scope control: the plan does not alter accounting, FIFO, loan, petty cash, report calculations, Cloudflare Access, D1 schema, or API semantics.
- Type consistency: new `workspace` page key is introduced before `AppShell` and `WorkspacePage` use it. Shared UI primitives are introduced before pages depend on them.
- Execution mode: use Subagent-Driven when implementing because tasks are naturally separable and reviewable.

