import type { ReactNode } from "react";
import { Link, Navigate, useLocation } from "react-router-dom";
import { ErrorState, LoadingState } from "../components/StatusViews";
import { hasRole } from "../services/auth";
import { useAuth } from "./authState";

function GuardState({ children, role }: { children: ReactNode; role: "ROLE_OPERATOR" | "ROLE_ADMIN" }) {
  const location = useLocation();
  const { account, status, error, refreshAccount } = useAuth();

  if (status === "loading") return <main><LoadingState label="Checking your session…" /></main>;
  if (status === "error") return <main><ErrorState message={error} onRetry={() => void refreshAccount().catch(() => undefined)} /></main>;
  if (!account) {
    const destination = role === "ROLE_OPERATOR" ? "/operator/login" : "/customer/login";
    return <Navigate to={destination} replace state={{ returnTo: location.pathname }} />;
  }
  if (!hasRole(account, role)) {
    if (role === "ROLE_OPERATOR") return <Navigate to="/operator/onboarding" replace />;
    return <main><section role="alert"><h1>Administrator access required</h1><p>This account cannot review owner applications.</p><Link to="/trucks">Return to BiteMap</Link></section></main>;
  }
  return children;
}

/** Any signed-in account (customer, owner or admin). Guests go to customer sign-in and come back. */
export function RequireAccount({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { account, status, error, refreshAccount } = useAuth();
  if (status === "loading") return <main><LoadingState label="Checking your session…" /></main>;
  if (status === "error") return <main><ErrorState message={error} onRetry={() => void refreshAccount().catch(() => undefined)} /></main>;
  if (!account) return <Navigate to="/customer/login" replace state={{ returnTo: location.pathname }} />;
  return children;
}

export const RequireOperator = ({ children }: { children: ReactNode }) => <GuardState role="ROLE_OPERATOR">{children}</GuardState>;
export const RequireAdmin = ({ children }: { children: ReactNode }) => <GuardState role="ROLE_ADMIN">{children}</GuardState>;
