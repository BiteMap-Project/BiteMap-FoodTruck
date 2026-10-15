# Checkout validation and retry contract

POST /api/customer/orders requires a customer session and current CSRF token.
GET /api/customer/orders/{orderId} returns only the signed-in customer's order.

## Request

```json
{
  "vendorId": -1,
  "idempotencyKey": "cd821fc5-316c-4a85-af68-e6890485d32c",
  "items": [{"menuItemId": -5, "quantity": 2}]
}
```

Use actual IDs from vendor/menu APIs: the example IDs are illustrative.
IDs must be nonzero JSON integers within signed 64-bit range. Negative development
IDs and positive operator-created IDs follow identical availability checks.
Send 1–50 distinct items, each with an integer quantity from 1 to 10.
Missing/null fields, null lines, duplicates, zero IDs, fractional/string numbers,
and out-of-range numbers return 400.

The server ignores client prices, totals, status, and customer identifiers.
It obtains item ownership, availability, and prices from PostgreSQL and calculates
BigDecimal totals, storing price/name snapshots atomically with the order.
This endpoint creates a pickup order; it does not charge a payment method.

## Idempotency

Generate one UUID for a checkout attempt and retain it through network retries.
Same customer + same key + same vendor/item quantities returns the original order,
including its original prices, even when the menu has subsequently changed.
Line ordering does not change cart identity. Both first creation and replay return
201 and the same Location. Changed cart with the same key returns 409.
A new purchase needs a new UUID. Different keys can create separate orders.

A PostgreSQL transaction advisory lock serializes same-customer/key requests across
backend instances; the existing unique(customer_user_id,idempotency_key) constraint
remains the database safeguard. Shared locks protect the customer grant, vendor,
and selected menu rows while the order is created. Menu rows are loaded in one
bounded, parameterized query and locked in ID order.
No schema migration or development-seed rewrite is required.

## Errors

Responses use application/problem+json:

- 400: invalid request (field errors included for bean validation), duplicate lines,
  or a total too large for the supported amount range.
- 401/403: session/role/CSRF protection.
- 404: order absent or owned by another customer.
- 409: unavailable truck/item or idempotency-key conflict. Sold-out items belonging
  to the selected truck include their requested ID. Foreign and missing items use
  the same unavailable response.
- 503: sanitized database/transaction failure. Retry with the original key.

## Verification

CustomerOrderApiTests covers seeded and operator-owned menu items, money tampering,
validation, availability, snapshots, ownership, authentication and CSRF.
OrderConcurrencyTests uses committed fixtures and separate real transactions to
test simultaneous identical retries and competing carts with one key.
OrderErrorTests checks that SQL/connection details never reach error responses.
Run the backend Maven verify lifecycle against a dedicated disposable PostgreSQL
test database, not the application's development database.
