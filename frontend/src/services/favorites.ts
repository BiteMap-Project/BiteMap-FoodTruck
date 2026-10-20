import type { Page } from "../types/api";
import { ApiError, getJson, sendWithCsrf } from "./apiRequest";

export type FavoriteTruck = {
  id: number;
  name: string;
  category: string;
  location: string;
  savedAt: string;
};

export type FavoritePage = Page<FavoriteTruck>;

/** SCRUM-78: the signed-in customer's saved trucks, newest first. */
export function listFavorites(page: number, signal?: AbortSignal): Promise<FavoritePage> {
  const params = new URLSearchParams({ page: String(page), size: "20" });
  return getJson(`/api/customer/favorites?${params}`, "Unable to load your favorites. Please try again.", signal);
}

/** IDs of every saved truck, used to show Save or Saved on cards. */
export async function listFavoriteIds(signal?: AbortSignal): Promise<number[]> {
  const body = await getJson<{ vendorIds?: unknown }>("/api/customer/favorites/ids", "Unable to load your favorites.", signal);
  return Array.isArray(body.vendorIds) ? body.vendorIds.filter((id): id is number => typeof id === "number") : [];
}

const path = (vendorId: number) => `/api/customer/favorites/${encodeURIComponent(String(vendorId))}`;

/** Saving twice is fine on the server (204 both times). */
export const saveFavorite = (vendorId: number) =>
  sendWithCsrf<void>("PUT", path(vendorId), undefined, "Unable to save this truck. Please try again.");

/** Removing a truck that is not saved also succeeds (204). */
export const removeFavorite = (vendorId: number) =>
  sendWithCsrf<void>("DELETE", path(vendorId), undefined, "Unable to remove this truck. Please try again.");

export const isSignedOut = (error: unknown) => error instanceof ApiError && error.status === 401;
