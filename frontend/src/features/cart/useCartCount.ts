import { useSyncExternalStore } from "react";
import { cartChangedEvent, cartItemCount, readCart } from "./cart";

function subscribe(notify: () => void) {
  window.addEventListener(cartChangedEvent, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(cartChangedEvent, notify);
    window.removeEventListener("storage", notify);
  };
}

export function useCartCount() {
  return useSyncExternalStore(subscribe, () => cartItemCount(readCart()), () => 0);
}
