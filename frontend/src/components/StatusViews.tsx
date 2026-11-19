import type { ReactNode } from "react";
import "./StatusViews.css";

/**
 * Shared consumer states (SCRUM-36). Screen readers hear loading and empty
 * states politely (role="status") and errors immediately (role="alert").
 */

export function LoadingState({ label }: { label: string }) {
  return (
    <div className="state state-loading" role="status">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  );
}

export function SuccessNotice({ message }: { message: string }) {
  return (
    <div className="state-notice state-success" role="status">
      <span aria-hidden="true">✓</span>
      <p>{message}</p>
    </div>
  );
}

type ErrorProps = {
  title?: string;
  message: string;
  onRetry?: () => void;
  children?: ReactNode;
};

export function ErrorState({ title, message, onRetry, children }: ErrorProps) {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return (
    <div className="state state-error" role="alert">
      {title && <h2 className="state-title">{title}</h2>}
      <p>{message}</p>
      {offline && <p className="state-hint">You appear to be offline. Check your connection.</p>}
      {(onRetry || children) && (
        <div className="state-actions">
          {onRetry && <button type="button" onClick={onRetry}>Retry</button>}
          {children}
        </div>
      )}
    </div>
  );
}

type EmptyProps = {
  title: string;
  hint?: string;
  children?: ReactNode;
  announce?: boolean;
};

export function EmptyState({ title, hint, children, announce = true }: EmptyProps) {
  return (
    <div className="state state-empty cart-empty" role={announce ? "status" : undefined}>
      <h2 className="state-title" tabIndex={-1}>{title}</h2>
      {hint && <p className="state-hint">{hint}</p>}
      {children && <div className="state-actions">{children}</div>}
    </div>
  );
}
