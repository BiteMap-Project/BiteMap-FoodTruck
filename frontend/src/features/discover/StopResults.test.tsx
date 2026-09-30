import { MemoryRouter } from "react-router-dom";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import DiscoverPage from "../../pages/DiscoverPage";
import type { Stop, StopPage } from "../../services/stops";

const stop: Stop = {
  stopId: 7,
  vendor: { id: -2, name: "Taco Mobile", category: "Tacos", location: "Northridge" },
  venueName: "CSUN Oviatt Lawn",
  address: "18111 Nordhoff St, Northridge, CA",
  latitude: 34.2400,
  longitude: -118.5291,
  startsAt: "2026-09-28T18:00:00Z",
  endsAt: "2026-09-28T21:00:00Z",
  timeZone: "America/Los_Angeles",
  status: "serving",
  lastConfirmedAt: "2026-09-28T18:05:00Z",
  distanceMeters: null,
};
const data: StopPage = {
  items: [stop], page: 0, size: 20, totalElements: 1, totalPages: 1, evaluatedAt: "2026-09-28T19:00:00Z",
};
const fetchMock = vi.fn();
const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const tick = () => act(async () => { await vi.advanceTimersByTimeAsync(300); });
const lastUrl = () => new URL(fetchMock.mock.lastCall![0], "http://localhost");

async function openSchedule() {
  render(<MemoryRouter><DiscoverPage /></MemoryRouter>);
  await tick(); // initial "All trucks" request
  fireEvent.click(screen.getByRole("button", { name: "Schedule & nearby" }));
  await tick();
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(new Date("2026-09-28T19:00:00Z"));
  fetchMock.mockReset();
  fetchMock.mockImplementation(async (url: string) =>
    ok(url.startsWith("/api/vendor-stops") ? data : { items: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }));
  vi.stubGlobal("fetch", fetchMock);
});

it("switches to scheduled stops and shows venue, local hours, status and profile link", async () => {
  await openSchedule();
  expect(lastUrl().pathname).toBe("/api/vendor-stops");
  expect(lastUrl().searchParams.has("from")).toBe(false); // server default: next 7 days
  expect(screen.getByRole("button", { name: "Schedule & nearby" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByText("1 stop found")).toBeInTheDocument();
  expect(screen.getByText("CSUN Oviatt Lawn")).toBeInTheDocument();
  expect(screen.getByText("Mon, Sep 28, 11:00 AM – 2:00 PM PDT")).toBeInTheDocument();
  expect(screen.getByText("Serving now")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "View Profile & Menu" })).toHaveAttribute("href", "/trucks/-2");
});

it.each(["Next 7 days", "Open now", "Later today", "Pick dates"])(
  "keeps loaded results when the selected %s filter is clicked again",
  async (label) => {
    await openSchedule();
    if (label !== "Next 7 days") {
      fireEvent.click(screen.getByRole("button", { name: label }));
      if (label === "Pick dates") {
        fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-05" } });
        fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-06" } });
      }
      await tick();
    }
    expect(screen.getByText("CSUN Oviatt Lawn")).toBeInTheDocument();
    const calls = fetchMock.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: label }));
    expect(screen.queryByText("Loading schedules…")).not.toBeInTheDocument();
    await tick();
    expect(screen.getByText("CSUN Oviatt Lawn")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledTimes(calls);
  },
);

it("sends search, cuisine and 'Open now' filters and offers to clear them", async () => {
  await openSchedule();
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "taco" } });
  fireEvent.change(screen.getByLabelText("Cuisine"), { target: { value: " Tacos " } });
  fireEvent.click(screen.getByRole("button", { name: "Open now" }));
  await tick();
  const url = lastUrl();
  expect(url.searchParams.get("q")).toBe("taco");
  expect(url.searchParams.get("cuisine")).toBe("Tacos");
  const from = Date.parse(url.searchParams.get("from")!);
  expect(Math.abs(from - Date.parse("2026-09-28T19:00:00Z"))).toBeLessThan(5_000); // request-time "now"
  expect(Date.parse(url.searchParams.get("to")!) - from).toBe(60_000);
  expect(url.searchParams.get("page")).toBe("0");

  fireEvent.click(screen.getByRole("button", { name: "Clear filters" }));
  await tick();
  expect(lastUrl().searchParams.has("cuisine")).toBe(false);
  expect(lastUrl().searchParams.has("from")).toBe(false);
  expect(screen.queryByRole("button", { name: "Clear filters" })).not.toBeInTheDocument();
});

it("suggests cuisines seen in results", async () => {
  await openSchedule();
  const options = document.querySelectorAll("#filter-cuisine-options option");
  expect([...options].map((option) => option.getAttribute("value"))).toEqual(["Tacos"]);
});

it("validates custom dates locally and sends an inclusive range", async () => {
  await openSchedule();
  const calls = fetchMock.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Pick dates" }));
  await tick();
  expect(screen.getByRole("alert")).toHaveTextContent("Choose a start and end date.");
  fireEvent.change(screen.getByLabelText("From"), { target: { value: "2026-10-05" } });
  fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-01" } });
  await tick();
  expect(screen.getByRole("alert")).toHaveTextContent("on or after the start date");
  expect(fetchMock.mock.calls.length).toBe(calls);
  fireEvent.change(screen.getByLabelText("To"), { target: { value: "2026-10-06" } });
  await tick();
  expect(fetchMock.mock.calls.length).toBe(calls + 1);
  expect(new Date(lastUrl().searchParams.get("from")!)).toEqual(new Date(2026, 9, 5));
  expect(new Date(lastUrl().searchParams.get("to")!)).toEqual(new Date(2026, 9, 7));
});

it("searches near the user's rounded location within the chosen radius, nearest first", async () => {
  const getCurrentPosition = vi.fn((success: PositionCallback) =>
    success({ coords: { latitude: 34.240012345, longitude: -118.529198765 } } as GeolocationPosition));
  vi.stubGlobal("navigator", { ...navigator, geolocation: { getCurrentPosition } });
  fetchMock.mockImplementation(async () => ok({ ...data, items: [{ ...stop, distanceMeters: 804.672 }] }));
  await openSchedule();
  fireEvent.click(screen.getByRole("button", { name: "Near me" }));
  await tick();
  expect(lastUrl().searchParams.get("lat")).toBe("34.24");
  expect(lastUrl().searchParams.get("lon")).toBe("-118.5292");
  expect(Number(lastUrl().searchParams.get("radiusKm"))).toBeCloseTo(16.09344);
  expect(screen.getByText("0.5 mi away")).toBeInTheDocument();

  fireEvent.change(screen.getByLabelText("Within"), { target: { value: "25" } });
  await tick();
  expect(Number(lastUrl().searchParams.get("radiusKm"))).toBeCloseTo(40.2336);

  fireEvent.click(screen.getByRole("button", { name: "Stop using my location" }));
  await tick();
  expect(lastUrl().searchParams.has("lat")).toBe(false);
});

it("explains when location permission is denied", async () => {
  const getCurrentPosition = vi.fn((_: PositionCallback, failure: PositionErrorCallback) =>
    failure({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError));
  vi.stubGlobal("navigator", { ...navigator, geolocation: { getCurrentPosition } });
  await openSchedule();
  const calls = fetchMock.mock.calls.length;
  fireEvent.click(screen.getByRole("button", { name: "Near me" }));
  await tick();
  expect(screen.getByRole("alert")).toHaveTextContent("Location access is blocked");
  expect(fetchMock.mock.calls.length).toBe(calls);
  expect(screen.getByText("CSUN Oviatt Lawn")).toBeInTheDocument();
});

it("shows the server's message for rejected filters", async () => {
  await openSchedule();
  fetchMock.mockResolvedValueOnce({
    ok: false, status: 400, json: async () => ({ detail: "Invalid schedule range." }),
  });
  fireEvent.change(screen.getByLabelText("Cuisine"), { target: { value: "x" } });
  await tick();
  expect(screen.getByRole("alert")).toHaveTextContent("Invalid schedule range.");
});

it("shows a filter-specific empty state, and a retryable error", async () => {
  await openSchedule();
  fetchMock.mockResolvedValueOnce(ok({ ...data, items: [], totalElements: 0, totalPages: 0 }));
  fireEvent.change(screen.getByLabelText("Cuisine"), { target: { value: "Sushi" } });
  await tick();
  expect(screen.getByText(/No trucks match these filters/)).toBeInTheDocument();

  fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });
  fireEvent.change(screen.getByLabelText("Cuisine"), { target: { value: "Tacos" } });
  await tick();
  expect(screen.getByRole("alert")).toHaveTextContent("Unable to load schedules");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  await tick();
  expect(screen.getByText("CSUN Oviatt Lawn")).toBeInTheDocument();
});

it("offers to clear filters when the server rejects them", async () => {
  await openSchedule();
  fetchMock.mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({ detail: "Bad cuisine." }) });
  fireEvent.change(screen.getByLabelText("Cuisine"), { target: { value: "x" } });
  await tick();
  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent("Bad cuisine.");
  fireEvent.click(within(alert).getByRole("button", { name: "Clear filters" }));
  await tick();
  expect(screen.getByLabelText("Cuisine")).toHaveValue("");
  expect(screen.getByText("CSUN Oviatt Lawn")).toBeInTheDocument();
});

it("suggests looking further ahead when nothing is scheduled", async () => {
  fetchMock.mockImplementation(async () => ok({ ...data, items: [], totalElements: 0, totalPages: 0 }));
  await openSchedule();
  expect(screen.getByText("No trucks are scheduled in the next 7 days.")).toBeInTheDocument();
  expect(screen.getByText(/Pick dates/, { selector: ".state-hint" })).toBeInTheDocument();
});
