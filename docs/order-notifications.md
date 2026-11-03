# Live order notifications (SSE)

## Product behavior

- The selected truck's workspace shows a badge with the current number of PLACED
  orders awaiting acceptance, including orders that were present when the page opened.
- Sound is off by default. **Enable order sound** previews a quiet chime and enables
  it for this workspace session. Disable, logout or leaving the workspace stops it.
- Initial queue loading is silent. New committed orders trigger one chime per
  observed batch; repeated snapshots, reconnect replays and cancellation do not.
  Each open workspace has its own sound preference/deduplication state. This is not
  a cross-device notification or exactly-once sound guarantee; use one audible
  workspace per operator station to avoid sounds from multiple tabs/windows.
- Switching trucks closes the old stream and shows the new truck's badge. Counts
  are scoped by authenticated account and truck; sound cursors survive switching
  within the workspace, with at most 100 recent truck cursors held in memory.
- Hidden tabs pause connections. Returning/reconnecting always refreshes data.
  Offline/stale indicators appear after an error or 15 seconds without a heartbeat.
- The owner queue retains 30-second polling as fallback; customer active-order
  tracking retains 10-second polling. Completed/cancelled customer orders stop streaming.
  These are near-live updates (normally within about 3 seconds), not a delivery SLA.

## API

`GET /api/operator/vendors/{vendorId}/order-events` — OPERATOR session, owned truck.

`GET /api/customer/orders/{orderId}/events` — CUSTOMER session, own order.

Both return `text/event-stream`, `Cache-Control: no-store`, `X-Accel-Buffering: no`.
They use same-origin HttpOnly session cookies; no access tokens or session IDs in URLs.
No CSRF exemption was added. All mutations remain existing CSRF-protected HTTP requests.

Named `orders` event payload:
```json
{"revision":"12","createdCount":7,"placedCount":2}
```
The revision is a string to avoid truncating PostgreSQL bigint values. For customer
streams it is the order version and both counts are zero. Events carry no names,
addresses, items, prices or customer identities. Clients fetch the authorized REST
resource when the revision changes. Every first snapshot after reconnect triggers
a fetch even if its revision matches the previous connection.

Missing/foreign resources return 404 before streaming. Missing/wrong session roles
return 401/403. At capacity, admission returns 429. A midstream access revocation
emits `access-ended` without private data and closes the connection; the frontend
refreshes shared authentication state. Network/DB errors close the stream and the
browser retries with capped exponential backoff/jitter. No order write is retried.

## Commit and recovery model

Flyway V19 creates `vendor_order_signals` and an order-table trigger. Insert/update/
delete changes the signal inside the same database transaction as the order, so
rollback cannot publish a phantom change. Existing orders are backfilled. Only
inserts increment `created_count`; changes to status/version update the revision
and PLACED count. Rows are keyed by truck and reads do not scan the order history.

Each SSE connection reads committed state in a short transaction every 3 seconds.
It holds no JDBC connection between ticks. This intentionally uses bounded DB
sampling, not LISTEN/NOTIFY, an in-memory-only event bus, or an unbounded event log.
Signals survive restart; reconnect reconciles current state rather than replaying
every historical transition. All backend instances can observe the same committed
signals. Account enablement, credential version, role/profile and resource ownership
are checked on every snapshot; the original HTTP session is also rechecked.

Streams rotate after 60 seconds through normal HTTP authentication. Defaults:
`bitemap.order-events.tick-ms=3000`, `max-connections=200`, `max-per-user=6`.
Limits are **per backend instance**, not a global distributed quota. Writes use
bounded-admission virtual-thread workers, one in-flight tick per connection and a
global worker semaphore so a slow client cannot create unlimited sender threads.

## Deployment requirements

Disable proxy buffering/cache for these endpoints; allow streaming and idle timeout
greater than the heartbeat interval. Keep frontend/API on the same origin with HTTPS
and secure cookies. The existing application uses servlet sessions: multiple instances
still require sticky routing or shared sessions. SSE does not solve that requirement.
Load-test connection/DB capacity and inspect reconnect/error rates before launch;
200 is a safety limit, not a measured capacity guarantee. No Redis/broker is required
for this implementation. For larger scale, a durable outbox/broker can replace DB
sampling without changing the REST mutation contract or client reconciliation rules.

## Verification

- `OrderNotificationTests`: commit/rollback signals, counts, ownership, credential
  changes, role revocation and private initial snapshots.
- `OrderStreamSessionTests`: logout, identity changes, credential changes, role
  changes and bounded admissions.
- Frontend service/hook tests: deduplication, heartbeat timeouts, reconnect snapshots,
  malformed events, cleanup, truck switching, opt-in audio and cancellation silence.
- Isolated Playwright ordering journey: owner badge, actual SSE connections, customer
  updates, cancellation, offline recovery and logout against real PostgreSQL.

Manual demo: open an owner workspace and a different customer browser profile. Enable
sound explicitly, place an order, observe the badge, then accept it as owner and
watch customer tracking. Cancel another placed order and verify the badge decreases
without a new-order chime. Disconnect/reconnect the owner's network and verify the
indicator recovers and the queue reconciles. No test should use application data.
