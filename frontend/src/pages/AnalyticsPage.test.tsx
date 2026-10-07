import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
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
  expect(await screen.findByRole("link", { name: "Analytics Tacos" })).toBeInTheDocument();
  expect(screen.getByText("1 of 2 available")).toBeInTheDocument();
  expect(screen.getByText("$10.00")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Analytics Tacos" })).toHaveAttribute("href", "/trucks/7");
  expect(screen.getByRole("button", { name: "Export CSV" })).toBeInTheDocument();
});

it("shows an empty state", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ...data, totalTrucks: 0, trucks: [] }) });
  render(<MemoryRouter><AnalyticsPage /></MemoryRouter>);
  expect(await screen.findByText("You haven’t added a truck yet. Create one in your workspace to get started.")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Export CSV" })).not.toBeInTheDocument();
});

it("retries after an API failure", async () => {
  fetchMock.mockResolvedValueOnce({ ok: false }).mockResolvedValue({ ok: true, json: async () => data });
  render(<MemoryRouter><AnalyticsPage /></MemoryRouter>);
  expect(await screen.findByRole("alert")).toHaveTextContent("couldn’t load");
  fireEvent.click(screen.getByRole("button", { name: "Try again" }));
  await act(async () => {});
  expect(await screen.findByRole("link", { name: "Analytics Tacos" })).toBeInTheDocument();
});


it("redirects anonymous analytics visitors to operator sign in", async () => {
  fetchMock.mockResolvedValue({ ok: false, status: 401 });
  render(<MemoryRouter initialEntries={["/operator/analytics"]}><Routes>
    <Route path="/operator/analytics" element={<AnalyticsPage />} />
    <Route path="/operator/login" element={<p>Sign in first</p>} />
  </Routes></MemoryRouter>);
  expect(await screen.findByText("Sign in first")).toBeInTheDocument();
});

it("filters totals and table to a selected owned truck", async () => {
  fetchMock.mockResolvedValue({ ok: true, json: async () => ({ ...data, trucks: [...data.trucks,
    { ...data.trucks[0], vendorId: 8, name: "Second Truck", menuItemCount: 5 }] }) });
  render(<MemoryRouter><AnalyticsPage /></MemoryRouter>);
  await screen.findByRole("link", { name: "Second Truck" });
  fireEvent.change(screen.getByRole("combobox", { name: "Show truck" }), { target: { value: "8" } });
  expect(screen.queryByRole("link", { name: "Analytics Tacos" })).not.toBeInTheDocument();
  expect(screen.getByText("1 of 5 available")).toBeInTheDocument();
  expect(fetchMock.mock.calls[0][0]).toBe("/api/operator/analytics/trucks");
});
