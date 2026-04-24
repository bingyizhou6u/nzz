import { useState } from "react";
import { DocumentsPage } from "./pages/DocumentsPage";
import { MasterDataPage } from "./pages/MasterDataPage";
import { ReportsPage } from "./pages/ReportsPage";

type PageKey = "master-data" | "documents" | "reports";

const pages: Array<{ key: PageKey; label: string }> = [
  { key: "master-data", label: "基础资料" },
  { key: "documents", label: "业务单据" },
  { key: "reports", label: "报表中心" }
];

export function App() {
  const [activePage, setActivePage] = useState<PageKey>("master-data");

  return (
    <div className="app-shell">
      <header className="app-header">
        <div>
          <h1>内部管理会计台账</h1>
          <p>正式系统 Beta</p>
        </div>
        <nav className="tabs" aria-label="主导航">
          {pages.map((page) => (
            <button
              key={page.key}
              type="button"
              className={page.key === activePage ? "tab active" : "tab"}
              onClick={() => setActivePage(page.key)}
              aria-current={page.key === activePage ? "page" : undefined}
            >
              {page.label}
            </button>
          ))}
        </nav>
      </header>

      <main>
        {activePage === "master-data" ? <MasterDataPage /> : null}
        {activePage === "documents" ? <DocumentsPage /> : null}
        {activePage === "reports" ? <ReportsPage /> : null}
      </main>
    </div>
  );
}
