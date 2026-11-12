import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "../../auth/authState";
import ActionError from "../../components/ActionError";
import { RatingText, Stars } from "./RatingBadge";
import { getMyReview, listReviews, publishRating, saveReview, type MyReview, type ReviewPage } from "./reviewsApi";
import "./reviews.css";

export default function ReviewsSection({ vendorId, owner = false }: { vendorId: number; owner?: boolean }) {
  const { account, status } = useAuth();
  // Private editor state never survives an account or truck change.
  return <ReviewContent key={`${vendorId}:${account?.id ?? "guest"}:${owner}`} vendorId={vendorId}
    owner={owner} accountId={account?.id ?? null} customer={account?.roles.includes("ROLE_CUSTOMER") ?? false} authReady={status === "ready"} />;
}
function ReviewContent({ vendorId, owner, accountId, customer, authReady }: {
  vendorId: number; owner: boolean; accountId: number | null; customer: boolean; authReady: boolean;
}) {
  const location = useLocation();
  const section = useRef<HTMLElement>(null);
  const [page, setPage] = useState(0);
  const [revision, setRevision] = useState(0);
  const requestKey = `${page}:${revision}`;
  const [result, setResult] = useState<{ key: string; data?: ReviewPage; error?: string } | null>(null);
  const loading = result?.key !== requestKey;
  const data = loading ? null : result?.data;
  const error = loading ? "" : result?.error;
  useEffect(() => {
    if (!owner && location.hash === "#customer-reviews") section.current?.scrollIntoView?.({ block: "start" });
  }, [location.hash, owner]);
  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 15000);
    let active = true;
    listReviews(vendorId,page,owner,controller.signal).then(value => {
      if (active) { setResult({ key: requestKey, data: value }); publishRating(vendorId,value.summary); }
    }, () => { if (active) setResult({ key: requestKey, error: "Reviews could not load. Please try again." }); })
      .finally(() => { window.clearTimeout(timer); });
    return () => { active = false; window.clearTimeout(timer); controller.abort(); };
  }, [vendorId,page,owner,requestKey]);
  return <section ref={section} id={owner ? undefined : "customer-reviews"} className="reviews-section" aria-labelledby="reviews-heading">
    <div className="reviews-heading"><div><p className="reviews-eyebrow">CUSTOMER FEEDBACK</p><h2 id="reviews-heading">{owner ? "Your truck’s reviews" : "Customer reviews"}</h2></div>
      <button type="button" disabled={loading} onClick={() => setRevision(r=>r+1)}>Refresh reviews</button></div>
    {loading && <p role="status">Loading reviews…</p>}
    {error && <p role="alert">{error}</p>}
    {data && <>
      <RatingText summary={data.summary} />
      {data.totalElements === 0 && <p>No reviews yet. Reviews come from customers who have completed a pickup order.</p>}
      {data.totalElements > 0 && data.items.length === 0 && <p>No reviews on this page. Return to the previous page.</p>}
      <ul className="reviews-list">{data.items.map(review => <li key={review.id}>
        <div className="review-byline"><strong>{review.authorName}</strong><span className="review-verified">Verified customer</span></div>
        <div className="review-meta"><span><Stars rating={review.rating} /> <span>{review.rating} / 5</span></span>
          <time dateTime={review.createdAt}>{new Date(review.createdAt).toLocaleDateString()}</time>
          {review.version > 0 && <span>Edited</span>}</div>
        <p className="review-comment">{review.comment}</p>
      </li>)}</ul>
      {data.totalPages > 1 && <nav className="reviews-pagination" aria-label="Review pages">
        <button disabled={page===0} onClick={()=>setPage(p=>p-1)}>Previous reviews</button>
        <span>Page {page+1} of {data.totalPages}</span>
        <button disabled={page+1>=data.totalPages} onClick={()=>setPage(p=>p+1)}>Next reviews</button>
      </nav>}
    </>}
    {owner ? <p className="reviews-help">These reviews are public. Only their authors can edit them.</p>
      : !authReady ? <p>Checking your account…</p>
      : accountId === null ? <p><Link to="/customer/login" state={{ returnTo: `/trucks/${vendorId}#customer-reviews` }}>Sign in to leave a review</Link> after completing a pickup order.</p>
      : customer ? <ReviewEditor vendorId={vendorId} accountId={accountId} onSaved={()=>{setPage(0);setRevision(r=>r+1);}} />
      : <p>A customer account with a completed order is required to write a review.</p>}
  </section>;
}
function ReviewEditor({ vendorId, accountId, onSaved }: { vendorId: number; accountId: number; onSaved: ()=>void }) {
  const [mine, setMine] = useState<MyReview | null>(null);
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [loadedAttempt, setLoadedAttempt] = useState(-1);
  const loading = loadedAttempt !== attempt;
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const lock = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current=true; return ()=>{mounted.current=false;}; },[]);
  useEffect(() => {
    const controller=new AbortController();
    let active=true;
    const timer=window.setTimeout(()=>controller.abort(),15000);
    getMyReview(vendorId,controller.signal).then(value=>{
      if (!active) return;
      setMine(value); setRating(value.review?.rating ?? 0); setComment(value.review?.comment ?? ""); setBlocked(false);
    },()=>{if(active){setMine(null);setError("Your review could not load. Reload to try again.");}})
      .finally(()=>{window.clearTimeout(timer);if(active)setLoadedAttempt(attempt);});
    return ()=>{active=false;window.clearTimeout(timer);controller.abort();};
  },[vendorId,attempt]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if(lock.current || blocked || !mine?.eligible) return;
    if(rating < 1 || !comment.trim()) {setError("Choose a star rating and write a comment.");return;}
    lock.current=true; setBusy(true);setError("");setMessage("");
    try {
      const review=await saveReview(vendorId,accountId,rating,comment.trim(),mine.review?.version ?? -1);
      if(!mounted.current)return;
      setMine({...mine,review});setComment(review.comment);setMessage("Your review has been saved.");onSaved();
    } catch(cause) {
      if(!mounted.current)return;
      setError(cause instanceof Error ? cause.message : "Unable to confirm the save.");
      setBlocked(true); // An interrupted response may have committed; reload before retrying.
    } finally {lock.current=false;if(mounted.current)setBusy(false);}
  }
  return <div className="review-editor">
    <h3>{mine?.review ? "Edit your review" : "Write a review"}</h3>
    {loading ? <p role="status">Checking review eligibility…</p> : mine?.eligible ? <form onSubmit={submit}>
      <fieldset disabled={busy || blocked}><legend>Your rating</legend><div className="review-rating-options">
        {[1,2,3,4,5].map(value=><label key={value}><input type="radio" aria-label={`${value} ${value===1?"star":"stars"}`} name="review-rating" required value={value} checked={rating===value} onChange={()=>setRating(value)} /><span aria-hidden="true">★</span> {value}<span className="review-sr-only"> {value===1?"star":"stars"}</span></label>)}
      </div></fieldset>
      <label className="review-comment-label" htmlFor="review-comment">Your experience</label>
      <textarea id="review-comment" required maxLength={2000} rows={4} disabled={busy||blocked} value={comment} onChange={e=>setComment(e.target.value)} aria-describedby="review-comment-help" />
      <p id="review-comment-help" className="reviews-help">{comment.length}/2000 characters. Your display name, rating and comment will be public. One review per customer per truck.</p>
      <button type="submit" disabled={busy||blocked}>{busy?"Saving review…":mine.review?"Update review":"Publish review"}</button>
    </form> : mine && <p>{mine.reason}</p>}
    <ActionError message={error} />
    {message && <p role="status">{message}</p>}
    {!loading && (blocked||!mine) && <button type="button" disabled={busy} onClick={()=>{setError("");setMessage("");setAttempt(a=>a+1);}}>Reload your review (discard draft)</button>}
  </div>;
}