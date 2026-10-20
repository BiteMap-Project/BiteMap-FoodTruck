import type { ReactNode } from "react";
import { AuthProvider } from "../auth/AuthContext";

export default function AuthTestHarness({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
