import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ErrorState, LoadingState } from "../components/StatusViews";
import { getCurrentOperator, logoutOperator, type OperatorAccount } from "../services/auth";
import "./operator-auth.css";
import OperatorTrucks from "../features/operator/OperatorTrucks";

type SessionState =
  | { status: "loading" }
  | { status: "ready"; account: OperatorAccount }
  | { status: "error" };

function OperatorHomePage() {
  const navigate = useNavigate();
  const [attempt, setAttempt] = useState(0);
  const [session, setSession] = useState<SessionState>({ status: "loading" });
  const [logoutError, setLogoutError] = useState("");
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getCurrentOperator(controller.signal).then(
      (account) => {
        if (controller.signal.aborted) return;
        if (!account) navigate("/operator/login", { replace: true });
        else setSession({ status: "ready", account });
      },
      () => {
        if (!controller.signal.aborted) setSession({ status: "error" });
      },
    );
    return () => controller.abort();
  }, [attempt, navigate]);

  const signOut = useCallback(async () => {
    setLogoutError("");
    setSigningOut(true);
    try {
      await logoutOperator();
      navigate("/operator/login", { replace: true });
    } catch {
      setLogoutError("Unable to sign out. Please try again.");
      setSigningOut(false);
    }
  }, [navigate]);

  return (
    <main className="operator-page">
      <Link to="/">← Browse trucks</Link>
      {session.status === "loading" && <LoadingState label="Checking your session…" />}
      {session.status === "error" && (
        <ErrorState
          message="Unable to load your operator account."
          onRetry={() => {
            setSession({ status: "loading" });
            setAttempt((value) => value + 1);
          }}
        />
      )}
      {session.status === "ready" && (
        <>
        <section aria-labelledby="operator-heading">
          <h1 id="operator-heading">Welcome, {session.account.displayName}</h1>
          <p>{session.account.email}</p>
          <p className="operator-note">Manage your trucks, publish menus, and check your business activity.</p>
          <p className="operator-note"><Link to="/operator/analytics">View my business insights →</Link></p>
          {logoutError && <p className="auth-error" role="alert">{logoutError}</p>}
          <button type="button" onClick={signOut} disabled={signingOut}>
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
        </section>
        <OperatorTrucks />
        </>
      )}
    </main>
  );
}

export default OperatorHomePage;
