import { act, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import TruckAvailabilityBadge from "./TruckAvailabilityBadge";
import type { TruckAvailability } from "../types/api";
const seed: TruckAvailability = { status: "OPEN", checkedAt: "2026-11-18T12:00:00Z", ordersCloseAt: "2026-11-18T14:00:00Z", stopId: 7 };
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it.each([
  ["OPEN", "Open now", "open"], ["CLOSING_SOON", "Closing soon", "soon"], ["CLOSED", "Closed", "closed"],
] as const)("shows %s with its color class", (status, label, tone) => {
  render(<TruckAvailabilityBadge vendorId={1} availability={{ ...seed, status, ordersCloseAt: status === "CLOSING_SOON" ? "2026-11-18T12:20:00Z" : seed.ordersCloseAt }} />);
  expect(screen.getByText(label)).toHaveClass(`truck-availability--${tone}`);
});
it("does not mark a different scheduled location as open", () => {
  render(<TruckAvailabilityBadge vendorId={1} stopId={8} availability={seed} />);
  expect(screen.getByText("Closed")).toBeInTheDocument();
});
it("updates at the cutoff without requiring a page reload", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date(seed.checkedAt));
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
  render(<TruckAvailabilityBadge vendorId={1} availability={{ ...seed, status: "CLOSING_SOON", ordersCloseAt: "2026-11-18T12:00:01Z" }} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.getByText("Closed")).toBeInTheDocument();
});
it("does not claim availability after a failed refresh", async () => {
  vi.useFakeTimers();
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
  render(<TruckAvailabilityBadge vendorId={1} availability={seed} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  expect(screen.getByText("Status unconfirmed")).toBeInTheDocument();
});