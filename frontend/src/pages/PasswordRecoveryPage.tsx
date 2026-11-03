import { type FormEvent, useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import PasswordInput from "../components/PasswordInput";
import { useAuth } from "../auth/authState";
import { useAuthCooldown } from "../auth/useAuthCooldown";
import { AuthApiError } from "../services/auth";
import { recoverPassword } from "../services/passwordRecovery";
import "./operator-auth.css";

export default function PasswordRecoveryPage({ reset = false }: { reset?: boolean }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { refreshAccount } = useAuth();
  const [token, setToken] = useState(() => new URLSearchParams(location.hash.slice(1)).get("token") ?? "");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const { seconds, handleRateLimit } = useAuthCooldown();
  const validLink = /^[A-Za-z0-9_-]{43}$/.test(token);

  useEffect(() => {
    // Keep credentials in memory only: not URL history, storage, or analytics.
    if (reset && location.hash) navigate(location.pathname, { replace: true });
  }, [reset, location.hash, location.pathname, navigate]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || seconds > 0) return;
    setError("");
    if (reset && password !== confirmation) { setError("Passwords do not match."); return; }
    submitting.current = true; setBusy(true);
    try {
      const result = await recoverPassword(reset ? "reset-password" : "forgot-password", reset ? { token, password } : { email });
      setMessage(result); setPassword(""); setConfirmation("");
      if (reset) {
        setToken("");
        // A failed session read must not undo a successful reset.
        await refreshAccount().catch(() => undefined);
      }
    } catch (cause) {
      handleRateLimit(cause);
      setError(cause instanceof AuthApiError ? cause.message : "The result could not be confirmed. Nothing was retried automatically. If you reset your password, try signing in with the new password before requesting another link.");
    } finally { submitting.current = false; setBusy(false); }
  }
  return <main className="auth-page">
    <meta name="referrer" content="no-referrer" />
    <aside className="auth-story" aria-label="Account recovery">
      <Link className="auth-brand" to="/trucks">BiteMap<span>.</span></Link>
      <div><p className="auth-eyebrow">LET’S GET YOU BACK</p><h2>Good food.<br />A fresh start.</h2><p>Secure recovery for your BiteMap account.</p></div>
    </aside>
    <section className="auth-card" aria-labelledby="recovery-heading">
      <p className="auth-eyebrow">ACCOUNT RECOVERY</p>
      <h1 id="recovery-heading">{reset ? "Set a new password" : "Forgot password?"}</h1>
      {message ? <p className="auth-success" role="status">{message}</p> : <>
        <p className="auth-intro">{reset ? "Use 15–128 characters. After resetting, sign in again on each device." : "Enter your account email. If an eligible account exists, we’ll email a reset link."}</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        {reset && !validLink ? <p role="alert">This reset link is missing or invalid. Reopen the link from your email or request a new one.</p> :
          <form onSubmit={submit}>
            {reset ? <>
              <label htmlFor="reset-password">New password</label>
              <PasswordInput id="reset-password" autoComplete="new-password" required minLength={15} maxLength={128} value={password} onChange={e => setPassword(e.target.value)} />
              <label htmlFor="confirm-reset-password">Confirm new password</label>
              <PasswordInput id="confirm-reset-password" autoComplete="new-password" required minLength={15} maxLength={128} value={confirmation} onChange={e => setConfirmation(e.target.value)} />
            </> : <>
              <label htmlFor="recovery-email">Email</label>
              <input id="recovery-email" type="email" autoComplete="email" required maxLength={320} value={email} onChange={e => setEmail(e.target.value)} />
            </>}
            <button type="submit" disabled={busy || seconds > 0}>{seconds > 0 ? `Try again in ${seconds}s` : busy ? "Submitting…" : reset ? "Update password" : "Send reset link"}</button>
          </form>}
      </>}
      {reset && <p className="auth-switch"><Link to="/forgot-password">Request a new reset link</Link></p>}
      <p className="auth-switch"><Link to="/customer/login">Customer sign in</Link> · <Link to="/operator/login">Owner sign in</Link></p>
      <Link className="auth-back" to="/trucks">← Browse trucks</Link>
    </section>
  </main>;
}
