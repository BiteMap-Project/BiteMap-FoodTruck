import { act, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../../auth/authState";
import CustomerLayout from "./CustomerLayout";
import { addCartItem, readCart, setCartQuantity } from "../cart/cart";
import { readCheckoutAttempt, saveCheckoutAttempt } from "../cart/checkoutAttempt";

const customer = { id: 7, displayName: "Customer A", email: "a@example.test", roles: ["ROLE_CUSTOMER"] };
const auth = { account: customer, status: "ready", error: "", refreshAccount: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), activateOperator: vi.fn(), updateProfile: vi.fn() } as AuthContextValue;
const paths = ["/cart", "/orders", "/orders/12/confirmation", "/favorites", "/account", "/trucks/2"];
function show(path: string, value = auth) {
  return render(<AuthContext.Provider value={value}><MemoryRouter initialEntries={[path]}><Routes><Route element={<CustomerLayout />}>
    {paths.map(url => <Route key={url} path={url} element={<h1>{url}</h1>} />)}
  </Route></Routes></MemoryRouter></AuthContext.Provider>);
}
beforeEach(() => { sessionStorage.clear(); });
it.each(paths)("keeps customer navigation accessible on %s", path => {
  show(path);
  for (const name of ["My cart", "My orders", "Favorites", "Account settings"]) expect(screen.getByRole("link", { name })).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Access your truck/ })).not.toBeInTheDocument();
  const active = path.includes("/orders") ? "My orders" : path === "/cart" ? "My cart" : path === "/favorites" ? "Favorites" : path === "/account" ? "Account settings" : "Discover trucks";
  expect(screen.getByRole("link", { name: active })).toHaveAttribute("aria-current", "page");
});
it("updates the quantity badge from the existing store without changing cart contents", () => {
  addCartItem(2, "Truck", { id: 3, name: "Taco", price: 4 });
  show("/orders");
  expect(screen.getByRole("link", { name: "My cart, 1 items" })).toBeInTheDocument();
  act(() => { setCartQuantity(3, 3); });
  expect(screen.getByRole("link", { name: "My cart, 3 items" })).toBeInTheDocument();
  expect(readCart()?.items[0].quantity).toBe(3);
});
it("preserves the cart snapshot and unresolved checkout key across navigation", () => {
  addCartItem(2, "Truck", { id: 3, name: "Taco", price: 4 });
  const attempt = { accountId: 7, key: crypto.randomUUID(), pickupStopId: 4, cart: readCart()! };
  saveCheckoutAttempt(attempt);
  show("/cart");
  fireEvent.click(screen.getByRole("link", { name: "My orders" }));
  fireEvent.click(screen.getByRole("link", { name: "My cart" }));
  expect(readCheckoutAttempt()).toEqual(attempt);
  expect(readCart()).toEqual(attempt.cart);
});
it("uses backend roles to expose the owner workspace", () => {
  show("/cart", { ...auth, account: { ...customer, roles: ["ROLE_CUSTOMER", "ROLE_OPERATOR"] } });
  expect(screen.getByRole("link", { name: /Access your truck/ })).toHaveAttribute("href", "/operator");
});
