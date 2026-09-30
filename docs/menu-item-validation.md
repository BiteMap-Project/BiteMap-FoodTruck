# SCRUM-37: Menu item form validation

`frontend/src/features/menu/` contains:

- `validateMenuItem.ts`: pure validation that returns either trimmed values
  ready for the API or one message per invalid field.
- `MenuItemForm.tsx`: the operator form for adding or editing an item. It uses
  the validator, shows errors after a field is left or on submit, moves focus
  to the first invalid field, and shows a save error if `onSubmit` throws.

The form is not routed yet. It needs operator login and a menu write endpoint
(Menu Management epic, SCRUM-13).

## Rules

These match `V4__create_vendor_menu_items.sql`, so anything the form accepts
will also pass the database constraints.

| Field | Rule | Source |
| --- | --- | --- |
| name | Required, trimmed, not whitespace-only, at most 150 characters (emoji count as 1, like PostgreSQL) | `VARCHAR(150)`, `CHECK (name ~ '[^[:space:]]')` |
| description | Optional; blank becomes `null`; at most 500 characters | `TEXT` (the 500 limit is a UI choice) |
| price | Required; digits with at most 2 decimals; an optional leading `$`; 0 to 99,999,999.99 | `NUMERIC(10,2)`, `CHECK (price >= 0 ...)` |
| available | Checkbox, default on | `BOOLEAN DEFAULT TRUE` |

Rejected price formats include negatives, commas (`1,000`), scientific
notation, `NaN` and `Infinity`.

## Suggested API contract for the backend owner

```
POST /api/vendors/{vendorId}/menu-items        (operator only)
PUT  /api/vendors/{vendorId}/menu-items/{id}   (operator only)
{ "name": "Horchata", "description": null, "price": 3.5, "available": true }
```

The server must enforce the same rules itself (Bean Validation `@NotBlank`,
`@Size(max = 150)`, `@DecimalMin("0.00")`, `@Digits(integer = 8, fraction = 2)`).
Client validation only gives faster feedback. If the server returns 400 with a
ProblemDetail, the page can pass `detail` to the form by throwing
`new Error(detail)` from `onSubmit`.

Usage once an endpoint exists:

```tsx
<MenuItemForm onSubmit={async (item) => {
  const response = await fetch(`/api/vendors/${vendorId}/menu-items`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(item),
  });
  if (!response.ok) throw new Error((await response.json().catch(() => null))?.detail ?? "");
}} />
```
