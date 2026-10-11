import { type FormEvent, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import PasswordInput from "../components/PasswordInput";
import { AuthApiError, registerAccount } from "../services/auth";
import "./operator-auth.css";

export default function CustomerRegisterPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const requestedReturn = (location.state as { returnTo?: string } | null)?.returnTo;
  const returnTo = requestedReturn?.startsWith("/") ? requestedReturn : "/cart";
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFieldErrors({});
    if (password !== confirmation) { setFieldErrors({ confirmation: "Passwords do not match." }); return; }
    setSubmitting(true);
    try {
      const account = await registerAccount(displayName, email, password);
      navigate("/customer/login", { replace: true, state: { registered: true, email: account.email, returnTo } });
    } catch (cause) {
      if (cause instanceof AuthApiError) { setError(cause.message); setFieldErrors(cause.fieldErrors); }
      else setError("Unable to create the account. Please try again.");
    } finally { setSubmitting(false); }
  }

  return <main className="auth-page"><section className="auth-card" aria-labelledby="customer-register-heading">
    <Link className="auth-brand" to="/">BiteMap<span>.</span></Link>
    <h1 id="customer-register-heading">Create a customer account</h1>
    <p className="auth-intro">Create an account, then sign in to continue with your cart.</p>
    {error && <p className="auth-error" role="alert">{error}</p>}
    <form onSubmit={submit} noValidate>
      <label htmlFor="customer-register-name">Display name</label><input id="customer-register-name" autoComplete="name" maxLength={120} required value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
      {fieldErrors.displayName && <span className="field-error">{fieldErrors.displayName}</span>}
      <label htmlFor="customer-register-email">Email</label><input id="customer-register-email" type="email" autoComplete="email" maxLength={320} required value={email} onChange={(event) => setEmail(event.target.value)} />
      {fieldErrors.email && <span className="field-error">{fieldErrors.email}</span>}
      <label htmlFor="customer-register-password">Password</label><PasswordInput id="customer-register-password" autoComplete="new-password" minLength={15} maxLength={128} required value={password} onChange={(event) => setPassword(event.target.value)} />
      <span className="field-hint">Use at least 15 characters.</span>{fieldErrors.password && <span className="field-error">{fieldErrors.password}</span>}
      <label htmlFor="customer-register-confirmation">Confirm password</label><PasswordInput id="customer-register-confirmation" autoComplete="new-password" minLength={15} maxLength={128} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
      {fieldErrors.confirmation && <span className="field-error">{fieldErrors.confirmation}</span>}
      <button type="submit" disabled={submitting}>{submitting ? "Creating account…" : "Create account"}</button>
    </form>
    <p className="auth-switch">Already registered? <Link to="/customer/login" state={{ returnTo }}>Sign in</Link></p>
    <Link className="auth-back" to="/cart">← Return to cart</Link>
  </section></main>;
}
