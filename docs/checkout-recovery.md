# Checkout recovery

## Contract

Before any checkout write, the browser stores an immutable attempt in sessionStorage:
account ID, UUID idempotency key, submitted cart snapshot and selected pickup stop ID.
The request still sends only item IDs/quantities, vendor ID, pickup stop ID and the key.
Prices remain server-calculated. Ownership and active-stop validation are unchanged.

The browser supplies `X-Checkout-Account-Id`. The backend compares it to the authenticated
principal and returns 403 before calling the order service when they differ. This header
is a consistency precondition, not authorization: it cannot select another customer's account.
It is optional for existing API clients; the BiteMap checkout always sends it.

## Outcomes

- Confirmed success: clear the submitted cart before releasing the saved key, then navigate
  to the returned order. An interrupted cleanup remains recoverable with the same key.
- First-attempt definitive 400/401/403/404/409/422/429: release the attempt and show the rejection.
- Lost response, timeout (20 seconds), invalid success response or server failure: preserve
  the attempt and show **Recover order**. A failed retry does not erase an earlier unknown outcome.
- Recovery always resends the original snapshot/key. It does not use newly displayed pickup
  availability. The backend returns an already-created order before validating current availability;
  a genuinely new order still requires an active stop and an accepting truck.

Cart quantities, removal, clearing and menu additions are locked while the attempt is unresolved.
Concurrent clicks in the same tab share one promise. A different account cannot see the saved
snapshot on the cart page or replay it. Return to the original account to recover.
No automatic POST retry occurs.

## Limits and support

Persistence survives refresh and navigation in the same tab. It is not cross-device recovery,
nor durable after clearing browser storage or closing the tab. Independently started checkouts
in other tabs are separate attempts. Do not claim account-wide duplicate suppression.

Unreadable storage or legacy key-only attempts fail closed rather than silently minting a new
key. Check the original customer's order history and resolve with support before clearing such
an attempt. A prior unknown attempt that continues to be rejected also requires investigation;
there is deliberately no unsafe “discard and order again” button.

## Verification

`npm test`, `npm run build`, `npm run test:e2e:typecheck`, `npm run lint` in frontend.
`npm run test:e2e` uses a disposable Docker/PostgreSQL stack, never the development database.
The ordering journey lets a real order commit, drops the response, refreshes the browser,
recovers the same ID, and verifies exactly one order exists. Existing concurrent retry,
ownership, paused ordering and server-price assertions remain.

Backend focused tests: `./mvnw -Dtest=CheckoutAccountBindingTests,OrderErrorTests test`.

Manual: sign in, add items, submit while interrupting the response, verify quantity/remove/clear
are disabled, refresh, then select Recover order. My orders must contain only the original order.
Sign into another account in a second tab and return: the original snapshot must be hidden and
recovery blocked until the original account signs back in.
