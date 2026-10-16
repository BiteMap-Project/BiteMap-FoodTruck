import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BagIcon, ReceiptIcon, TruckIcon, LogoutIcon } from "../../components/icons";
import { getCurrentAccount, hasRole, logoutAccount, type Account } from "../../services/auth";

type Session = { status: "loading" | "error" } | { status: "ready"; account: Account | null };

export default function AccountNavigation() {
  const [session, setSession] = useState<Session>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [signingOut, setSigningOut] = useState(false);
  const [logoutError, setLogoutError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    getCurrentAccount(controller.signal).then(
      (account) => { if (!controller.signal.aborted) setSession({ status: "ready", account }); },
      () => { if (!controller.signal.aborted) setSession({ status: "error" }); },
    );
    return () => controller.abort();
  }, [attempt]);

  useEffect(() => {
    const refresh = () => {
      setSession({ status: "loading" });
      setAttempt((value) => value + 1);
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, []);

  async function signOut() {
    setSigningOut(true);
    setLogoutError("");
    try {
      await logoutAccount();
      // Cancel any in-flight session check and confirm the server's new state.
      setSession({ status: "loading" });
      setAttempt((value) => value + 1);
    } catch {
      setLogoutError("Unable to sign out. Please try again.");
    } finally {
      setSigningOut(false);
    }
  }

  return <div className="discover-account" aria-label="Your BiteMap account">
    {session.status === "loading" && <p>Checking your session…</p>}
    {session.status === "error" && <>
      <p role="alert">Unable to check your session.</p>
      <button type="button" onClick={() => { setSession({ status: "loading" }); setAttempt((value) => value + 1); }}>Retry session check</button>
    </>}
    {session.status === "ready" && (session.account ? <>
      <nav className="discover-order-nav" aria-label="Your orders">
        <p className="discover-eyebrow">YOUR ORDERS</p>
        <Link className="discover-menu-link" to="/cart"><BagIcon />My cart</Link>
        {hasRole(session.account, "ROLE_CUSTOMER") && <Link className="discover-menu-link" to="/orders"><ReceiptIcon />My orders</Link>}
      </nav>
      {hasRole(session.account, "ROLE_OPERATOR")
        ? <section className="discover-business" aria-label="Your business"><h2>Your business</h2><p>Manage your truck, menu and orders.</p><Link className="discover-menu-link" to="/operator"><TruckIcon />Access your truck <span aria-hidden="true">→</span></Link></section>
        : hasRole(session.account, "ROLE_CUSTOMER") && <section className="discover-business" aria-label="Become a truck owner"><h2>Good food. Great spots.</h2><p>Have a kitchen on wheels? Apply or check your application.</p><Link className="discover-menu-link" to="/operator/onboarding"><TruckIcon />Owner application <span aria-hidden="true">→</span></Link></section>}
      {hasRole(session.account, "ROLE_ADMIN") && <nav aria-label="Administration"><Link className="discover-menu-link" to="/admin/owner-applications"><ReceiptIcon />Review applications</Link></nav>}
      <div className="discover-account-footer">
        <div className="discover-profile"><span className="discover-profile-initials" aria-hidden="true">{session.account.displayName.trim().split(/\s+/).slice(0, 2).map(part => Array.from(part)[0] ?? "").join("").toUpperCase()}</span>
          <p className="discover-account-name"><strong>{session.account.displayName}</strong><span>{hasRole(session.account, "ROLE_CUSTOMER") ? "Signed in · Customer" : "Signed in"}</span></p>
        </div>
        <button className="discover-menu-link discover-signout" type="button" disabled={signingOut} onClick={signOut}><LogoutIcon />{signingOut ? "Signing out…" : "Sign out"}</button>
      </div>
    </> : <>
      <section className="discover-business" aria-label="Become a truck owner"><h2>Good food. Great spots.</h2><p>Have a kitchen on wheels? Give hungry people a place to find you.</p><Link className="discover-menu-link" to="/operator/register"><TruckIcon />Join as a truck owner <span aria-hidden="true">→</span></Link></section>
      <Link className="discover-owner-link" to="/customer/login" state={{ returnTo: "/trucks" }}><span><strong>Customer sign in</strong></span></Link>
      <Link className="discover-owner-link" to="/operator/login"><span><strong>Truck owner?</strong><small>Sign in to your workspace</small></span></Link>
    </>)}
    {logoutError && <p role="alert">{logoutError}</p>}
  </div>;
}
