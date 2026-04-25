import type { ReactNode } from "react";

export function FormActions({
  isSubmitting,
  submitLabel,
  submitDisabled = false,
  onCancel
}: {
  isSubmitting: boolean;
  submitLabel: string;
  submitDisabled?: boolean;
  onCancel?: () => void;
}) {
  return (
    <div className="form-actions master-data-form-actions">
      {onCancel ? (
        <button className="secondary-button" type="button" onClick={onCancel} disabled={isSubmitting}>
          取消
        </button>
      ) : null}
      <button type="submit" disabled={isSubmitting || submitDisabled}>
        {isSubmitting ? "提交中" : submitLabel}
      </button>
    </div>
  );
}

export function FieldHint({ children }: { children: ReactNode }) {
  return <div className="field-hint">{children}</div>;
}

export function MessageLine({ error, message }: { error: string | null; message: string | null }) {
  return (
    <div className="message-line master-data-message-line" role="status" aria-live="polite">
      {error ? <span className="text-error">{error}</span> : message}
    </div>
  );
}
