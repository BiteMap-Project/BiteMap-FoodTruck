import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import CustomerOrdersPage from "./CustomerOrdersPage";
const fetchMock = vi.fn();
beforeEach(() => { vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset(); });
afterEach(() => vi.unstubAllGlobals());
const reply = (body: unknown, status = 200) => ({ ok: status === 200, status, json: async () => body });
const item = { id: 42, vendorId: 7, vendorName: "Spicy Food", status: "READY", total: 8.5, createdAt: "2026-10-15T18:00:00Z" };
const show = () => render(<MemoryRouter><CustomerOrdersPage /></MemoryRouter>);
it("reopens a saved order and loads the next page from the backend", async () => {
  fetchMock.mockResolvedValueOnce(reply({ items: [item], page: 0, totalPages: 2 }));
  show();
  expect(await screen.findByRole("link", { name: /View order #42/ })).toHaveAttribute("href", "/orders/42/confirmation");
  expect(screen.getByText("Ready for pickup")).toBeInTheDocument();
  fetchMock.mockResolvedValueOnce(reply({ items: [{ ...item, id: 41, status: "COMPLETED" }], page: 1, totalPages: 2 }));
  fireEvent.click(screen.getByRole("button", { name: "Older orders" }));
  expect(await screen.findByRole("link", { name: /View order #41/ })).toBeInTheDocument();
  expect(fetchMock.mock.calls[1][0]).toBe("/api/customer/orders?page=1&size=20");
});
it("shows an empty state", async () => {
  fetchMock.mockResolvedValue(reply({ items: [], page: 0, totalPages: 0 })); show();
  expect(await screen.findByText("No orders yet.")).toBeInTheDocument();
});
it("offers sign in when the session expires", async () => {
  fetchMock.mockResolvedValue(reply({}, 401)); show();
  expect(await screen.findByRole("link", { name: "Customer sign in" })).toHaveAttribute("href", "/customer/login");
});
it("clears private results on a failed refresh and allows retry", async () => {
  fetchMock.mockResolvedValueOnce(reply({ items: [item], page: 0, totalPages: 1 })); show();
  await screen.findByText("Spicy Food");
  fetchMock.mockResolvedValue(reply({}, 403));
  fireEvent.click(screen.getByRole("button", { name: "Refresh orders" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Unable to load your orders");
  expect(screen.queryByText("Spicy Food")).not.toBeInTheDocument();
});
