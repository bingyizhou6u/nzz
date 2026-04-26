import { useState, type HTMLAttributes, type ReactNode } from "react";
import { EmptyState, classNames } from "./ui";

export type PageActionBarProps = HTMLAttributes<HTMLDivElement> & {
  primary?: ReactNode;
  secondary?: ReactNode;
  children?: ReactNode;
};

export function PageActionBar({ primary, secondary, children, className, ...props }: PageActionBarProps) {
  return (
    <div {...props} className={classNames("page-action-bar", className)}>
      <div className="page-action-bar-primary">{primary ?? children}</div>
      {secondary ? <div className="page-action-bar-secondary">{secondary}</div> : null}
    </div>
  );
}

export type FilterStripProps = HTMLAttributes<HTMLDivElement> & {
  actions?: ReactNode;
  children: ReactNode;
};

export function FilterStrip({ actions, children, className, ...props }: FilterStripProps) {
  return (
    <div {...props} className={classNames("filter-strip", className)}>
      <div className="filter-strip-fields">{children}</div>
      {actions ? <div className="filter-strip-actions">{actions}</div> : null}
    </div>
  );
}

export type SplitWorkspaceProps = HTMLAttributes<HTMLDivElement> & {
  list: ReactNode;
  detail: ReactNode;
};

export function SplitWorkspace({ list, detail, className, ...props }: SplitWorkspaceProps) {
  return (
    <div {...props} className={classNames("split-workspace", className)}>
      <section className="split-workspace-list">{list}</section>
      <section className="split-workspace-detail">{detail}</section>
    </div>
  );
}

export type RecordListItem = {
  id: string;
  title: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
};

export type RecordListProps<TItem extends RecordListItem = RecordListItem> = HTMLAttributes<HTMLDivElement> & {
  items: readonly TItem[];
  selectedId?: string | null;
  onSelect: (id: string, item: TItem) => void;
  emptyState?: ReactNode;
  renderMeta?: (item: TItem) => ReactNode;
  renderStatus?: (item: TItem) => ReactNode;
};

export function RecordList<TItem extends RecordListItem>({
  items,
  selectedId,
  onSelect,
  emptyState,
  renderMeta,
  renderStatus,
  className,
  "aria-label": ariaLabel = "Records",
  ...props
}: RecordListProps<TItem>) {
  if (items.length === 0) {
    return (
      <div {...props} className={classNames("record-list", className)}>
        {emptyState ?? <EmptyState title="暂无记录" message="当前没有可显示的记录" />}
      </div>
    );
  }

  return (
    <div {...props} className={classNames("record-list", className)} role="listbox" aria-label={ariaLabel}>
      {items.map((item) => {
        const isSelected = item.id === selectedId;
        const meta = renderMeta?.(item);
        const status = renderStatus?.(item);

        return (
          <button
            key={item.id}
            type="button"
            className={classNames("record-list-item", isSelected && "selected")}
            role="option"
            aria-selected={isSelected}
            disabled={item.disabled}
            onClick={() => onSelect(item.id, item)}
          >
            <span className="record-list-copy">
              <strong>{item.title}</strong>
              {item.description ? <span>{item.description}</span> : null}
              {meta ? <small>{meta}</small> : null}
            </span>
            {status ? <span className="record-list-status">{status}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

export type DetailPanelProps = HTMLAttributes<HTMLElement> & {
  title: ReactNode;
  description?: ReactNode;
  status?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
};

export function DetailPanel({ title, description, status, actions, children, className, ...props }: DetailPanelProps) {
  return (
    <section {...props} className={classNames("detail-panel", className)}>
      <header className="detail-panel-header">
        <div className="detail-panel-title">
          <h2>{title}</h2>
          {description ? <p>{description}</p> : null}
        </div>
        {status ? <div className="detail-panel-status">{status}</div> : null}
        {actions ? <div className="detail-panel-actions">{actions}</div> : null}
      </header>
      <div className="detail-panel-body">{children}</div>
    </section>
  );
}

export type WorkflowStepState = "complete" | "current" | "upcoming";

export type WorkflowStep = {
  id: string;
  label: ReactNode;
  description?: ReactNode;
};

export type WorkflowStepperProps = HTMLAttributes<HTMLOListElement> & {
  steps: readonly WorkflowStep[];
  currentStepId: string;
};

export function WorkflowStepper({ steps, currentStepId, className, "aria-label": ariaLabel = "Workflow steps", ...props }: WorkflowStepperProps) {
  const currentIndex = steps.findIndex((step) => step.id === currentStepId);

  return (
    <ol {...props} className={classNames("workflow-stepper", className)} aria-label={ariaLabel}>
      {steps.map((step, index) => {
        const state: WorkflowStepState = index === currentIndex ? "current" : currentIndex >= 0 && index < currentIndex ? "complete" : "upcoming";

        return (
          <li
            key={step.id}
            className="workflow-stepper-step"
            data-state={state}
            aria-current={state === "current" ? "step" : undefined}
          >
            <span className="workflow-stepper-marker" aria-hidden="true">
              {index + 1}
            </span>
            <span className="workflow-stepper-copy">
              <strong>{step.label}</strong>
              {step.description ? <span>{step.description}</span> : null}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

export type ConfirmActionProps = HTMLAttributes<HTMLDivElement> & {
  label: ReactNode;
  confirmLabel: ReactNode;
  cancelLabel?: ReactNode;
  busyLabel?: ReactNode;
  confirmationText?: ReactNode;
  disabled?: boolean;
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
};

export function ConfirmAction({
  label,
  confirmLabel,
  cancelLabel = "取消",
  busyLabel = "处理中...",
  confirmationText,
  disabled = false,
  busy = false,
  onConfirm,
  className,
  ...props
}: ConfirmActionProps) {
  const [isConfirming, setIsConfirming] = useState(false);
  const isDisabled = disabled || busy;

  function handleConfirm() {
    try {
      void Promise.resolve(onConfirm()).finally(() => {
        setIsConfirming(false);
      });
    } catch (error) {
      setIsConfirming(false);
      throw error;
    }
  }

  if (!isConfirming) {
    return (
      <div {...props} className={classNames("confirm-action", className)}>
        <button type="button" className="confirm-action-trigger" disabled={isDisabled} onClick={() => setIsConfirming(true)}>
          {busy ? busyLabel : label}
        </button>
      </div>
    );
  }

  return (
    <div {...props} className={classNames("confirm-action confirming", className)}>
      {confirmationText ? <span className="confirm-action-message">{confirmationText}</span> : null}
      <div className="confirm-action-buttons">
        <button type="button" className="confirm-action-confirm" disabled={isDisabled} onClick={handleConfirm}>
          {busy ? busyLabel : confirmLabel}
        </button>
        <button type="button" className="secondary-button confirm-action-cancel" disabled={busy} onClick={() => setIsConfirming(false)}>
          {cancelLabel}
        </button>
      </div>
    </div>
  );
}
