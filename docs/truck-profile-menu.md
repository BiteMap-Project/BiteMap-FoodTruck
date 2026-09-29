# SCRUM-31: Truck profile and menu

As a consumer, I can open a truck profile and menu to decide what to eat.

## Acceptance criteria

1. Each discovery card links to `/trucks/:id` using its database ID.
2. The page shows that vendor's name, category, and location from the API.
3. Menu items show names, USD prices, optional descriptions, and an unavailable label when needed.
4. A vendor without items shows “No menu available yet.”
5. Requests have loading and retryable error states; route changes cancel older requests.
6. Missing/invalid IDs show “Truck not found.” with a return link.
7. Direct URLs, refresh, and return navigation work.
8. Profile text and menu items wrap on mobile without horizontal scrolling.

No ordering, checkout, operator editing, authentication changes, or invented hours.
Location is the existing vendor location label, not a live GPS position.

## Read-only contract

`GET /api/vendors/{id}` is public. A successful response has:

```json
{
  "id": 12,
  "name": "Example Truck",
  "category": "Soup",
  "location": "Example location",
  "menu": [
    {"id": 31, "name": "Soup", "description": null, "price": 8.99, "available": true}
  ]
}
```

This example illustrates the format, not seeded vendor data. The combined response
keeps the profile and menu in one read-only database snapshot. Items are ordered
by name, then ID. All items, including unavailable ones, are returned.

- `200` with `menu: []`: vendor exists but has no items.
- `404` Problem Details: no vendor with that ID.
- `400` Problem Details: ID is not a signed 64-bit integer. The frontend presents
  this as an invalid truck link.
- `503` Problem Details: database unavailable; no internal error details exposed.

Negative development vendor IDs are supported. Existing list/search behavior stays
unchanged. Only GET detail access is public; writes and unrelated routes remain protected.

## Database

V4 creates `vendor_menu_items`, with a required vendor foreign key, nonblank name,
optional description, exact nonnegative finite decimal USD price, and availability
(default true). An index supports lookup by vendor. Deletion of a referenced vendor
is restricted. Existing vendors and scheduled stops are preserved.

The production migration adds no menus and no write endpoint. A separate
development-only repeatable fixture adds sample menus to the three development
vendors. Operator menu management is separate work. Coordinate the V4 version
with teammates before merging; never edit already-applied versioned migrations.

## Validation

Frontend tests cover card navigation, direct-route loading, price formatting,
unavailable/empty menus, missing and malformed IDs, retry, and stale responses.
Backend tests cover vendor isolation, negative IDs, missing/invalid IDs, public
reads and protected writes, safe errors, and database constraints. Migration tests
verify upgrades preserve vendor and stop data and do not insert menu data.
