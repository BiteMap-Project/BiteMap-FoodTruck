import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { becomeOperator, getCurrentAccount, loginAccount, logoutAccount, type Account } from "../services/auth";
import { updateDisplayName } from "../services/account";
import { AUTH_ACCESS_EVENT } from "./authEvents";
import { AuthContext, type AuthContextValue, type AuthStatus } from "./authState";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [error, setError] = useState("");

  const refreshAccount = useCallback(async () => {
    setStatus("loading");
    setError("");
    try {
      const current = await getCurrentAccount();
      setAccount(current);
      setStatus("ready");
      return current;
    } catch (cause) {
      setAccount(null);
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Unable to check your session. Please try again.");
      throw cause;
    }
  }, []);

  useEffect(() => {
    let active = true;
    getCurrentAccount().then(
      (current) => {
        if (!active) return;
        setAccount(current);
        setError("");
        setStatus("ready");
      },
      (cause) => {
        if (!active) return;
        setAccount(null);
        setError(cause instanceof Error ? cause.message : "Unable to check your session. Please try again.");
        setStatus("error");
      },
    );
    return () => { active = false; };
  }, []);

  useEffect(() => {
    const handleAuthorizationResponse = (event: Event) => {
      const response = event as CustomEvent<{ status: number }>;
      if (response.detail.status === 401) {
        setAccount(null);
        setError("");
        setStatus("ready");
      } else {
        void refreshAccount().catch(() => undefined);
      }
    };
    window.addEventListener(AUTH_ACCESS_EVENT, handleAuthorizationResponse);
    return () => window.removeEventListener(AUTH_ACCESS_EVENT, handleAuthorizationResponse);
  }, [refreshAccount]);

  useEffect(() => {
    const refreshOnFocus = () => { void refreshAccount().catch(() => undefined); };
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [refreshAccount]);

  const value = useMemo<AuthContextValue>(() => ({
    account,
    status,
    error,
    refreshAccount,
    signIn: async (email, password) => {
      const current = await loginAccount(email, password);
      setAccount(current);
      setError("");
      setStatus("ready");
      return current;
    },
    signOut: async () => {
      await logoutAccount();
      setAccount(null);
      setError("");
      setStatus("ready");
    },
    activateOperator: async () => {
      const current = await becomeOperator();
      setAccount(current);
      setError("");
      setStatus("ready");
      return current;
    },
    updateProfile: async (displayName) => {
      const current = await updateDisplayName(displayName);
      setAccount(current);
      return current;
    },
  }), [account, error, refreshAccount, status]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
