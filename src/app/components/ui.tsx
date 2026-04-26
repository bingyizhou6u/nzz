import type { HTMLAttributes, ReactNode } from "react";

export type Tone = "default" | "ok" | "warning" | "danger" | "muted";

export function classNames(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

type StatusTagProps = HTMLAttributes<HTMLSpanElement> & {
  tone?: Tone;
  children: ReactNode;
};

export function StatusTag({ tone = "default", className, children, ...props }: StatusTagProps) {
  return (
    <span {...props} className={classNames("status-tag", tone, className)}>
      {children}
    </span>
  );
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
  const noticeClassName = classNames("notice", tone, className);

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
