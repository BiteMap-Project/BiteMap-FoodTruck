import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { addCartItem } from "../features/cart/cart";
import CartPage from "./CartPage";

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
  fireEvent.change(screen.getByLabelText("Quantity for Taco"), { target: { value: "3" } });
  expect(screen.getAllByText("$13.50")).toHaveLength(2);
  expect(await screen.findByRole("link", { name: "Sign in to continue" })).toHaveAttribute("href", "/customer/login");
});

it("recognizes a signed-in customer without changing the cart", async () => {
  addCartItem(4, "Taco Truck", { id: 8, name: "Taco", price: 4.5 });
  fetchMock.mockResolvedValue(response(200, {
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
  fireEvent.click(screen.getByRole("button", { name: "Remove Taco" }));
  expect(screen.getByRole("heading", { name: "Your cart is empty." })).toBeInTheDocument();
});
