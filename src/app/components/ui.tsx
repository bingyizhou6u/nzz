import type { HTMLAttributes, ReactNode } from "react";

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

type NoticeProps = HTMLAttributes<HTMLDivElement> & {
  tone?: Tone;
  children: ReactNode;
};

export function Notice({
  tone = "default",
  className,
  children,
  role,
  "aria-live": ariaLive,
  ...props
}: NoticeProps) {
  const isDanger = tone === "danger";
  const noticeRole = role ?? (isDanger ? "alert" : "status");
  const noticeAriaLive = ariaLive ?? (isDanger ? "assertive" : "polite");
  const noticeClassName = ["notice", tone, className].filter(Boolean).join(" ");

  return (
    <div {...props} className={noticeClassName} role={noticeRole} aria-live={noticeAriaLive}>
      {children}
    </div>
  );
}

export function SectionTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="section-title">
      <h2>{title}</h2>
      {description ? <p>{description}</p> : null}
    </div>
  );
}
