import { type FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/authState";
import { DISPLAY_NAME_MAX, validateDisplayName } from "../services/account";
import { ApiError } from "../services/apiRequest";
import "./cart.css";
import "./account.css";

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

/** SCRUM-79: the signed-in account's settings. Rendered inside RequireAccount. */
export default function AccountSettingsPage() {
  const { account, updateProfile } = useAuth();
  const [displayName, setDisplayName] = useState(account?.displayName ?? "");
  const [fieldError, setFieldError] = useState("");
  const [save, setSave] = useState<SaveState>({ kind: "idle" });

  if (!account) return null;
  const unchanged = displayName.trim() === account.displayName;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const problem = validateDisplayName(displayName);
    setFieldError(problem ?? "");
    if (problem) {
      setSave({ kind: "idle" });
      return;
    }
    setSave({ kind: "saving" });
    try {
      const updated = await updateProfile(displayName);
      setDisplayName(updated.displayName);
      setSave({ kind: "saved" });
    } catch (cause) {
      if (cause instanceof ApiError) {
        setFieldError(cause.fieldErrors.displayName ?? "");
        setSave({ kind: "error", message: cause.status === 401 ? "Your session ended. Sign in again to save changes." : cause.message });
      } else {
        setSave({ kind: "error", message: "Unable to reach BiteMap. Check your connection and try again." });
      }
    }
  }

  return <div className="cart-site">
    <header className="cart-header"><Link className="cart-brand" to="/trucks">BiteMap<span>.</span></Link><Link to="/trucks">Browse trucks</Link></header>
    <main className="cart-page account-settings">
      <p className="cart-eyebrow">YOUR ACCOUNT</p>
      <h1>Account settings</h1>
      <p>Update how your name appears on BiteMap, including on your orders.</p>

      <form className="account-card" aria-label="Account details" noValidate onSubmit={submit}>
        <label htmlFor="account-display-name">Display name</label>
        <input
          id="account-display-name"
          autoComplete="name"
          maxLength={DISPLAY_NAME_MAX}
          required
          value={displayName}
          aria-invalid={fieldError ? true : undefined}
          aria-describedby={fieldError ? "account-display-name-error" : undefined}
          onChange={(event) => {
            setDisplayName(event.target.value);
            setFieldError("");
            if (save.kind !== "saving") setSave({ kind: "idle" });
          }}
        />
        {fieldError && <p id="account-display-name-error" className="account-field-error">{fieldError}</p>}

        <label htmlFor="account-email">Email</label>
        <input id="account-email" type="email" value={account.email} readOnly aria-describedby="account-email-hint" />
        <p id="account-email-hint" className="account-hint">Your email is used to sign in and can’t be changed here.</p>

        {save.kind === "saved" && <p className="account-success" role="status">Your display name was saved.</p>}
        {save.kind === "error" && <p className="account-error" role="alert">{save.message}</p>}
        <div className="account-actions">
          <button className="cart-primary" type="submit" disabled={save.kind === "saving" || unchanged}>
            {save.kind === "saving" ? "Saving…" : "Save changes"}
          </button>
          {save.kind === "error" && save.message.startsWith("Your session ended") &&
            <Link to="/customer/login" state={{ returnTo: "/account" }}>Sign in again</Link>}
        </div>
      </form>
    </main>
  </div>;
}
