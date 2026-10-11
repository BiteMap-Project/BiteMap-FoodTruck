import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthApiError, becomeOperator, getCurrentAccount, hasRole, type Account } from "../services/auth";
import "./operator-auth.css";

export default function OperatorOnboardingPage() {
  const navigate = useNavigate();
  const [account, setAccount] = useState<Account | null>(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getCurrentAccount(controller.signal).then((current) => {
      if (!current) navigate("/operator/login", { replace: true });
      else if (hasRole(current, "ROLE_OPERATOR")) navigate("/operator", { replace: true });
      else setAccount(current);
    }, () => setError("Unable to check your account. Please try again."));
    return () => controller.abort();
  }, [navigate]);

  async function activate() {
    setError(""); setSubmitting(true);
    try { await becomeOperator(); navigate("/operator", { replace: true }); }
    catch (cause) { setError(cause instanceof AuthApiError ? cause.message : "Unable to activate the owner workspace."); setSubmitting(false); }
  }

  return <main className="auth-page"><section className="auth-card" aria-labelledby="owner-onboarding-heading">
    <Link className="auth-brand" to="/">BiteMap<span>.</span></Link>
    <p className="auth-eyebrow">OWNER ONBOARDING</p>
    <h1 id="owner-onboarding-heading">Become a truck owner</h1>
    <p className="auth-intro">{account ? `${account.displayName}, activate the owner tools to create and manage your trucks.` : "Checking your account…"}</p>
    {error && <p className="auth-error" role="alert">{error}</p>}
    <button type="button" disabled={!account || submitting} onClick={activate}>{submitting ? "Activating…" : "Activate owner workspace"}</button>
    <Link className="auth-back" to="/trucks">← Keep browsing as a customer</Link>
  </section></main>;
}
