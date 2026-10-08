import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, expect, it } from "vitest";
import { addCartItem } from "../features/cart/cart";
import CartPage from "./CartPage";

beforeEach(() => sessionStorage.clear());

it("shows an empty cart with a discovery link", () => {
  render(<MemoryRouter><CartPage /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "Your cart is empty." })).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Find a food truck" })).toHaveAttribute("href", "/trucks");
});

it("reviews items, updates quantity and calculates the total", () => {
  addCartItem(4, "Taco Truck", { id: 8, name: "Taco", price: 4.5 });
  render(<MemoryRouter><CartPage /></MemoryRouter>);
  expect(screen.getByRole("heading", { name: "Taco Truck" })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Quantity for Taco"), { target: { value: "3" } });
  expect(screen.getAllByText("$13.50")).toHaveLength(2);
  expect(screen.getByRole("button", { name: "Customer sign-in is coming next" })).toBeDisabled();
});

it("removes the final item", () => {
  addCartItem(4, "Taco Truck", { id: 8, name: "Taco", price: 4.5 });
  render(<MemoryRouter><CartPage /></MemoryRouter>);
  fireEvent.click(screen.getByRole("button", { name: "Remove Taco" }));
  expect(screen.getByRole("heading", { name: "Your cart is empty." })).toBeInTheDocument();
});
