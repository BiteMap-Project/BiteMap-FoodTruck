import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes, Link } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import App from "../App";
import TruckMenuPage from "./TruckMenuPage";

const truck = {
  id: -2, name: "Database Taco", category: "Tacos", location: "Northridge",
  menu: [{ id: 40, name: "Veggie Taco", description: "Beans and salsa", price: 4.5, available: false }],
};
const fetchMock = vi.fn();
const response = (body: unknown, status = 200) => ({ ok: status === 200, status, json: async () => body });
const open = (id = "-2") => render(<MemoryRouter initialEntries={[`/trucks/${id}`]}><App /></MemoryRouter>);

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

it("loads a direct URL with matching details, USD prices and unavailable items", async () => {
  fetchMock.mockResolvedValue(response(truck));
  open();
  expect(screen.getByRole("status")).toHaveTextContent("Loading truck");
  expect(await screen.findByRole("heading", { name: truck.name })).toBeInTheDocument();
  expect(fetchMock.mock.calls[0][0]).toBe("/api/vendors/-2");
  expect(screen.getByText("Location: Northridge")).toBeInTheDocument();
  expect(screen.getByText("Veggie Taco")).toBeInTheDocument();
  expect(screen.getByText("$4.50")).toBeInTheDocument();
  expect(screen.getByText("Currently unavailable")).toBeInTheDocument();
  expect(screen.queryByText(/Open until|Demo menu/)).not.toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Back to trucks/ })).toHaveAttribute("href", "/");
});

it("shows an empty menu for a valid truck", async () => {
  fetchMock.mockResolvedValue(response({ ...truck, menu: [] }));
  open();
  expect(await screen.findByText("No menu available yet.")).toBeInTheDocument();
  expect(screen.getByText(/hasn.t posted its menu/)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: truck.name })).toBeInTheDocument();
});

it.each([404, 400])("shows a return link for a missing or malformed truck (%s)", async (status) => {
  fetchMock.mockResolvedValue(response({}, status));
  open(status === 400 ? "invalid" : "999");
  expect(await screen.findByText("Truck not found.")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: /Back to trucks/ })).toHaveAttribute("href", "/");
});

it.each(["http", "network"])("recovers from a %s failure with Retry", async (kind) => {
  if (kind === "http") fetchMock.mockResolvedValueOnce(response({}, 503));
  else fetchMock.mockRejectedValueOnce(new Error("offline"));
  fetchMock.mockResolvedValue(response(truck));
  open();
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load this truck");
  fireEvent.click(screen.getByRole("button", { name: "Retry" }));
  expect(await screen.findByRole("heading", { name: truck.name })).toBeInTheDocument();
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
});

it("ignores a late response from a previous truck", async () => {
  let resolveOld!: (value: ReturnType<typeof response>) => void;
  fetchMock.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }))
    .mockResolvedValue(response({ ...truck, id: 22, name: "Second Truck" }));
  render(<MemoryRouter initialEntries={["/trucks/11"]}>
    <Link to="/trucks/22">Next truck</Link>
    <Routes><Route path="/trucks/:id" element={<TruckMenuPage />} /></Routes>
  </MemoryRouter>);
  const oldSignal = fetchMock.mock.calls[0][1].signal;
  fireEvent.click(screen.getByRole("link", { name: "Next truck" }));
  expect(await screen.findByRole("heading", { name: "Second Truck" })).toBeInTheDocument();
  expect(oldSignal.aborted).toBe(true);
  await act(async () => resolveOld(response(truck)));
  expect(screen.queryByRole("heading", { name: truck.name })).not.toBeInTheDocument();
});

it("navigates from a database discovery card to its profile and back", async () => {
  fetchMock.mockImplementation((url: string) => Promise.resolve(response(url.startsWith("/api/vendors?")
    ? { items: [truck], totalElements: 1, totalPages: 1, page: 0, size: 20 } : truck)));
  render(<MemoryRouter><App /></MemoryRouter>);
  fireEvent.click(await screen.findByRole("link", { name: "View Profile & Menu" }));
  expect(await screen.findByText("Veggie Taco")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("link", { name: /Back to trucks/ }));
  expect(await screen.findByRole("searchbox")).toBeInTheDocument();
});
