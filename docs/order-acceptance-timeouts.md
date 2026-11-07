# Order acceptance timeouts

Owners choose **3, 5, 10, 15, or 20 minutes** in Orders → Incoming orders → Time to accept orders. The default is **5 minutes**. This is the time to accept a new order, not preparation time and not the cutoff for placing new orders.

## Rules and rollout

- V23 adds the truck setting and nullable snapshots on orders. Existing orders keep null snapshots and **do not expire automatically**. There is deliberately no historical backfill.
- A new order saves `acceptanceMinutes` and `acceptanceDeadline`. The deadline is the earlier of database checkout time plus the configured minutes, or the order's saved pickup closing time.
- Changing the truck setting affects only future orders. An existing order's deadline cannot be extended through an API.
- Only `PLACED` orders expire. Accepted, ready, completed, and already-cancelled orders are unaffected.
- At or after the deadline, owner acceptance and estimate updates on a placed order return 409, even if the expiration worker has not run yet. There is no owner override.
- Automatic cancellation uses the reason “The truck did not accept your order in time.” The audit actor is `SYSTEM`, with no fabricated user ID.
- Original checkout retries return the original order, including its cancellation, without creating another order or rechecking current truck availability. A genuinely new order requires a new checkout attempt.
- Existing price calculation, account ownership, active-stop checks, ordering pause, cutoff, CSRF, and version checks remain in force. No payment or refund is performed; BiteMap currently uses pay at pickup.

## API contract

The existing `GET /api/operator/vendors/{id}/ordering` endpoint now returns `acceptanceMinutes`. `PUT` to the same path accepts this optional integer alongside the existing required `acceptingOrders` and `version` fields. Omitting it preserves the current setting; fractions, numeric strings, overflow, and values outside the five choices are rejected. The normal ordering version protects concurrent edits.

The public current-pickup response includes the truck's current `acceptanceMinutes`, used for the checkout preview. Settings can change after the preview; the authoritative order response contains the actual saved window and exact deadline.

Customer order details include `acceptanceMinutes` and `acceptanceDeadline`. Owner order summaries/details include `acceptanceDeadline`. Legacy orders return null values. No sensitive owner/customer identifiers or pickup verification codes are added to public pickup or owner responses.

## Transaction and worker design

Checkout holds the existing shared truck lock while reading the setting and inserting its snapshot. A settings writer holds the conflicting exclusive lock. The database clock, not the customer's clock, determines the deadline.

The worker polls every five seconds by default and processes at most 100 orders per poll. A partial index bounds the due-order lookup. `FOR UPDATE SKIP LOCKED` supports multiple backend instances without duplicate cancellations. Each order has its own transaction, avoiding cross-truck notification-lock cycles. Status, version, audit entry, and existing database notification signals commit together; an audit failure rolls everything back and a later poll retries.

Acceptance and expiration serialize on the order row. Acceptance also checks the deadline in its final SQL update after lock waits. If acceptance wins before the deadline, the worker leaves it alone. If expiration wins, acceptance cannot overwrite cancellation.

Configuration properties:

- `bitemap.order-expiration.enabled`: default true. Disabled only in ordinary integration tests, where expiration is invoked explicitly.
- `bitemap.order-expiration.poll-ms`: default 5000. The browser suite keeps the real worker enabled.

Expiration is eventual, not an exact-at-the-second delivery guarantee. Load, database outages, or scheduler delays can increase lag; late acceptance remains blocked. After restart, the worker catches up on overdue placed orders. Monitor the age/count of overdue placed orders and these Micrometer counters:

- `bitemap.orders.expired`
- `bitemap.orders.expiration.poll.success`
- `bitemap.orders.expiration.failures`

An increasing failure counter or a stalled success counter requires investigation. Metrics are registered with the existing registry, not publicly exposed by this change. Capacity beyond 100 per poll or sustained backlog needs operational tuning before increasing traffic.

## UI and verification

Customers see the expected window before checkout and the saved deadline on order tracking. Owners see deadlines in the queue and details, with a warning in the final minute. The browser clock is advisory: passing the deadline displays “waiting for the server” rather than inventing a cancellation. Accepted orders no longer show an acceptance countdown.

Automated coverage includes allowed values, CSRF/ownership/stale versions, deadline snapshots, closing-time capping, legacy orders, recovery after expiration, accepted-order immunity, two workers, acceptance races, lock waits, and rollback when auditing fails. UI tests cover the setting, checkout notice, warning, and terminal-state behavior. The real-browser scenario uses separate accounts and an isolated Docker database; it closes the customer page, advances only that disposable fixture's deadline, waits for real background cancellation, then reopens tracking and retries the original checkout.

Manual smoke test after rebuilding backend and frontend:

1. In an owned truck's Orders page choose 20 minutes and save. Reload and confirm persistence.
2. With a different customer account, open an active truck, add an item, and check the wait explanation in the cart.
3. Place the order; confirm the customer and owner see the saved deadline.
4. Change the setting to 3 minutes. Confirm the original deadline stays unchanged; a newly placed order uses 3 minutes (or the earlier pickup closing time).
5. Leave that new order unaccepted and close the customer page. After its deadline and a worker poll, reopen My orders: it is cancelled with the reason above.
6. Accept a different order before its deadline. It must stay accepted beyond that deadline and continue through normal pickup verification.

Do not modify application order timestamps to accelerate a manual test. Automated time travel is restricted to the disposable test stack.
