import { AuthApiError, postWithCsrf } from "./auth";
import type { Cart } from "../features/cart/cart";

export type CustomerOrder = {
  id: number;
  vendorId: number;
  vendorName: string;
  status: string;
  total: number;
  createdAt: string;
  items: Array<{ menuItemId: number; name: string; unitPrice: number; quantity: number; lineTotal: number }>;
};

const keyStorage = "bitemap.pending-order-key";

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
