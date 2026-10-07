import { AuthApiError } from "./auth";

export type TruckMetric = {
  vendorId: number;
  name: string;
  category: string;
  location: string;
  menuItemCount: number;
  availableItemCount: number;
  averageMenuPrice: number | null;
  totalStopCount: number;
  upcomingStopCount: number;
  nextStopAt: string | null;
};

export type TruckAnalytics = {
  totalTrucks: number;
  totalMenuItems: number;
  availableMenuItems: number;
  upcomingStops: number;
  trucks: TruckMetric[];
};

export async function getTruckAnalytics(signal: AbortSignal): Promise<TruckAnalytics> {
  const response = await fetch("/api/operator/analytics/trucks", {
    signal,
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) throw new AuthApiError(response.status, "Unable to load your analytics");
  return response.json();
}
