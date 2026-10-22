# URL-based navigation

Page-level destinations belong in React Router URLs, not component state.
Keep drafts, dialogs, pending requests, and credentials out of URLs. Existing
customer account, cart, favorites, order confirmation, onboarding, and admin
pages retain their routes. The standalone HTML dashboard is a design prototype,
not the connected application.

## Routes

- `/operator` and legacy `/owner`: owner overview / initial truck selection.
- `/operator/vendors/:vendorId/overview`
- `/operator/vendors/:vendorId/menu`
- `/operator/vendors/:vendorId/schedule`
- `/operator/vendors/:vendorId/details`
- `/operator/vendors/:vendorId/orders`
- `/operator/vendors/:vendorId/orders?order=42&status=ACCEPTED&page=0`:
  selected order, queue status, and zero-based queue page.
- `/operator/analytics?truck=7`: analytics truck selection.
- `/trucks`: discovery; `/` remains a compatible entry point.
- `/stops`: upcoming stops discovery.

Owner routes retain RequireOperator. Truck IDs are resolved against paginated
owned-vendor results, including trucks beyond the first page. An inaccessible
truck is not replaced with another truck. Every management API still enforces
ownership independently; URL parameters are not authorization.

The customer-menu preview's owner-only return affordance still uses validated
history state, but its destination is now the canonical truck/section URL.
Legacy workspace restore state remains supported. Operator login returns to a
validated workspace destination after authentication.

## Verification

Open Schedule, refresh, then open Menu and use browser Back/Forward. Confirm
the same truck remains selected. Paste a workspace URL into a fresh signed-in
tab. Verify an unrelated truck is unavailable, and a signed-out visitor must
sign in. Open an order and refresh: the same order should reopen. Repeat the
refresh/Back checks on `/stops`.

Production hosting must serve the SPA entry HTML for frontend paths (including
direct deep links), while routing `/api/*` to the backend and keeping asset
404s intact. Vite development provides this fallback; deployment must configure
it independently. No hosting configuration is assumed by this change.

This migration covers page-level navigation. Unsaved-form exit warnings and
persisting every list/search filter are separate enhancements, not implemented
here. No session or CSRF tokens are stored in URLs.
