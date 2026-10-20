# Active-stop pickup ordering — step 1

## Scope and rules

Customers can browse any truck, but new orders require one currently active stop:
`status IN ('scheduled','serving') AND starts_at <= now AND ends_at > now`.
The server's clock is authoritative. This is published schedule information, not
verified live GPS or a guarantee that the operator is physically present.
Zero matches or overlapping legacy matches fail closed. Future preorders and
preparation estimates are not implemented. Serving hours are not ready-time estimates.

## API

- `GET /api/vendors/{vendorId}/pickup-stop`: public, `Cache-Control: no-store`.
  Returns 200 with `stopId`, `venueName`, `address`, latitude/longitude,
  `startsAt`, `endsAt`, `timeZone`; 204 when no single eligible stop exists.
- `POST /api/customer/orders`: now requires integer, nonzero `pickupStopId` in
  addition to vendor, idempotency key and items. Existing session, role and CSRF
  requirements remain. Wrong-truck, inactive, expired, missing or ambiguous stops
  return 409; missing/malformed request IDs return 400.
- Customer and operator order-detail responses include `pickup` with saved
  location fields, or null for historical orders without recorded locations.
  Paginated summaries remain unchanged; pickup is shown in order details.

The client sends only the stop ID, never authoritative pickup addresses or prices.
The server copies pickup fields from the database when creating the order.
Venue name serves as the existing venue/landmark field. Directions use the saved
coordinates in an external Google Maps link; no Maps SDK, API key or GPS sharing
is required. Operators must verify their address and coordinates when publishing.

## Consistency and concurrency

Checkout locks the customer and truck, then menu rows in stable order. It validates
the pickup window after acquiring locks, immediately before insertion. Schedule
writers take an exclusive lock on the same truck. Only one of a racing checkout
and stop cancellation can succeed. Schedule editing/cancellation is blocked while
linked orders are PLACED, ACCEPTED or READY; resolve those orders first.

The idempotency comparison includes pickupStopId. Replays of an already-created
order return the original snapshot even after its stop closes or prices change.
Changing the stop under the same key returns 409. Client retry keys also include
the stop. After an uncertain network failure, check My orders before intentionally
starting a different order/stop; no online payment is processed by this feature.

Snapshots are never updated by schedule changes. They use a historical stop ID,
not a foreign key to the mutable schedule, so retiring schedule data cannot erase
pickup history. There is no public snapshot mutation endpoint. Database/schema
administrators and future direct SQL importers must respect this invariant and
the truck-locking protocol.

## Migration and release

V12 adds `customer_order_pickups` only. No previous migration is modified. Existing
orders are preserved without invented addresses. Back up production and test the
upgrade on staging. Deploy frontend and backend together: old checkout requests
without pickupStopId are intentionally rejected. Reload old browser tabs.

Application Docker/database rebuild is a separate rollout step: do not reset
volumes. Tests use a separate PostgreSQL database. The frontend source mount may
show the new UI before the local backend is rebuilt; in that case pickup lookup
fails closed, rather than permitting an unvalidated order.

## Acceptance checks

1. Active stop: cart shows address, venue, serving hours in the stop's time zone,
   directions, and existing no-online-payment disclosure.
2. No stop, future stop, expired/cancelled stop or lookup failure: checkout disabled,
   cart retained, refresh available. Backend independently rejects forged requests.
3. Order details for customer and correct owner show the same stored location;
   historical orders explicitly say their location was not recorded.
4. Repeated checkout keys return one order, including after stop expiry. Changing
   the stop with the same key conflicts. Client input cannot alter stored location.
5. Try cancellation while an open order exists: 409. Complete/cancel the order,
   then stop cancellation succeeds. Unrelated owners remain blocked.
6. Migration upgrade preserves old rows; concurrent cancellation/checkout cannot
   both succeed; exact start is eligible and exact end is not.

Next: owner-provided preparation estimates, including a closing-time buffer policy.
