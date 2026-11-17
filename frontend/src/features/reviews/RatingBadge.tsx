import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { reviewsChanged, type RatingSummary } from "./reviewsApi";
import "./reviews.css";

export function Stars({ rating }: { rating: number }) {
  const percent = Math.max(0, Math.min(100, rating * 20));
  return <span className="review-stars" aria-hidden="true"><span>★★★★★</span><span className="review-stars-fill" style={{ width: `${percent}%` }}>★★★★★</span></span>;
}
export function RatingText({ summary }: { summary: RatingSummary }) {
  return <span className="review-rating"><Stars rating={summary.averageRating ?? 0} />
    <span>{summary.reviewCount === 0 ? "No reviews yet" : `${summary.averageRating!.toFixed(1)} / 5 · ${summary.reviewCount} ${summary.reviewCount === 1 ? "review" : "reviews"}`}</span>
  </span>;
}
export default function RatingBadge({ vendorId, averageRating = null, reviewCount = 0, onProfile = false }: {
  vendorId: number; averageRating?: number | null; reviewCount?: number; onProfile?: boolean;
}) {
  const [updated, setUpdated] = useState<{ vendorId: number; summary: RatingSummary } | null>(null);
  useEffect(() => {
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{ vendorId: number; summary: RatingSummary }>).detail;
      if (detail.vendorId === vendorId) setUpdated(detail);
    };
    window.addEventListener(reviewsChanged, changed);
    return () => window.removeEventListener(reviewsChanged, changed);
  }, [vendorId]);
  const summary = updated?.vendorId === vendorId ? updated.summary : { averageRating, reviewCount };
  return <div className="review-badge">{onProfile
    ? <a href="#customer-reviews"><RatingText summary={summary} /></a>
    : <Link to={`/trucks/${vendorId}#customer-reviews`}><RatingText summary={summary} /></Link>}
  </div>;
}