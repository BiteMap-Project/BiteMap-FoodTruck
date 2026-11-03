# Customer order session privacy

Customer order history (`/orders`) and order details
(`/orders/:id/confirmation`) use the shared `RequireAccount` route guard.
The guard waits for session verification and keys its children by account ID.
An account switch therefore unmounts the previous customer's page, clears its
private results, aborts outstanding reads and cancels polling. Completed orders
receive the same protection without restarting status polling.

The existing authentication provider rechecks the session on window focus.
Once it recognizes a signed-out session, changed account, or verification error,
the old order page is no longer rendered. This does not promise instantaneous
cross-tab invalidation while an inactive tab has not yet checked its session.
Backend ownership checks remain authoritative; the route guard is additional
browser privacy protection, not a replacement for API authorization.

## Regression coverage

- `frontend/src/pages/CustomerOrderPrivacy.test.tsx` exercises the real application
  routes and authentication provider: account switching, session expiration,
  completed orders, failed session verification, aborted reads, late success and
  failure, and no order requests before session verification.
- `frontend/e2e/ordering.spec.ts` includes two customer accounts and two tabs in
  one browser context using real session cookies and a disposable PostgreSQL
  fixture. The second customer cannot retrieve the first customer's order (404).

Run frontend tests with `npm test` from `frontend/`. Run the real-browser suite
with `npm run test:e2e`; its runner creates and removes a separate disposable
Compose stack and must never be pointed at the application database.

## Manual verification

1. Sign in as customer A and open My orders in tab one.
2. In a second tab on the same origin, sign out and sign in as customer B.
3. Return to tab one. After the session check, A's orders must disappear and B's
   history (or its empty state) must load.
4. Repeat with A's completed order open in tab one. B must see an unavailable
   order message, never A's details.
5. Repeat with logout only. Tab one must redirect to customer sign-in after the
   session check. Signing in returns to the originally requested order route.
6. Verify a slow or failed session check cannot restore old data after it has
   been cleared. The automated tests also hold order reads across these changes
   and deliver late responses to check cleanup deterministically.

No backend endpoints, migrations, checkout behavior or order-status rules change.
