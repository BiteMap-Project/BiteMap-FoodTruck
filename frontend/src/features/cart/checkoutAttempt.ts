import type { Cart } from './cart';

const key = 'bitemap.checkout-attempt.v1';
const legacyKey = 'bitemap.pending-order-key';
export const checkoutChangedEvent = 'bitemap-checkout-changed';
export type CheckoutAttempt = {
  accountId: number;
  key: string;
  cart: Cart;
  pickupStopId: number;
};

// Never silently replace an unreadable attempt: it might already have committed.
export function checkoutLocked(): boolean {
  try { return sessionStorage.getItem(key) !== null || sessionStorage.getItem(legacyKey) !== null; }
  catch { return true; }
}

export function readCheckoutAttempt(): CheckoutAttempt | null {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw) as CheckoutAttempt;
    if (!Number.isSafeInteger(value.accountId) || value.accountId <= 0
      || typeof value.key !== 'string' || !/^[0-9a-f-]{36}$/i.test(value.key)
      || !Number.isSafeInteger(value.pickupStopId) || value.pickupStopId === 0
      || !Number.isSafeInteger(value.cart?.vendorId) || value.cart.vendorId === 0
      || typeof value.cart.vendorName !== 'string' || !Array.isArray(value.cart.items)
      || value.cart.items.length < 1 || value.cart.items.length > 50
      || value.cart.items.some(item => !Number.isSafeInteger(item.id) || item.id === 0
        || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 10
        || typeof item.name !== 'string' || !Number.isFinite(item.price))) return null;
    return value;
  } catch { return null; }
}

export function saveCheckoutAttempt(attempt: CheckoutAttempt) {
  // Persist before sending anything. Storage failure must prevent submission.
  sessionStorage.setItem(key, JSON.stringify(attempt));
  window.dispatchEvent(new Event(checkoutChangedEvent));
}

export function finishCheckoutAttempt(attempt: CheckoutAttempt) {
  if (readCheckoutAttempt()?.key !== attempt.key) return;
  sessionStorage.removeItem(key);
  window.dispatchEvent(new Event(checkoutChangedEvent));
}
