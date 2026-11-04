import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import TruckMap, { groupStops } from "./TruckMap";
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
  expect(screen.getByRole("heading", { name: "Taco Mobile" })).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Soup Stop" })).toBeInTheDocument();
  expect(screen.getAllByRole("link", { name: "View truck & menu →" }).map(link => link.getAttribute("href")))
    .toEqual(["/trucks/2", "/trucks/3"]);
  expect(screen.getByRole("link", { name: "Geoapify" })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /OpenStreetMap contributors/ })).toBeInTheDocument();
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
