import { useSyncExternalStore } from 'react';
import { checkoutChangedEvent, checkoutLocked } from './checkoutAttempt';

function subscribe(listener: () => void) {
  window.addEventListener(checkoutChangedEvent, listener);
  return () => window.removeEventListener(checkoutChangedEvent, listener);
}
export function useCheckoutLock() {
  return useSyncExternalStore(subscribe, checkoutLocked);
}
