import { type FormEvent, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { getCurrentAccount, hasRole } from "../services/auth";
import { getPendingApplications, reviewOwnerApplication, type OwnerApplication } from "../services/ownerApplications";
import "./admin-applications.css";

function ReviewForm({ application, onReviewed }: { application: OwnerApplication; onReviewed: () => void }) {
  const [decision, setDecision] = useState<"APPROVED" | "REJECTED">("APPROVED");
  const [note, setNote] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!confirmed || busy) return;
    setBusy(true); setError("");
    try { await reviewOwnerApplication(application.id, decision, note); onReviewed(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Review failed."); setBusy(false); }
  }
  return <section className="review-card"><header className="review-card-header"><div><p className="review-eyebrow">APPLICATION #{application.id}</p><h2>{application.businessName}</h2></div><span className="review-badge">Pending review</span></header>
    <dl className="review-details"><div><dt>Contact email</dt><dd>{application.contactEmail}</dd></div><div><dt>Operating area</dt><dd>{application.operatingArea}</dd></div></dl>
    <form onSubmit={submit} aria-label={`Review ${application.businessName}`}><fieldset disabled={busy}>
      <legend>Your review</legend>
      <label>Decision<select value={decision} onChange={(e) => { setDecision(e.target.value as typeof decision); setConfirmed(false); }}><option value="APPROVED">Approve owner access</option><option value="REJECTED">Reject application</option></select></label>
      <p className="review-hint">{decision === "APPROVED" ? "Approval enables owner tools. It does not assign any existing truck." : "Rejection keeps owner tools unavailable. Customer access stays unchanged."}</p>
      <label>Review note (visible to applicant)<textarea required maxLength={500} rows={4} placeholder="Explain the decision clearly to the applicant." value={note} onChange={(e) => setNote(e.target.value)} /></label>
      <span className="review-count">{note.length}/500 characters</span>
      <label className="review-confirm"><input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} /><span>I confirm this decision for <strong>{application.businessName}</strong>.</span></label>
      <div className="review-submit"><button className="review-primary" disabled={!confirmed || busy || !note.trim()}>{busy ? "Saving…" : "Save review"}</button><span>Decision and reviewer will be recorded.</span></div>
    </fieldset></form>{error && <p className="review-error" role="alert">{error}</p>}</section>;
}
export default function AdminApplicationsPage() {
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [items, setItems] = useState<OwnerApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true); setError(""); setItems([]);
      try {
        const account = await getCurrentAccount(controller.signal);
        if (!account || !hasRole(account,"ROLE_ADMIN")) throw new Error("Administrator access required. Sign in with an authorized account.");
        const rows = await getPendingApplications(page, controller.signal);
        if (!controller.signal.aborted) setItems(rows);
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Unable to load applications."); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    }
    void load(); return () => controller.abort();
  }, [page, attempt]);
  return <main className="admin-review-page"><div className="admin-review-shell"><header className="review-page-header"><Link to="/trucks">← Browse trucks</Link><span className="review-eyebrow">BITEMAP ADMINISTRATION</span></header>
    <div className="review-title-row"><div><h1>Owner applications</h1><p>Review business details before granting owner access.</p></div><button disabled={loading} onClick={() => setAttempt((n) => n + 1)}>Reload applications</button></div>
    {loading ? <p role="status">Loading applications…</p> : error ? <p role="alert">{error}</p> : <>
      {items.length === 0 && <section className="review-card"><h2>No pending applications on this page</h2><p>New applications will appear here when submitted.</p></section>}
      {items.map((application) => <ReviewForm key={application.id} application={application} onReviewed={() => setAttempt((n) => n + 1)} />)}
    </>}
    <nav className="review-pagination" aria-label="Application pages"><span>Page {page + 1}</span><div><button disabled={loading || page === 0} onClick={() => setPage((n) => n - 1)}>Previous</button>
    <button disabled={loading || !!error || items.length < 20} onClick={() => setPage((n) => n + 1)}>Next</button></div></nav>
  </div></main>;
}
