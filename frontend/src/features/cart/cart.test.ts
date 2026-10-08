import { beforeEach, expect, it } from "vitest";
import { addCartItem, cartItemCount, cartTotal, clearCart, readCart, setCartQuantity } from "./cart";

beforeEach(() => sessionStorage.clear());

it("stores quantities and totals for one truck", () => {
  addCartItem(4, "Taco Truck", { id: 8, name: "Taco", price: 4.5 });
  const cart = addCartItem(4, "Taco Truck", { id: 8, name: "Taco", price: 4.5 });
  expect(cartItemCount(cart)).toBe(2);
  expect(cartTotal(cart)).toBe(9);
  expect(readCart()).toEqual(cart);
});

it("rejects items from a second truck", () => {
  addCartItem(4, "Taco Truck", { id: 8, name: "Taco", price: 4.5 });
  expect(addCartItem(5, "Burger Truck", { id: 9, name: "Burger", price: 8 })).toBeNull();
  expect(readCart()?.vendorName).toBe("Taco Truck");
});

it("updates, removes and clears items", () => {
  addCartItem(4, "Taco Truck", { id: 8, name: "Taco", price: 4.5 });
  expect(setCartQuantity(8, 3)?.items[0].quantity).toBe(3);
  expect(setCartQuantity(8, 0)).toBeNull();
  addCartItem(4, "Taco Truck", { id: 8, name: "Taco", price: 4.5 });
  clearCart();
  expect(readCart()).toBeNull();
});
