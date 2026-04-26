import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  status?: ReactNode;
  actions?: ReactNode;
}

export function PageHeader({ title, description, status, actions }: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header-copy">
        <h1>{title}</h1>
        {description ? <p>{description}</p> : null}
      </div>
      {status || actions ? (
        <div className="page-header-meta" aria-label="页面状态和操作">
          {status ? <div className="page-header-status">{status}</div> : null}
          {actions ? <div className="page-header-actions">{actions}</div> : null}
        </div>
      ) : null}
    </header>
  );
}
