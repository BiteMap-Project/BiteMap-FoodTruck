import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ErrorState, LoadingState } from "../components/StatusViews";
import { getCurrentOperator, logoutOperator, type OperatorAccount } from "../services/auth";
import "./operator-auth.css";
import OperatorWorkspace from "../features/operator/OperatorWorkspace";

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

  if (session.status === "ready") return <OperatorWorkspace account={session.account} onSignOut={signOut} signingOut={signingOut} logoutError={logoutError} />;

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
    </main>
  );
}

export default OperatorHomePage;
