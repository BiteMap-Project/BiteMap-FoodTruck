# Shared frontend data types

SCRUM-42 centralizes backend response shapes in `frontend/src/types/api.ts`.
Services still own requests, error messages, and feature-specific input types, but
they import shared records instead of redefining the same data.

The shared file currently covers:

- accounts and account roles;
- vendors, public menu items, and operator-managed menu items;
- reusable paginated responses;
- customer and operator order summaries, details, items, and statuses.

Public and operator menu items remain separate types because their APIs return
different fields. Public items expose `available`; managed items expose `status`,
`vendorId`, and `version`. Keeping those contracts separate prevents the UI from
assuming that a public response contains private management fields.

Existing service type exports are retained so feature components do not need a
large import rewrite. New code may import common API models directly from
`src/types/api.ts`. Types used only by one feature, such as form state and query
filters, should stay next to that feature.

## Acceptance checks

- Shared API records have one definition.
- Customer and operator order views use the same order status and line-item types.
- Public and operator vendor services use the same base vendor type.
- Pagination uses the generic `Page<T>` type.
- TypeScript build, frontend tests, and lint complete without a new warning.
