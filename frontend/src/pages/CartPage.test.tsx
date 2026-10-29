import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { addCartItem } from "../features/cart/cart";
import CartPage from "./CartPage";
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
  fetchMock.mockResolvedValue(response(401));
  vi.stubGlobal("fetch", fetchMock);
});

it("shows an empty cart with a discovery link", () => {
  render(<MemoryRouter><CartPage /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "Your cart is empty." })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Find a food truck" })).toHaveAttribute("href", "/trucks");
});

it("reviews items, updates quantity and calculates the total", async () => {
  addCartItem(4, "Taco Truck", { id: 8, name: "Taco", price: 4.5 });
  render(<MemoryRouter><CartPage /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "Taco Truck" })).toBeInTheDocument();
  expect(screen.getByText("Your order total is calculated using current menu prices when you place your order. No online payment is collected here.")).toBeInTheDocument();
  expect(screen.queryByText(/when ordering is connected/i)).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Quantity for Taco"), { target: { value: "3" } });
  expect(screen.getAllByText("$13.50")).toHaveLength(2);
  expect(await screen.findByRole("link", { name: "Sign in to continue" })).toHaveAttribute("href", "/customer/login");
});

it("recognizes a signed-in customer without changing the cart", async () => {
  addCartItem(4, "Taco Truck", { id: 8, name: "Taco", price: 4.5 });
  fetchMock.mockImplementation(async (url: string) => url.endsWith('/pickup-stop') ? response(200, {
    stopId: 9, venueName: 'Campus', address: '18111 Nordhoff St', latitude: 34.24, longitude: -118.53,
    startsAt: '2026-01-01T00:00:00Z', endsAt: '2099-01-01T00:00:00Z', timeZone: 'America/Los_Angeles',
  }) : response(200, {
    id: 7,
    displayName: "Casey",
    email: "casey@example.com",
    roles: ["ROLE_CUSTOMER"],
  }));

  render(<MemoryRouter><CartPage /></MemoryRouter>);

  expect(await screen.findByText("Signed in as Casey")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Place pickup order" })).toBeEnabled();
  expect(screen.getByRole("heading", { name: "Taco Truck" })).toBeInTheDocument();
});

it("removes the final item", () => {
  addCartItem(4, "Taco Truck", { id: 8, name: "Taco", price: 4.5 });
  render(<MemoryRouter><CartPage /></MemoryRouter>);
  const remove = screen.getByRole("button", { name: "Remove Taco" });
  expect(remove).toHaveTextContent(/^$/);
  expect(remove.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  fireEvent.click(remove);
  expect(screen.getByRole("heading", { name: "Your cart is empty." })).toBeInTheDocument();
});
