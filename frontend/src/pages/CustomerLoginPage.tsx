import { type FormEvent, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import PasswordInput from "../components/PasswordInput";
import { AuthApiError, getCurrentAccount, loginAccount } from "../services/auth";
import "./operator-auth.css";

type LoginState = { registered?: boolean; email?: string; returnTo?: string } | null;

export default function CustomerLoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const state = location.state as LoginState;
  const returnTo = state?.returnTo?.startsWith("/") ? state.returnTo : "/cart";
  const [email, setEmail] = useState(state?.email ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    getCurrentAccount(controller.signal).then((account) => {
      if (account && !controller.signal.aborted) navigate(returnTo, { replace: true });
    }, () => {});
    return () => controller.abort();
  }, [navigate, returnTo]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await loginAccount(email, password);
      navigate(returnTo, { replace: true });
    } catch (cause) {
      setError(cause instanceof AuthApiError ? cause.message : "Unable to sign in. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return <main className="auth-page">
    <aside className="auth-story" aria-label="Customer account introduction">
      <Link className="auth-brand" to="/trucks">BiteMap<span>.</span></Link>
      <div><p className="auth-eyebrow">YOUR ORDER. YOUR PICKUP.</p><h2>Save your cart.<br />Confirm your order.<br /><em>Pick up fresh.</em></h2><p>Sign in when you’re ready to continue your pickup order.</p></div>
      <p className="auth-story-foot">Browse every truck without an account.</p>
    </aside>
    <section className="auth-card" aria-labelledby="customer-login-heading">
      <p className="auth-eyebrow">CUSTOMER CHECKOUT</p>
      <h1 id="customer-login-heading">Customer sign in</h1>
      <p className="auth-intro">Your cart will still be here after you sign in.</p>
      {state?.registered && <p className="auth-success" role="status">Account created. You can sign in now.</p>}
      {error && <p className="auth-error" role="alert">{error}</p>}
      <form onSubmit={submit}>
        <label htmlFor="customer-login-email">Email</label>
        <input id="customer-login-email" type="email" autoComplete="email" maxLength={320} required value={email} onChange={(event) => setEmail(event.target.value)} />
        <label htmlFor="customer-login-password">Password</label>
        <PasswordInput id="customer-login-password" autoComplete="current-password" maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />
        <button type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in and return to cart"}</button>
      </form>
      <p className="auth-switch">New customer? <Link to="/customer/register" state={{ returnTo }}>Create an account</Link></p>
      <Link className="auth-back" to="/cart">← Return to cart</Link>
    </section>
  </main>;
}
