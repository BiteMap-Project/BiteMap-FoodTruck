# Pause and resume incoming orders

In the owner workspace, select a truck and open **Orders → Incoming orders**.
Pause blocks new orders, not preparation of existing orders. Resume still requires
one currently active pickup stop and orderable menu items. This setting persists
across server restarts and does not automatically reset at the next stop.

## API

`GET /api/operator/vendors/{id}/ordering` returns
`{"acceptingOrders":true,"version":0}` with `Cache-Control: no-store`.

`PUT /api/operator/vendors/{id}/ordering` accepts the same shape with the desired
boolean and the version last read. It requires an enabled owning operator session
and CSRF. Foreign/missing trucks return 404; stale versions return 409. Missing,
null, non-boolean flags and non-integer/negative versions return 400. The response
contains the persisted state and new version. Refresh after an uncertain write;
the frontend never automatically retries it.

`GET /api/vendors/{id}/pickup-stop` returns 409 with the safe detail
"Temporarily not accepting orders." while paused. The cart displays this message,
disables checkout, and preserves items. Refresh pickup details to check again;
paused carts also recheck after 30 seconds.

New checkout requests receive 409 while paused. Existing idempotent requests are
resolved before availability checks, so a lost response can be recovered without
creating another order. Reusing a key with different order details still conflicts.

## Concurrency and migration

V14 adds `accepting_orders` (default true, preserving existing behavior) and
`ordering_version` (default zero). Checkout locks the vendor FOR SHARE; pause/resume
locks it FOR UPDATE. If checkout acquires its lock first, that order may commit and
then pause completes. If pause acquires its lock first and commits, checkout rejects.
No pause operation deletes, cancels, or changes existing orders or stops.

Tests cover API authorization, CSRF, validation, stale writes, idempotent retries,
resume without an active stop, migration preservation, and both lock orderings.
The real-browser ordering journey pauses through the owner UI, verifies customer
checkout is disabled, rejects a direct new order, replays an existing order,
completes that order while paused, and resumes ordering.

Application data is not used for these tests: run `npm run test:e2e` in frontend
for the isolated browser/PostgreSQL scenario.
