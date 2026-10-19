import { AuthApiError, postWithCsrf } from "./auth";
import type { Cart } from "../features/cart/cart";
import type { CustomerOrder, CustomerOrderSummary, Page } from "../types/api";

export type { CustomerOrder } from "../types/api";

const keyStorage = "bitemap.pending-order-key";

export type CustomerOrderPage = Page<CustomerOrderSummary>;

export async function listCustomerOrders(page: number, signal: AbortSignal): Promise<CustomerOrderPage> {
  const response = await fetch(`/api/customer/orders?page=${page}&size=20`, {
    cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" }, signal,
  });
  if (!response.ok) throw new AuthApiError(response.status, "Unable to load your orders. Please try again.");
  return response.json();
}

function idempotencyKey(cart: Cart) {
  const signature = JSON.stringify({ vendorId: cart.vendorId, items: cart.items.map(({ id, quantity }) => ({ id, quantity })) });
  try {
    const saved = JSON.parse(sessionStorage.getItem(keyStorage) ?? "null") as { signature?: string; key?: string } | null;
    if (saved?.signature === signature && saved.key) return saved.key;
  } catch { /* Replace an invalid local value. */ }
  const key = crypto.randomUUID();
  sessionStorage.setItem(keyStorage, JSON.stringify({ signature, key }));
  return key;
}

export async function createCustomerOrder(cart: Cart): Promise<CustomerOrder> {
  const order = await postWithCsrf<CustomerOrder>("/api/customer/orders", {
    vendorId: cart.vendorId,
    idempotencyKey: idempotencyKey(cart),
    items: cart.items.map((item) => ({ menuItemId: item.id, quantity: item.quantity })),
  }, "Unable to place the order. Please try again.");
  sessionStorage.removeItem(keyStorage);
  return order;
}

export async function getCustomerOrder(id: number, signal?: AbortSignal): Promise<CustomerOrder> {
  const response = await fetch(`/api/customer/orders/${id}`, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    let detail = "Unable to load the order.";
    try { detail = (await response.json() as { detail?: string }).detail ?? detail; } catch { /* Keep fallback. */ }
    throw new AuthApiError(response.status, detail);
  }
  return response.json();
}
