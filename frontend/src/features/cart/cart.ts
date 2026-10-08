export type CartItem = {
  id: number;
  name: string;
  price: number;
  quantity: number;
};

export type Cart = {
  vendorId: number;
  vendorName: string;
  items: CartItem[];
};

const storageKey = "bitemap.customer-cart";
export const cartChangedEvent = "bitemap-cart-changed";

export function readCart(): Cart | null {
  try {
    const saved = sessionStorage.getItem(storageKey);
    if (!saved) return null;
    const cart = JSON.parse(saved) as Cart;
    if (!Number.isInteger(cart.vendorId) || !cart.vendorName || !Array.isArray(cart.items)) return null;
    return cart;
  } catch {
    return null;
  }
}

function saveCart(cart: Cart | null) {
  if (cart?.items.length) sessionStorage.setItem(storageKey, JSON.stringify(cart));
  else sessionStorage.removeItem(storageKey);
  window.dispatchEvent(new Event(cartChangedEvent));
}

export function addCartItem(vendorId: number, vendorName: string, item: Omit<CartItem, "quantity">): Cart | null {
  const current = readCart();
  if (current && current.vendorId !== vendorId) return null;

  const cart = current ?? { vendorId, vendorName, items: [] };
  const existing = cart.items.find((saved) => saved.id === item.id);
  const items = existing
    ? cart.items.map((saved) => saved.id === item.id ? { ...saved, quantity: saved.quantity + 1 } : saved)
    : [...cart.items, { ...item, quantity: 1 }];
  const next = { ...cart, items };
  saveCart(next);
  return next;
}

export function setCartQuantity(itemId: number, quantity: number): Cart | null {
  const current = readCart();
  if (!current) return null;
  const items = quantity <= 0
    ? current.items.filter((item) => item.id !== itemId)
    : current.items.map((item) => item.id === itemId ? { ...item, quantity } : item);
  const next = items.length ? { ...current, items } : null;
  saveCart(next);
  return next;
}

export function clearCart() {
  saveCart(null);
}

export function cartItemCount(cart: Cart | null) {
  return cart?.items.reduce((total, item) => total + item.quantity, 0) ?? 0;
}

export function cartTotal(cart: Cart | null) {
  return cart?.items.reduce((total, item) => total + item.price * item.quantity, 0) ?? 0;
}
