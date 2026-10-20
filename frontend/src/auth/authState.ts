import { createContext, useContext } from "react";
import type { Account } from "../services/auth";

export type AuthStatus = "loading" | "ready" | "error";

export type AuthContextValue = {
  account: Account | null;
  status: AuthStatus;
  error: string;
  refreshAccount: () => Promise<Account | null>;
  signIn: (email: string, password: string) => Promise<Account>;
  signOut: () => Promise<void>;
  activateOperator: () => Promise<Account>;
};

export const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
