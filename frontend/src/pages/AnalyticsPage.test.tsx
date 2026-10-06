import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import AnalyticsPage from "./AnalyticsPage";

const fetchMock = vi.fn();
const data = {
  totalTrucks: 1,
  totalMenuItems: 2,
  availableMenuItems: 1,
  upcomingStops: 1,
  trucks: [{ vendorId: 7, name: "Analytics Tacos", category: "Tacos", location: "CSUN", menuItemCount: 2, availableItemCount: 1, averageMenuPrice: 10, totalStopCount: 3, upcomingStopCount: 1, nextStopAt: "2030-01-02T18:00:00Z" }],
};

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

it("renders database totals and truck details", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => data });
  render(<MemoryRouter><AnalyticsPage /></MemoryRouter>);
  expect(screen.getByRole("status")).toHaveTextContent("Loading");
  expect(await screen.findByText("Analytics Tacos")).toBeInTheDocument();
  expect(screen.getByText("1 of 2 available")).toBeInTheDocument();
  expect(screen.getByText("$10.00")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Analytics Tacos" })).toHaveAttribute("href", "/trucks/7");
  expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
});

it("shows an empty state", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ...data, totalTrucks: 0, trucks: [] }) });
  render(<MemoryRouter><AnalyticsPage /></MemoryRouter>);
  expect(await screen.findByText("No truck data is available yet.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Export CSV" })).not.toBeInTheDocument();
});

it("retries after an API failure", async () => {
  fetchMock.mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true, json: async () => data });
  render(<MemoryRouter><AnalyticsPage /></MemoryRouter>);
  expect(await screen.findByRole("alert")).toHaveTextContent("couldn’t load");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await act(async () => {});
  expect(await screen.findByText("Analytics Tacos")).toBeInTheDocument();
});
