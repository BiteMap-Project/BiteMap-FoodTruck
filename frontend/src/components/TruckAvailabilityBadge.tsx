import { useEffect, useState } from "react";
import type { TruckAvailability } from "../types/api";
import "./truck-availability.css";

type Props = { vendorId: number; availability?: TruckAvailability; stopId?: number; stale?: boolean };

export default function TruckAvailabilityBadge(props: Props) {
  // Remount only for a new truck or server snapshot, not unrelated page renders.
  return <AvailabilityBadge key={`${props.vendorId}-${props.availability?.checkedAt ?? "unknown"}`} {...props} />;
}

function AvailabilityBadge({ vendorId, availability, stopId, stale = false }: Props) {
  const [current, setCurrent] = useState(availability);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!availability) return;
    let controller: AbortController | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    let boundary: ReturnType<typeof setTimeout> | undefined;
    let disposed = false;
    let receivedAt = Date.now();
    const scheduleBoundary = (value: TruckAvailability) => {
      clearTimeout(boundary);
      if (value.status === "CLOSED" || !value.ordersCloseAt) return;
      const remaining = Date.parse(value.ordersCloseAt) - Date.parse(value.checkedAt);
      const delay = remaining > 30 * 60_000 ? remaining - 30 * 60_000 : remaining;
      boundary = setTimeout(() => { setElapsed(Date.now() - receivedAt); void refresh(); }, Math.max(1, Math.min(delay, 2_147_483_647)));
    };
    async function refresh() {
      if (stopId !== undefined || document.visibilityState === "hidden" || controller) return;
      const request = new AbortController();
      controller = request;
      timeout = setTimeout(() => request.abort(), 10_000);
      try {
        const response = await fetch(`/api/vendors/${vendorId}/availability`, {
          signal: request.signal, cache: "no-store", headers: { Accept: "application/json" },
        });
        if (!response.ok) throw new Error("Availability unavailable");
        const value: TruckAvailability = await response.json();
        if (!["OPEN", "CLOSING_SOON", "CLOSED"].includes(value.status) || !Number.isFinite(Date.parse(value.checkedAt))) throw new Error("Invalid availability");
        if (disposed || request.signal.aborted) return;
        receivedAt = Date.now();
        setCurrent(value); setElapsed(0); setUnconfirmed(false);
        scheduleBoundary(value);
      } catch {
        if (!disposed) setUnconfirmed(true);
      } finally {
        clearTimeout(timeout);
        controller = undefined;
      }
    }
    scheduleBoundary(availability);
    const timer = setInterval(() => {
      setElapsed(Date.now() - receivedAt);
      void refresh();
    }, 30_000);
    const resume = () => { if (document.visibilityState !== "hidden") { setElapsed(Date.now() - receivedAt); void refresh(); } };
    document.addEventListener("visibilitychange", resume);
    window.addEventListener("online", resume);
    return () => {
      disposed = true; controller?.abort(); clearInterval(timer); clearTimeout(timeout); clearTimeout(boundary);
      document.removeEventListener("visibilitychange", resume); window.removeEventListener("online", resume);
    };
  }, [vendorId, availability, stopId]);

  let status = current?.status;
  if (status && status !== "CLOSED" && current?.ordersCloseAt) {
    const remaining = Date.parse(current.ordersCloseAt) - Date.parse(current.checkedAt) - elapsed;
    status = remaining <= 0 ? "CLOSED" : remaining <= 30 * 60_000 ? "CLOSING_SOON" : "OPEN";
  }
  // A future stop card must not advertise pickup at another currently active stop.
  if (stopId !== undefined && current?.stopId !== stopId) status = "CLOSED";
  const unknown = stale || unconfirmed || !current;
  const label = unknown ? "Status unconfirmed" : status === "OPEN" ? "Open now" : status === "CLOSING_SOON" ? "Closing soon" : "Closed";
  const tone = unknown ? "unknown" : status === "OPEN" ? "open" : status === "CLOSING_SOON" ? "soon" : "closed";
  return <span className={`truck-availability truck-availability--${tone}`} title={unknown
    ? "Pickup availability could not be confirmed."
    : status === "CLOSED" ? "Not currently accepting pickup orders at this location."
    : status === "CLOSING_SOON" ? "New pickup orders close within 30 minutes."
    : "Currently accepting pickup orders during the published schedule."}>
    <span aria-hidden="true" className="truck-availability-dot" />{label}
  </span>;
}