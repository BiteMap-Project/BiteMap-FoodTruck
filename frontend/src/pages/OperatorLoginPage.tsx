import { type FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthApiError, hasRole } from "../services/auth";
import PasswordInput from "../components/PasswordInput";
import { useAuth } from "../auth/authState";
import { useAuthCooldown } from "../auth/useAuthCooldown";
import { workspaceRoute } from "../features/operator/ownerReturn";
import "./operator-auth.css";

type RegistrationState = { registered?: boolean; email?: string; returnTo?: string } | null;

function OperatorLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const registration = location.state as RegistrationState;
  const requested = registration?.returnTo;
  const returnTo = typeof requested === "string" && (workspaceRoute(requested.split("?")[0]) || ["/operator", "/owner", "/operator/analytics"].includes(requested.split("?")[0])) ? requested : "/operator";
  const { account, signIn } = useAuth();
  const [email, setEmail] = useState(registration?.email || "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { seconds, handleRateLimit } = useAuthCooldown();

  useEffect(() => {
    if (account) navigate(hasRole(account, "ROLE_OPERATOR") ? returnTo : "/operator/onboarding", { replace: true });
  }, [account, navigate, returnTo]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || seconds > 0) return;
    setError("");
    setSubmitting(true);
    try {
      const current = await signIn(email, password);
      navigate(hasRole(current, "ROLE_OPERATOR") ? returnTo : "/operator/onboarding", { replace: true });
    } catch (cause) {
      handleRateLimit(cause);
      setError(cause instanceof AuthApiError ? cause.message : "Unable to sign in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <aside className="auth-story" aria-label="Owner workspace introduction">
        <Link className="auth-brand" to="/trucks">BiteMap<span>.</span></Link>
        <div><p className="auth-eyebrow">YOUR KITCHEN. YOUR COMMUNITY.</p><h2>Good food.<br />Great places.<br /><em>Your next chapter.</em></h2><p>Keep your menu fresh and let people know where you’re headed. Your kitchen on wheels, all in one workspace.</p></div>
        <p className="auth-story-foot">Made for the people who bring the flavor.</p>
      </aside>
      <section className="auth-card" aria-labelledby="login-heading">
        <p className="auth-eyebrow">WELCOME BACK</p>
        <h1 id="login-heading">Operator sign in</h1>
        <p className="auth-intro">Sign in, then activate owner tools if this is your first visit.</p>
        {registration?.registered && (
          <p className="auth-success" role="status">Account created. You can sign in now.</p>
        )}
        {error && <p className="auth-error" role="alert">{error}</p>}
        <form onSubmit={submit}>
          <label htmlFor="login-email">Email</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            maxLength={320}
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <label htmlFor="login-password">Password</label>
          <PasswordInput
            id="login-password"
            autoComplete="current-password"
            maxLength={128}
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <button type="submit" disabled={submitting || seconds > 0}>
            {seconds > 0 ? `Try again in ${seconds}s` : submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <p className="auth-switch">New to BiteMap? <Link to="/operator/register">Create an account</Link></p>
        <Link className="auth-back" to="/trucks">← Just browsing? Find a food truck</Link>
      </section>
    </main>
  );
}

export default OperatorLoginPage;
