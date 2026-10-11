import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthApiError, registerOperator } from "../services/auth";
import PasswordInput from "../components/PasswordInput";
import "./operator-auth.css";

function OperatorRegisterPage() {
  const navigate = useNavigate();
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
    if (password !== confirmation) {
      setFieldErrors({ confirmation: "Passwords do not match." });
      return;
    }
    setSubmitting(true);
    try {
      const account = await registerOperator(displayName, email, password);
      navigate("/operator/login", {
        replace: true,
        state: { registered: true, email: account.email },
      });
    } catch (cause) {
      if (cause instanceof AuthApiError) {
        setError(cause.message);
        setFieldErrors(cause.fieldErrors);
      } else {
        setError("Unable to create the account. Please try again.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="register-heading">
        <Link className="auth-brand" to="/">BiteMap</Link>
        <h1 id="register-heading">Create your BiteMap account</h1>
        <p className="auth-intro">After signing in, you can activate the owner workspace.</p>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <form onSubmit={submit} noValidate>
          <label htmlFor="register-name">Display name</label>
          <input
            id="register-name"
            autoComplete="name"
            maxLength={120}
            required
            aria-describedby={fieldErrors.displayName ? "register-name-error" : undefined}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          {fieldErrors.displayName && <span id="register-name-error" className="field-error">{fieldErrors.displayName}</span>}

          <label htmlFor="register-email">Email</label>
          <input
            id="register-email"
            type="email"
            autoComplete="email"
            maxLength={320}
            required
            aria-describedby={fieldErrors.email ? "register-email-error" : undefined}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          {fieldErrors.email && <span id="register-email-error" className="field-error">{fieldErrors.email}</span>}

          <label htmlFor="register-password">Password</label>
          <PasswordInput
            id="register-password"
            autoComplete="new-password"
            minLength={15}
            maxLength={128}
            required
            aria-describedby="password-hint register-password-error"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
          <span id="password-hint" className="field-hint">Use at least 15 characters.</span>
          {fieldErrors.password && <span id="register-password-error" className="field-error">{fieldErrors.password}</span>}

          <label htmlFor="register-confirmation">Confirm password</label>
          <PasswordInput
            id="register-confirmation"
            autoComplete="new-password"
            minLength={15}
            maxLength={128}
            required
            aria-describedby={fieldErrors.confirmation ? "register-confirmation-error" : undefined}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
          {fieldErrors.confirmation && (
            <span id="register-confirmation-error" className="field-error">{fieldErrors.confirmation}</span>
          )}

          <button type="submit" disabled={submitting}>
            {submitting ? "Creating account…" : "Create account"}
          </button>
        </form>
        <p className="auth-switch">Already registered? <Link to="/operator/login">Sign in</Link></p>
      </section>
    </main>
  );
}

export default OperatorRegisterPage;
