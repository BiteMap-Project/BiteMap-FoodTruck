import { type FormEvent, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { hasRole } from "../services/auth";
import { getOwnerApplication, submitOwnerApplication, type OwnerApplication } from "../services/ownerApplications";
import { useAuth } from "../auth/authState";
import "./operator-auth.css";

export default function OperatorOnboardingPage() {
  const navigate = useNavigate();
  const { account, status, error: sessionError, refreshAccount, activateOperator } = useAuth();
  const [application, setApplication] = useState<OwnerApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [businessName, setBusinessName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [operatingArea, setOperatingArea] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError("");
      try {
        if (status === "loading") return;
        if (status === "error") { setError(sessionError); return; }
        if (!account) { navigate("/operator/login", { replace: true }); return; }
        if (hasRole(account, "ROLE_OPERATOR")) { navigate("/operator", { replace: true }); return; }
        const value = await getOwnerApplication(controller.signal);
        if (controller.signal.aborted) return;
        setContactEmail((previous) => previous || account.email); setApplication(value);
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to check your application."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load();
    return () => controller.abort();
  }, [account, attempt, navigate, sessionError, status]);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setError(""); setBusy(true);
    try { setApplication(await submitOwnerApplication({ businessName, contactEmail, operatingArea })); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to submit your application."); }
    finally { setBusy(false); }
  }
  async function enterWorkspace() {
    setError(""); setBusy(true);
    try { await activateOperator(); navigate("/operator"); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to open the owner workspace."); }
    finally { setBusy(false); }
  }
  return <main className="auth-page"><section className="auth-card" aria-labelledby="owner-onboarding-heading">
    <Link className="auth-brand" to="/trucks">BiteMap<span>.</span></Link>
    <p className="auth-eyebrow">OWNER APPLICATION</p>
    <h1 id="owner-onboarding-heading">{application?.status === "PENDING" ? "Application pending" : application?.status === "APPROVED" ? "Owner application approved" : application?.status === "REJECTED" ? "Application not approved" : "Apply to become a truck owner"}</h1>
    {loading && <p role="status">Checking your application…</p>}
    {error && <p className="auth-error" role="alert">{error}</p>}
    {!loading && !error && account && !application && <form onSubmit={submit}><p className="auth-intro">Owner tools become available after review by the BiteMap team.</p>
      <label htmlFor="business-name">Business name</label><input id="business-name" required maxLength={120} value={businessName} onChange={(e) => setBusinessName(e.target.value)} />
      <label htmlFor="contact-email">Contact email</label><input id="contact-email" type="email" required maxLength={320} value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} />
      <label htmlFor="operating-area">Operating area</label><input id="operating-area" required maxLength={240} value={operatingArea} onChange={(e) => setOperatingArea(e.target.value)} />
      <button disabled={busy}>{busy ? "Submitting…" : "Submit application"}</button>
    </form>}
    {!loading && application?.status === "PENDING" && <><p>Thanks, {application.businessName}. Your application is awaiting review by the BiteMap team.</p><p>Owner workspace is not enabled yet. You can continue browsing and ordering as a customer.</p></>}
    {!loading && application?.status === "REJECTED" && <><p>{application.reviewNote}</p><p>Contact the BiteMap team for follow-up. Your customer account is still available.</p></>}
    {!loading && application?.status === "APPROVED" && <><p>Your application was approved. Open your workspace to create a new truck. Existing trucks cannot be claimed.</p><button disabled={busy} onClick={enterWorkspace}>{busy ? "Opening…" : "Access your truck"}</button></>}
    <button type="button" disabled={loading || busy} onClick={() => { void refreshAccount().catch(() => undefined); setAttempt((n) => n + 1); }}>Refresh application status</button>
    <Link className="auth-back" to="/trucks">Continue as a customer</Link>
  </section></main>;
}
