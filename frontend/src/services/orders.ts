import { AuthApiError, postWithCsrf } from "./auth";
import { reportAuthorizationResponse } from "../auth/authEvents";
import type { Cart } from "../features/cart/cart";
import { completeCartCheckout } from '../features/cart/cart';
import { checkoutLocked, readCheckoutAttempt, saveCheckoutAttempt, finishCheckoutAttempt } from '../features/cart/checkoutAttempt';
import type { CustomerOrder, CustomerOrderSummary, Page, PickupDetails } from "../types/api";

export type { CustomerOrder, PickupDetails } from "../types/api";
export async function getPickupStop(vendorId: number, signal?: AbortSignal): Promise<PickupDetails | null> {
  const response = await fetch(`/api/vendors/${vendorId}/pickup-stop`, {
    cache: 'no-store', credentials: 'same-origin', headers: { Accept: 'application/json' }, signal,
  });
  if (response.status === 204) return null;
  if (!response.ok) {
    reportAuthorizationResponse(response.status);
    throw new AuthApiError(response.status, response.status === 409 ? 'Temporarily not accepting orders.' : 'Unable to load pickup details. Please try again.');
  }
  return response.json();
}

export type CustomerOrderPage = Page<CustomerOrderSummary>;

export async function listCustomerOrders(page: number, signal: AbortSignal): Promise<CustomerOrderPage> {
  const response = await fetch(`/api/customer/orders?page=${page}&size=20`, {
    cache: "no-store", credentials: "same-origin", headers: { Accept: "application/json" }, signal,
  });
  if (!response.ok) {
    reportAuthorizationResponse(response.status);
    throw new AuthApiError(response.status, "Unable to load your orders. Please try again.");
  }
  return response.json();
}

let submission: { accountId: number; promise: Promise<CustomerOrder> } | null = null;

export function createCustomerOrder(cart: Cart, pickupStopId: number, accountId: number): Promise<CustomerOrder> {
  if (submission) return submission.accountId === accountId ? submission.promise
    : Promise.reject(new Error('Sign in with the account that started checkout to recover its order.'));
  const promise = submitOrder(cart, pickupStopId, accountId).finally(() => { submission = null; });
  submission = {accountId, promise};
  return promise;
}

async function submitOrder(cart: Cart, pickupStopId: number, accountId: number): Promise<CustomerOrder> {
  const previous = readCheckoutAttempt();
  if (checkoutLocked() && !previous) throw new Error('Checkout recovery data is unavailable. Check My orders before placing another order; do not clear browser storage.');
  if (!Number.isSafeInteger(accountId) || accountId <= 0 || (previous && previous.accountId !== accountId)) {
    throw new Error('Sign in with the account that started checkout to recover its order.');
  }
  const attempt = previous ?? {accountId, key: crypto.randomUUID(), cart: structuredClone(cart), pickupStopId};
  saveCheckoutAttempt(attempt);
  try {
    const order = await postWithCsrf<CustomerOrder>('/api/customer/orders', {
      vendorId: attempt.cart.vendorId, pickupStopId: attempt.pickupStopId,
      idempotencyKey: attempt.key,
      items: attempt.cart.items.map(item => ({menuItemId:item.id, quantity:item.quantity})),
    }, 'Checkout was rejected. Review your cart before trying again.', {'X-Checkout-Account-Id': String(accountId)}, AbortSignal.timeout(20_000));
    if (!Number.isSafeInteger(order?.id) || order.id <= 0) throw new Error('Invalid order response');
    completeCartCheckout(attempt);
    return order;
  } catch (error) {
    // A rejection of a later retry does not establish what happened to the original request.
    if (!previous && error instanceof AuthApiError && [400,401,403,404,409,422,429].includes(error.status)) {
      finishCheckoutAttempt(attempt);
      throw error;
    }
    throw new Error('We could not confirm your order. It may already be placed. Recover the original order before changing your cart or placing another order.');
  }
}

export async function getCustomerOrder(id: number, signal?: AbortSignal): Promise<CustomerOrder> {
  const response = await fetch(`/api/customer/orders/${id}`, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal,
  });
  if (!response.ok) {
    reportAuthorizationResponse(response.status);
    let detail = "Unable to load the order.";
    try { detail = (await response.json() as { detail?: string }).detail ?? detail; } catch { /* Keep fallback. */ }
    throw new AuthApiError(response.status, detail);
  }
  return response.json();
}
