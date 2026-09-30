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

type ErrorProps = {
  message: string;
  onRetry?: () => void;
  children?: ReactNode;
};

export function ErrorState({ message, onRetry, children }: ErrorProps) {
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return (
    <div className="state state-error" role="alert">
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
};

export function EmptyState({ title, hint, children }: EmptyProps) {
  return (
    <div className="state state-empty" role="status">
      <p className="state-title">{title}</p>
      {hint && <p className="state-hint">{hint}</p>}
      {children && <div className="state-actions">{children}</div>}
    </div>
  );
}
