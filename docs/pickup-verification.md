# Verified pickup handoff

Customers retrieve their six-digit `pickupCode` from their own order response
(`POST /api/customer/orders`, `GET /api/customer/orders/{id}`). Leading zeros
are significant. Responses use `Cache-Control: no-store`; the code is not in
owner responses, order lists, notifications, URLs, or browser storage. It is
displayed only while PLACED, ACCEPTED, or READY, and cleared with private order
state on logout/account change or when the order becomes terminal.

## Owner contract

`POST /api/operator/vendors/{vendorId}/orders/{orderId}/verify-pickup`

Authenticated enabled owner session and a fresh CSRF token are required.
JSON body: `{"code":"012345","version":2}` (example only).

- 200: READY becomes COMPLETED, version increments once, one history entry records the actor.
- 400: malformed code or version. Code must be a JSON string of six ASCII digits.
- 401/403: authentication, role, or CSRF failure.
- 404: truck/order outside the owner's scope, indistinguishable from missing.
- 409: wrong code, stale version, or order not READY.
- 429: five incorrect guesses; `Retry-After` states remaining seconds. Cooldown is five minutes per order.
- 503: storage/encryption unavailable; fail closed, never offer an override.

The old status endpoint rejects every request to set COMPLETED. Other existing
transitions remain unchanged. READY orders can be collected after the saved stop
ends. There is no owner or administrator bypass in this release.

## Transactions and recovery

Ownership is checked before locking the scoped order. That row lock serializes
verification and status mutations. Failed guesses update persistent counters;
the service returns a failure outcome so its transaction commits before the
controller renders the error. They do not change the order version/history.
Expired cooldowns reset the guessing window. A successful verification writes
completion and verification metadata in the same transaction.

After a lost response, refresh order details first. An exact retry with the same
owner, code, and pre-completion version returns the existing completed order,
without another history entry. Requests with different/stale versions do not
complete anything. The UI never automatically retries a mutation.

## Encryption and migration

V22 adds a separate table. Codes use SecureRandom, AES-256-GCM with a fresh nonce,
and order-specific authenticated data. The database stores ciphertext, not plaintext.
New checkouts generate a code within the checkout transaction; existing open
orders get one lazily when retrieved by their customer (or during verification).
Historical completed/cancelled orders are not backfilled. Successful verification
metadata and encrypted codes are retained for replay recovery; terminal customer
responses never expose them.

`PICKUP_CODE_KEY` is required at startup. Every instance sharing this database
must use the same secret. Each independent developer database should use its own.
The checked-in zero key is exclusively for disposable automated tests; never use
it with a real database. Production must supply the key from a secret manager,
back up it separately and securely, and prohibit request/response body logging
on these routes. No API, log, analytics event, screenshot, or support ticket should
contain a real pickup code or encryption key.

This release uses encryption key version 1. Rotation is not automatic: do not
replace the key in place. A future rotation requires a multi-key read/decrypt and
re-encryption migration before retiring the old key. If the key is unavailable,
restore it from backup; do not reset codes or bypass verification.

## Manual verification (two separate browser sessions)

1. Customer orders from a serving truck and reopens My orders. Note the code;
   refresh and verify it remains the same, including leading zeros if present.
2. Owner accepts then marks READY. Direct completion through `/status` returns 409.
3. Enter an incorrect code. Order stays READY. Refresh details before trying again.
4. After five incorrect guesses, even the right code receives 429. Restarting the
   backend must not remove the cooldown. Wait five minutes and try the right code.
5. Correct code completes the order. Customer sees Collected and no longer sees
   the code. Replaying the original correct request returns the same order.
6. Another customer cannot retrieve the order/code; another owner cannot verify.
7. Switch accounts or sign out in another tab, then return to the order tab:
   private order data and the code disappear when session changes are detected.

Automated coverage includes crypto tampering/leading zeros, strict validation,
ownership/CSRF, no bypass, cooldown persistence, concurrent completion, replay,
privacy, and the real-browser customer-to-owner ordering journey. Tests run only
against disposable PostgreSQL databases.
