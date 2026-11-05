# Closing-time policy and pickup-pin confirmation

## Ordering cutoff

Each truck defaults to closing new orders **15 minutes before its active stop ends**.
Owners can set a whole number from **0 to 120 minutes** in Orders → Incoming orders.
Zero permits ordering until the stop ends, not after it. A stop shorter than its cutoff
will never accept orders. Pausing, menu availability, ownership and active-stop rules still apply.

`GET /api/operator/vendors/{id}/ordering` returns `acceptingOrders`, `version`, `cutoffMinutes`.
`PUT` accepts the same fields with fresh CSRF and optimistic version checking.
Omitting `cutoffMinutes` preserves its current value for older pause/resume clients.
The database also enforces the range. The update holds an exclusive vendor lock;
checkout holds a shared vendor lock, so the first transaction determines the result.

At `now >= stop.endsAt - cutoffMinutes`, pickup availability and new checkout return
409 with an explanatory message. Existing idempotency keys resolve **before** this
new-order check; retries still recover the original order. Customer carts are retained.

Ready estimates cannot exceed an order's saved pickup closing instant. Equality is
allowed, and the existing 1-minute minimum/24-hour maximum still applies. Estimates
for historical orders with no pickup snapshot retain the old bounds; no location or
closing time is fabricated. Existing orders can still be accepted, completed or cancelled
under their existing rules even after closing.

## Pin confirmation

Creating, editing or repeating a stop requires literal JSON `locationConfirmed: true`.
Omitted, false, string or numeric values are rejected. Ownership, CSRF, overlap,
coordinates, time zones, open-order and stale-version rules are unchanged.

The form previews the selected address on a map. Owners can click to adjust the pin
or edit coordinates using the keyboard. Changing the address or coordinates clears
confirmation. Editing and “Schedule again” start unconfirmed. A repeated series uses
the explicitly confirmed location for all occurrences.

If tiles or configuration are unavailable, an external Google Maps link provides an
alternate preview; coordinates remain visible and confirmation is still required.
Google receives the public pickup coordinates when the owner follows that link.
Geoapify receives tile requests when the embedded preview loads. No customer GPS is used.

The server records `vendor_stops.location_confirmed_at` when publishing/updating.
Legacy/imported stops remain NULL. This is an **owner attestation**, not proof of GPS
presence or automated address verification; a client can attest without viewing a map.

## Deployment and checks

Deploy frontend and backend together: older schedule clients lack the required field.
Flyway V20 adds cutoff settings; V21 adds the nullable attestation timestamp. Do not
edit previously applied migrations. No new map dependency or storage provider is needed.

Use disposable PostgreSQL for backend tests and `npm run test:e2e` for the isolated
browser stack. Test exact cutoff, zero cutoff, stale settings, ownership, concurrent
checkout/settings changes, retries, closing-bound estimates, missing confirmation,
coordinate reset, copied stops and keyboard/mobile publishing.
