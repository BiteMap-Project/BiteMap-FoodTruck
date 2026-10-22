import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { addCartItem, readCart } from "../features/cart/cart";
import CartPage from "./CartPage";
import OrderConfirmationPage from "./OrderConfirmationPage";
import AuthTestHarness from "../test/AuthTestHarness";
const render = (ui: ReactElement) => rtlRender(<AuthTestHarness>{ui}</AuthTestHarness>);

const fetchMock = vi.fn();
const response = (status: number, body?: unknown) => ({
  ok: status >= 200 && status < 300,
  status,
  json: vi.fn(async () => body),
}) as unknown as Response;

beforeEach(() => {
  sessionStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

it("submits the signed-in cart and shows a reloadable confirmation", async () => {
  addCartItem(4, "Taco Truck", { id: 8, name: "Taco", price: 4.5 });
  const order = {
    id: 42,
    vendorId: 4,
    vendorName: "Taco Truck",
    status: "PLACED",
    total: 4.5,
    createdAt: "2026-10-10T12:00:00Z",
    items: [{ menuItemId: 8, name: "Taco", unitPrice: 4.5, quantity: 1, lineTotal: 4.5 }],
  };
  fetchMock.mockImplementation(async (url: string) => {
    if (url === '/api/vendors/4/pickup-stop') return response(200, {
      stopId: 9, venueName: 'Campus', address: '18111 Nordhoff St', latitude: 34.24, longitude: -118.53,
      startsAt: '2026-01-01T00:00:00Z', endsAt: '2099-01-01T00:00:00Z', timeZone: 'America/Los_Angeles',
    });
    if (url === "/api/auth/me") return response(200, { id: 7, displayName: "Casey", email: "casey@example.com", roles: ["ROLE_CUSTOMER"] });
    if (url === "/api/auth/csrf") return response(200, { headerName: "X-CSRF-TOKEN", token: "token" });
    if (url === "/api/customer/orders") return response(201, order);
    if (url === "/api/customer/orders/42") return response(200, order);
    return response(500);
  });

  render(<MemoryRouter initialEntries={["/cart"]}><Routes>
    <Route path="/cart" element={<CartPage />} />
    <Route path="/orders/:id/confirmation" element={<OrderConfirmationPage />} />
  </Routes></MemoryRouter>);

  fireEvent.click(await screen.findByRole("button", { name: "Place pickup order" }));

  expect(await screen.findByRole("heading", { name: "Thanks, your pickup order is in." })).toBeInTheDocument();
  expect(screen.getByText("Order #42 · Taco Truck")).toBeInTheDocument();
  expect(screen.getAllByText("$4.50")).toHaveLength(2);
  expect(readCart()).toBeNull();
  expect(fetchMock).toHaveBeenCalledWith("/api/customer/orders", expect.objectContaining({ method: "POST" }));
  const posted = JSON.parse(fetchMock.mock.calls.find(([url]) => url === '/api/customer/orders')![1].body);
  expect(posted.pickupStopId).toBe(9);
  expect(posted).not.toHaveProperty('pickup');
  expect(fetchMock).toHaveBeenCalledWith("/api/customer/orders/42", expect.objectContaining({ credentials: "same-origin" }));
});
