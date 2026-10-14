import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getCurrentAccount, hasRole, logoutAccount, type Account } from "../../services/auth";

type Session = { status: "loading" | "error" } | { status: "ready"; account: Account | null };

export default function AccountNavigation() {
  const [session, setSession] = useState<Session>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    getCurrentAccount(controller.signal).then(
      (account) => { if (!controller.signal.aborted) setSession({ status: "ready", account }); },
      () => { if (!controller.signal.aborted) setSession({ status: "error" }); },
    );
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    const refresh = () => {
      setSession({ status: "loading" });
      setAttempt((value) => value + 1);
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  async function signOut() {
    setSigningOut(true);
    setLogoutError("");
    try {
      await logoutAccount();
      // Cancel any in-flight session check and confirm the server's new state.
      setSession({ status: "loading" });
      setAttempt((value) => value + 1);
    } catch {
      setLogoutError("Unable to sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  return <div className="discover-account" aria-label="Your BiteMap account">
    {session.status === "loading" && <p>Checking your session…</p>}
    {session.status === "error" && <>
      <p role="alert">Unable to check your session.</p>
      <button type="button" onClick={() => { setSession({ status: "loading" }); setAttempt((value) => value + 1); }}>Retry session check</button>
    </>}
    {session.status === "ready" && (session.account ? <>
      <p className="discover-account-name"><strong>{session.account.displayName}</strong><span>{hasRole(session.account, "ROLE_CUSTOMER") ? "Signed in · Customer" : "Signed in"}</span></p>
      <div className="discover-account-actions">
        <Link to="/cart">My cart</Link>
        {hasRole(session.account, "ROLE_OPERATOR")
          ? <Link to="/operator">Access your truck</Link>
          : hasRole(session.account, "ROLE_CUSTOMER") && <Link to="/operator/onboarding">Owner application</Link>}
        {hasRole(session.account, "ROLE_ADMIN") && <Link to="/admin/owner-applications">Review applications</Link>}
        <button type="button" disabled={signingOut} onClick={signOut}>{signingOut ? "Signing out…" : "Sign out"}</button>
      </div>
    </> : <>
      <Link className="discover-owner-link" to="/customer/login" state={{ returnTo: "/trucks" }}><span><strong>Customer sign in</strong></span></Link>
      <Link className="discover-owner-link" to="/operator/login"><span><strong>Truck owner?</strong><small>Sign in to your workspace</small></span></Link>
    </>)}
    {logoutError && <p role="alert">{logoutError}</p>}
  </div>;
}
