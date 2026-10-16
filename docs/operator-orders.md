# Owner order management

The workspace Orders screen is connected to these endpoints. It supports status
filters, pagination, saved item details, allowed transitions and confirmed cancellation.
The queue refreshes every 30 seconds while visible. Detail versions refresh only on
explicit reload or a successful local update, so background refresh cannot silently
change the version used for an owner's pending action.
Stale/failed writes block further actions until detail refresh; writes are never
automatically retried. Switching trucks aborts pending reads and hides old details.
Requires an authenticated, enabled OPERATOR account with an enabled operator
profile, plus explicit ownership of the selected vendor. ADMIN alone does not
bypass ownership. Account and owner IDs are never accepted from request bodies.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | /api/operator/vendors/{vendorId}/orders | Paginated queue |
| GET | /api/operator/vendors/{vendorId}/orders/{orderId} | Order details and price snapshots |
| PATCH | /api/operator/vendors/{vendorId}/orders/{orderId}/status | Versioned status update |

List parameters: page=0 (0–10000), size=20 (1–100), optional status
PLACED/ACCEPTED/READY/COMPLETED/CANCELLED. Sort: createdAt descending, then id
descending. Response: items, page, size, totalElements, totalPages.
Items are summaries, without line items. An owned truck without matching orders
returns 200 with an empty list. A missing or foreign truck returns 404.

A summary contains id, vendorId, status, total, createdAt, updatedAt, version,
and cancellationReason (null unless recorded). Detail adds items with menuItemId,
name, unitPrice, quantity and lineTotal from saved checkout snapshots.
Responses do not expose customer emails, credentials, or arbitrary account data.
All successful responses include Cache-Control: no-store.

## Commands

Read the latest version from the detail response, then submit:

```json
{"status":"ACCEPTED","version":0}
```

Cancellation example (use the actual current version):

```json
{"status":"CANCELLED","version":1,"cancellationReason":"Kitchen closed unexpectedly."}
```

Send a current X-CSRF-TOKEN with the same authenticated session cookie.
Status must be an exact uppercase name, not a number/ordinal. Version must be
a nonnegative JSON integer, not a string or fraction. Reasons are trimmed,
limited to 500 characters, required and nonblank for cancellation, and must
be absent/null/blank for other transitions. Render reasons as text, not HTML.

Allowed transitions:

- PLACED → ACCEPTED or CANCELLED
- ACCEPTED → READY or CANCELLED
- READY → COMPLETED
- COMPLETED / CANCELLED → no further changes

Skipping steps, repeating the same state, or reopening terminal states returns
409. Cancellation from READY is intentionally disallowed. There is no payment
or refund processing in these endpoints.

## Concurrency and retries

Updates lock the owned order and compare the submitted version. Every successful
transition increments the version once and inserts one audit event within the
same transaction. Two requests with the same version cannot both succeed.
If the response is lost, GET the order to see the current state before retrying.
A duplicate PATCH using an old version returns 409, not a second mutation.
Do not automatically substitute a newer version and replay an old user action.

Ownership is checked inside the service, not only through route security.
Shared locks hold the enabled account, OPERATOR grant, profile and vendor
ownership stable until the transaction ends. Reads use a fixed number of queries:
list never loads each order's items individually. List count and results share
a repeatable-read snapshot. Status changes and audit records roll back together.

V11 adds version, updated_at, cancellation_reason, status history and a
vendor/status/time index. Existing rows start at version 0 with updated_at equal
to created_at. No historical reviewer or cancellation reason is fabricated.
Previously cancelled rows may therefore have a null reason.
History records actor user ID, previous/new state, version, reason and timestamp.

The existing customer GET /api/customer/orders/{orderId} returns the latest
status and now includes cancellationReason. Customer ownership remains enforced.
This does not add customer order history, notifications, GPS, or frontend refresh.

## Error contract

- 400: invalid payload, status, version, cancellation reason, or pagination.
- 401: unauthenticated.
- 403: wrong role, disabled operator profile, or invalid/missing CSRF token.
- 404: truck/order missing, wrong truck, or not owned; deliberately indistinguishable.
- 409: stale version or forbidden state transition.
- 503: sanitized database/transaction failure; refresh before retrying.

Application errors use application/problem+json. CSRF rejections follow the
existing Spring Security error response. Internal SQL and connection details
are never included by the owner-order exception handler.

## Manual verification in Swagger

1. Sign in as an approved operator who owns the truck with a saved customer order.
2. Execute GET /api/operator/vendors, select that truck's actual ID.
3. List its orders. Open one order's detail and note its status and version.
4. Refresh CSRF after login; submit ACCEPTED with the version you read.
5. Repeat that exact PATCH: expect 409 and no second history record.
6. GET again; submit READY using the new version, then COMPLETED using the next.
7. On a separate PLACED order, cancel with a reason. Verify customer details show
   CANCELLED and the same reason. A completed order cannot be cancelled.
8. Sign in as another operator: listing, reading or updating the first operator's
   truck/order must return 404. A customer-only account must get 403.

## Automated coverage

OperatorOrderApiTests: pagination, filtering, price snapshots, every pair of
statuses, stale versions, cancellation reasons, malformed input, ownership,
operator role, disabled profiles, authentication and CSRF.
OperatorOrderTransactionTests: competing updates and duplicate retries using
separate committed transactions, audit-failure rollback, direct service authorization.
OperatorOrderErrorTests: sanitized errors for all three endpoints.
DatabaseMigrationTests: fresh databases and preservation of pre-V11 order data.

Run Maven verify against an isolated PostgreSQL test database. Do not point
integration tests at the development application's database.

Frontend verification: run npm test, npm run build and npm run lint in frontend.
OrdersPanel.test.tsx covers real HTTP request shapes through mocked fetch, fresh
CSRF, transitions, cancellation confirmation, duplicate-click locking, conflicts,
network failures, expiry, access errors, pagination, visible-tab polling and stale
responses after switching trucks. The existing customer confirmation screen and
customer order-history UI are separate follow-up work.
