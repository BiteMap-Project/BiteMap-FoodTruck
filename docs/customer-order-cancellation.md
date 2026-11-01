# Customer order cancellation

Customers may cancel only their own `PLACED` orders, before acceptance. No payment
or refund operation is performed; payment integration remains a separate feature.

## API

`POST /api/customer/orders/{orderId}/cancel`

Requires an enabled CUSTOMER session and a valid CSRF token obtained from
`GET /api/auth/csrf`. Body: `{"version": 0}` using the version from the order detail.
The version must be a nonnegative JSON integer, not a string or fraction.

- 200: complete updated order, `CANCELLED`, incremented version, `Cache-Control: no-store`.
- 400: invalid request.
- 401/403: missing session, role, or CSRF protection.
- 404: missing order or another customer's order, without disclosing ownership.
- 409: stale version or order no longer eligible for cancellation.

Repeating the same successful cancellation with its original version returns the
same cancelled order without another version increment or history entry. This is
verified against the recorded customer cancellation, not merely CANCELLED status.
Other terminal orders cannot be cancelled again.

## Concurrency and UI

Customer cancellation and owner acceptance lock the same order row. Exactly one
transition can win; the other receives a conflict. Status, version, timestamp and
audit history commit atomically. Failed audit writes roll back the transition.

The customer must confirm cancellation. Duplicate submissions are locked while a
request is pending. A network failure is an unknown outcome: refresh status before
retrying, and do not assume the order was cancelled. Retries use the same version.
Successful cancellation aborts pending status reads so an old response cannot
restore the previous status. Existing account-aware route guards clear private
data after logout/account changes. Missing versions fail closed in the UI.

The owner queue uses its existing visible-tab 30-second polling and manual refresh.
An already-open owner detail can be refreshed; stale owner mutations return 409.
Cancellation does not delete order history or affect other orders.

## Verification

Backend tests: `CustomerCancellationApiTests` and `OperatorOrderTransactionTests`
cover ownership, authentication, CSRF, invalid/stale versions, terminal states,
replays, simultaneous retries, acceptance races and transactional rollback.
Frontend tests: `CustomerCancellation.test.tsx` covers confirmation, terminal
states, conflicts, duplicate clicks and lost-response recovery.
The isolated Playwright ordering journey exercises customer confirmation and
cancellation, owner queue polling, replay and unauthorized requests against real
PostgreSQL. Run the full suite with `npm run test:e2e` in `frontend`.

Manual check: sign in as customer and owner in separate browser profiles. Place an
order, choose Cancel order then Keep order, verify it remains placed, then confirm
cancellation. Verify customer tracking and owner queue show Cancelled. For another
order, accept as owner first: customer cancellation must disappear after refresh
and a direct cancellation request must return 409.
