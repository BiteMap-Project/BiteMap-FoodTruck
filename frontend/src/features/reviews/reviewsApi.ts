import { postWithCsrf } from "../../services/auth";
import { reportAuthorizationResponse } from "../../auth/authEvents";

export type RatingSummary = { averageRating: number | null; reviewCount: number };
export type CustomerReview = {
  id: number; authorName: string; rating: number; comment: string;
  version: number; createdAt: string; updatedAt: string;
};
export type ReviewPage = {
  items: CustomerReview[]; page: number; size: number; totalElements: number;
  totalPages: number; summary: RatingSummary;
};
export type MyReview = { eligible: boolean; reason: string; review: CustomerReview | null };
export const reviewsChanged = "bitemap:reviews-changed";

async function read<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(path, { credentials: "same-origin", headers: { Accept: "application/json" }, signal });
  if (!response.ok) {
    reportAuthorizationResponse(response.status);
    throw new Error(response.status === 401 ? "Sign in again to view your review." : "Reviews could not load. Please try again.");
  }
  return response.json();
}

export function publishRating(vendorId: number, summary: RatingSummary) {
  window.dispatchEvent(new CustomEvent(reviewsChanged, { detail: { vendorId, summary } }));
}
export function listReviews(vendorId: number, page: number, owner: boolean, signal: AbortSignal) {
  const prefix = owner ? "/api/operator/vendors" : "/api/vendors";
  return read<ReviewPage>(`${prefix}/${vendorId}/reviews?page=${page}`, signal).then(result => {
    if (!Array.isArray(result.items) || !result.summary) throw new Error("Reviews could not load. Please try again.");
    return result;
  });
}
export function getMyReview(vendorId: number, signal: AbortSignal) {
  return read<MyReview>(`/api/customer/vendors/${vendorId}/review`, signal);
}
export function saveReview(vendorId: number, accountId: number, rating: number, comment: string, version: number) {
  return postWithCsrf<CustomerReview>(`/api/customer/vendors/${vendorId}/review`,
    { rating, comment, version }, "Unable to save your review. Reload reviews before trying again.",
    { "X-Review-Account-Id": String(accountId) }, AbortSignal.timeout(20000));
}