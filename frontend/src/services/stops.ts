import type { Vendor } from "./vendors";

export type StopStatus = "scheduled" | "serving";

export type Stop = {
  stopId: number;
  vendor: Vendor;
  venueName: string;
  address: string;
  latitude: number;
  longitude: number;
  startsAt: string;
  endsAt: string;
  timeZone: string;
  status: StopStatus;
  lastConfirmedAt: string | null;
  distanceMeters: number | null;
};

export type StopPage = {
  items: Stop[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
  evaluatedAt: string;
};

export type StopQuery = {
  q: string;
  cuisine: string;
  from?: Date;
  to?: Date;
  lat?: number;
  lon?: number;
  radiusKm?: number;
  page: number;
};

/** The server rejected the filters (HTTP 400). `message` is safe to show to the user. */
export class InvalidFilterError extends Error {}

export async function listStops(query: StopQuery, signal: AbortSignal): Promise<StopPage> {
  const params = new URLSearchParams({ q: query.q, page: String(query.page), size: "20" });
  if (query.cuisine.trim()) params.set("cuisine", query.cuisine.trim());
  if (query.from) params.set("from", query.from.toISOString());
  if (query.to) params.set("to", query.to.toISOString());
  if (query.lat !== undefined && query.lon !== undefined) {
    params.set("lat", String(query.lat));
    params.set("lon", String(query.lon));
    if (query.radiusKm !== undefined) params.set("radiusKm", String(query.radiusKm));
  }
  const response = await fetch(`/api/vendor-stops?${params}`, {
    signal,
    headers: { Accept: "application/json" },
  });
  if (response.status === 400) {
    const problem = await response.json().catch(() => null);
    throw new InvalidFilterError(
      typeof problem?.detail === "string" ? problem.detail : "These filters can't be used together.",
    );
  }
  if (!response.ok) throw new Error("Unable to load schedules");
  return response.json();
}
