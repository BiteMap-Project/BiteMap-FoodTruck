import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { becomeOperator, getCurrentAccount, loginAccount, logoutAccount, type Account } from "../services/auth";
import { updateDisplayName } from "../services/account";
import { AUTH_ACCESS_EVENT } from "./authEvents";
import { AuthContext, type AuthContextValue, type AuthStatus } from "./authState";

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [error, setError] = useState("");
  // A late session read must not undo logout, a 401, or a newer account update.
  const sessionRevision = useRef(0);

  const checkSession = useCallback(async (background = false) => {
    const revision = ++sessionRevision.current;
    // Native file pickers trigger window focus when they close. Replacing the
    // route with a loading screen here destroys drafts and selected files.
    if (!background) setStatus("loading");
    setError("");
    try {
      const current = await getCurrentAccount();
      if (revision !== sessionRevision.current) return current;
      setAccount(current);
      setStatus("ready");
      return current;
    } catch (cause) {
      if (revision !== sessionRevision.current) throw cause;
      setAccount(null);
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Unable to check your session. Please try again.");
      throw cause;
    }
  }, []);

  const refreshAccount = useCallback(() => checkSession(), [checkSession]);

  useEffect(() => {
    let active = true;
    const revision = ++sessionRevision.current;
    getCurrentAccount().then(
      (current) => {
        if (!active || revision !== sessionRevision.current) return;
        setAccount(current);
        setError("");
        setStatus("ready");
      },
      (cause) => {
        if (!active || revision !== sessionRevision.current) return;
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
        sessionRevision.current++;
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
    const refreshOnFocus = () => { void checkSession(true).catch(() => undefined); };
    window.addEventListener("focus", refreshOnFocus);
    return () => window.removeEventListener("focus", refreshOnFocus);
  }, [checkSession]);

  const value = useMemo<AuthContextValue>(() => ({
    account,
    status,
    error,
    refreshAccount,
    signIn: async (email, password) => {
      const current = await loginAccount(email, password);
      sessionRevision.current++;
      setAccount(current);
      setError("");
      setStatus("ready");
      return current;
    },
    signOut: async () => {
      await logoutAccount();
      sessionRevision.current++;
      setAccount(null);
      setError("");
      setStatus("ready");
    },
    activateOperator: async () => {
      const current = await becomeOperator();
      sessionRevision.current++;
      setAccount(current);
      setError("");
      setStatus("ready");
      return current;
    },
    updateProfile: async (displayName) => {
      const current = await updateDisplayName(displayName);
      sessionRevision.current++;
      setAccount(current);
      return current;
    },
  }), [account, error, refreshAccount, status]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
