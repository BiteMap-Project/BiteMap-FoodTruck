import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TruckMap, { groupStops } from "./TruckMap";
import { Map as LeafletMap } from "leaflet";
import DiscoverPage from "../../pages/DiscoverPage";
import { AuthProvider } from "../../auth/AuthContext";
import type { Stop, StopPage } from "../../services/stops";

vi.mock("../../services/auth", () => ({ getCurrentAccount: vi.fn(async () => null) }));

const stop: Stop = {
  stopId: 7, vendor: { id: 2, name: "Taco Mobile", category: "Tacos", location: "Northridge" },
  venueName: "CSUN", address: "18111 Nordhoff St, Northridge, CA",
  latitude: 34.24, longitude: -118.5291, startsAt: "2090-06-10T18:00:00Z",
  endsAt: "2090-06-10T21:00:00Z", timeZone: "America/Los_Angeles",
  status: "scheduled", lastConfirmedAt: null, distanceMeters: null,
};
const another: Stop = { ...stop, stopId: 8, vendor: { ...stop.vendor, id: 3, name: "Soup Stop" } };
const data: StopPage = { items: [stop], page: 0, size: 20, totalElements: 21, totalPages: 2, evaluatedAt: "2090-06-10T17:00:00Z" };
const ok = (body: unknown) => ({ ok: true, json: async () => body });
it("keeps coarse-pointer page scrolling by default and makes gestures explicitly reversible", () => {
  vi.stubEnv("VITE_GEOAPIFY_API_KEY", "test-key");
  vi.stubGlobal("matchMedia", vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  const { container } = render(<MemoryRouter><TruckMap stops={[stop]} page={0} total={1} /></MemoryRouter>);
  expect(container.querySelector(".leaflet-container")).toHaveClass("map-page-scroll");
  fireEvent.click(screen.getByRole("button", { name: "Enable map gestures" }));
  expect(container.querySelector(".leaflet-container")).not.toHaveClass("map-page-scroll");
  fireEvent.click(screen.getByRole("button", { name: "Use page scrolling" }));
  expect(container.querySelector(".leaflet-container")).toHaveClass("map-page-scroll");
});
it("links directions to the scheduled coordinates without a customer origin", () => {
  vi.stubEnv("VITE_GEOAPIFY_API_KEY", "test-key");
  render(<MemoryRouter><TruckMap stops={[stop]} page={0} total={1} /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Taco Mobile at CSUN" }));
  const link = screen.getByRole("link", { name: /Get directions/ });
  const url = new URL(link.getAttribute("href")!);
  expect(url.hostname).toBe("www.google.com");
  expect(url.searchParams.get("destination")).toBe("34.24,-118.5291");
  expect(url.searchParams.has("origin")).toBe(false);
  expect(link).toHaveAttribute("rel", "noopener noreferrer");
});

it("selects cards from pins and opens pins from cards, including shared locations", async () => {
  vi.stubEnv("VITE_GEOAPIFY_API_KEY", "test-key");
  const fetchMock = vi.fn().mockResolvedValue(ok({ ...data, items: [stop, another], totalElements: 2, totalPages: 1 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><AuthProvider><DiscoverPage /></AuthProvider></MemoryRouter>);
  const buttons = await screen.findAllByRole("button", { name: /Show on map/ });
  await screen.findByRole("button", { name: "2 scheduled stops at this location" });
  fireEvent.click(buttons[1]);
  expect(buttons[1]).toHaveAttribute("aria-pressed", "true");
  await screen.findByRole("button", { name: "Show Taco Mobile in list" });
  fireEvent.click(screen.getByRole("button", { name: "Show Taco Mobile in list" }));
  expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
  expect(buttons[1]).toHaveAttribute("aria-pressed", "false");
  expect(document.getElementById("stop-card-7")).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "2 scheduled stops at this location" }));
  expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(buttons[1]);
  expect(buttons[1]).toHaveAttribute("aria-pressed", "true");
  fetchMock.mockResolvedValue(ok({ ...data, items: [stop], totalElements: 1, totalPages: 1 }));
  fireEvent.click(screen.getByRole("button", { name: "Refresh stops" }));
  await waitFor(() => expect(document.getElementById("stop-card-8")).toBeNull());
  expect(screen.getByRole("button", { name: "Show on map" })).toHaveAttribute("aria-pressed", "false");
});
it("preserves the viewport when background updates move pins and fits only on request", () => {
  vi.stubEnv("VITE_GEOAPIFY_API_KEY", "test-key");
  const fit = vi.spyOn(LeafletMap.prototype, "fitBounds");
  const { rerender } = render(<MemoryRouter><TruckMap stops={[stop]} page={0} total={1} /></MemoryRouter>);
  const calls = fit.mock.calls.length;
  rerender(<MemoryRouter><TruckMap stops={[{ ...stop, latitude: 34.5 }]} page={0} total={1} /></MemoryRouter>);
  expect(fit).toHaveBeenCalledTimes(calls);
  fireEvent.click(screen.getByRole("button", { name: "Fit pins" }));
  expect(fit).toHaveBeenCalledTimes(calls + 1);
  fit.mockRestore();
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); });

it("offers recovery when tile requests stall and starts a fresh timeout on retry", () => {
  vi.useFakeTimers();
  vi.stubEnv("VITE_GEOAPIFY_API_KEY", "test-key");
  render(<MemoryRouter><TruckMap stops={[stop]} page={0} total={1} /></MemoryRouter>);
  expect(screen.getByRole("status")).toHaveTextContent("Loading street map");
  act(() => vi.advanceTimersByTime(15_000));
  expect(screen.getByRole("alert")).toHaveTextContent("street map could not load");
  expect(screen.getByRole("button", { name: "Taco Mobile at CSUN" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry map" }));
  expect(screen.getByRole("status")).toHaveTextContent("Loading street map");
  act(() => vi.advanceTimersByTime(15_000));
  expect(screen.getByRole("alert")).toBeInTheDocument();
});

it("clears loading after tiles succeed without a later false timeout", () => {
  vi.useFakeTimers();
  vi.stubEnv("VITE_GEOAPIFY_API_KEY", "test-key");
  const { container } = render(<MemoryRouter><TruckMap stops={[stop]} page={0} total={1} /></MemoryRouter>);
  expect(screen.getByRole("status")).toHaveTextContent("Loading street map");
  expect(container.querySelectorAll("img.leaflet-tile").length).toBeGreaterThan(0);
  container.querySelectorAll("img.leaflet-tile").forEach(tile => fireEvent.load(tile));
  expect(screen.queryByText("Loading street map…")).not.toBeInTheDocument();
  act(() => vi.advanceTimersByTime(15_000));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("groups shared coordinates and excludes invalid coordinates without losing other stops", () => {
  expect(groupStops([stop, another, { ...stop, latitude: NaN }, { ...stop, longitude: 181 }]))
    .toEqual([{ latitude: stop.latitude, longitude: stop.longitude, stops: [stop, another] }]);
});

it("shows a useful fallback without a key and does not create a tile layer", () => {
  vi.stubEnv("VITE_GEOAPIFY_API_KEY", "");
  const { container } = render(<MemoryRouter><TruckMap stops={[stop]} page={0} total={21} /></MemoryRouter>);
  expect(screen.getByRole("status")).toHaveTextContent("map is not configured");
  expect(screen.getByText("1 of 21 matching stops plotted · Page 1")).toBeInTheDocument();
  expect(container.querySelector(".leaflet-container")).toBeNull();
});

it("opens all trucks at the same location with distinct menu links and required attribution", () => {
  vi.stubEnv("VITE_GEOAPIFY_API_KEY", "test-key");
  render(<MemoryRouter><TruckMap stops={[stop, another]} page={0} total={2} /></MemoryRouter>);
  const marker = screen.getByRole("button", { name: "2 scheduled stops at this location" });
  expect(marker).toHaveAttribute("tabindex", "0");
  fireEvent.click(marker);
  expect(document.querySelector(".leaflet-container")).toHaveClass("map-popup-open");
  expect(screen.getByRole("heading", { name: "Taco Mobile" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Soup Stop" })).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "View truck & menu →" }).map(link => link.getAttribute("href")))
    .toEqual(["/trucks/2", "/trucks/3"]);
  expect(screen.getByRole("link", { name: "Geoapify" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /OpenStreetMap contributors/ })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Close popup" }));
  expect(document.querySelector(".leaflet-container")).not.toHaveClass("map-popup-open");
});

it("replaces pins when a different page is supplied", () => {
  vi.stubEnv("VITE_GEOAPIFY_API_KEY", "test-key");
  const { rerender } = render(<MemoryRouter><TruckMap stops={[stop]} page={0} total={21} /></MemoryRouter>);
  expect(screen.getByRole("button", { name: "Taco Mobile at CSUN" })).toBeInTheDocument();
  rerender(<MemoryRouter><TruckMap stops={[{ ...another, latitude: 34.30 }]} page={1} total={21} /></MemoryRouter>);
  expect(screen.queryByRole("button", { name: "Taco Mobile at CSUN" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Soup Stop at CSUN" })).toBeInTheDocument();
  expect(screen.getByText("1 of 21 matching stops plotted · Page 2")).toBeInTheDocument();
});

it("preserves access to pins after a tile error and offers retry", () => {
  vi.stubEnv("VITE_GEOAPIFY_API_KEY", "test-key");
  const { container } = render(<MemoryRouter><TruckMap stops={[stop]} page={0} total={1} /></MemoryRouter>);
  const tile = container.querySelector("img.leaflet-tile");
  expect(tile).not.toBeNull();
  fireEvent.error(tile!);
  // Leaflet emits a final load event even when a tile failed.
  container.querySelectorAll("img.leaflet-tile").forEach(image => {
    if (image !== tile) fireEvent.load(image);
  });
  expect(screen.getByRole("alert")).toHaveTextContent("street map could not load");
  expect(screen.getByRole("button", { name: "Taco Mobile at CSUN" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Retry map" }));
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(container.querySelector("img.leaflet-tile")).not.toBe(tile);
  container.querySelectorAll("img.leaflet-tile").forEach(image => fireEvent.load(image));
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});

it("opens the map at home and keeps its filters and pagination tied to the stop list", async () => {
  vi.stubEnv("VITE_GEOAPIFY_API_KEY", "test-key");
  const fetchMock = vi.fn().mockResolvedValueOnce(ok(data))
    .mockResolvedValueOnce(ok({ ...data, page: 1, items: [{ ...another, latitude: 34.30 }] }))
    .mockResolvedValue(ok({ ...data, totalElements: 1, totalPages: 1 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<MemoryRouter><AuthProvider><DiscoverPage /></AuthProvider></MemoryRouter>);
  expect(screen.getByRole("button", { name: "Map" })).toHaveAttribute("aria-pressed", "true");
  await screen.findByRole("button", { name: "Taco Mobile at CSUN" });
  expect(fetchMock.mock.calls[0][0]).toContain("/api/vendor-stops?");
  fireEvent.click(screen.getByRole("button", { name: "Next" }));
  await screen.findByRole("button", { name: "Soup Stop at CSUN" });
  expect(fetchMock.mock.calls[1][0]).toContain("page=1");
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "taco" } });
  await screen.findByRole("button", { name: "Taco Mobile at CSUN" });
  expect(fetchMock.mock.calls[2][0]).toContain("q=taco&page=0");
  const results = screen.getByRole("region", { name: "Schedule results" });
  expect(within(results).getByRole("link", { name: "View Profile & Menu" })).toHaveAttribute("href", "/trucks/2");
  fireEvent.click(screen.getByRole("button", { name: "Schedule & nearby" }));
  await waitFor(() => expect(screen.queryByRole("region", { name: "Truck stop map" })).not.toBeInTheDocument());
  expect(screen.getByRole("link", { name: "View Profile & Menu" })).toBeInTheDocument();
});
