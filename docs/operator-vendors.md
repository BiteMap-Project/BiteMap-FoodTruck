# Operator vendor ownership — SCRUM-52

Enabled operators can create, list, and update their own vendor profiles. This
uses V5's existing `vendors.operator_id` foreign key and index, without modifying
past migrations or assigning existing unowned/demo vendors to anyone.

## Contract

All endpoints require a logged-in operator session. POST and PUT also require
the current session's CSRF token. See [login/session setup](operator-sessions.md).

| Method and path | Success | Purpose |
| --- | --- | --- |
| POST `/api/operator/vendors` | 201, vendor summary | Create a vendor owned by the current operator |
| GET `/api/operator/vendors?page=0&size=20` | 200, paginated summaries | List only the current operator's vendors |
| PUT `/api/operator/vendors/{id}` | 200, vendor summary | Replace the three editable profile fields |

POST and PUT accept the same JSON:

```json
{"name":"Taco Mobile","category":"Tacos","location":"Northridge"}
```

All three fields are required and nonblank. Surrounding whitespace is stripped.
Maximum lengths are 120, 80, and 200 respectively (Java string code units).
PUT is full replacement of these editable fields, not a partial patch. It never
changes ownership, `created_at`, menu items, or schedule records. `location` is
the existing display label, not coordinates or a scheduled stop.

Responses contain `id`, `name`, `category`, and `location`, never owner email or
credentials. Creation also returns `Location: /api/vendors/{id}`. The vendor is
immediately visible in public discovery; there is no draft or approval workflow.
Protected success responses use `Cache-Control: no-store`.

List responses use the existing `items`, `page`, `size`, `totalElements`, and
`totalPages` structure. Sorting is by name then ID. `page` ranges from 0 to 10000;
`size` from 1 to 100. Empty or out-of-range pages return 200 with an empty `items`
array. Totals count only the current owner's vendors. Count and page queries
share a repeatable-read transaction snapshot.

## Access rules and errors

- `400`: invalid/missing fields, malformed JSON, invalid IDs or pagination.
- `401`: no authenticated session (writes without CSRF may be rejected as 403 first).
- `403`: wrong role, disabled/deleted operator, or missing/invalid CSRF.
- `404`: edit target is missing, unowned, or belongs to another operator. All three
  use the same response; editing does not disclose another owner's records.
- `503`: database or transaction unavailable; internal SQL and submitted values
  are not returned. Avoid blindly retrying a create after a network failure:
  check the list first because the write may already have committed.

The request DTO and SQL explicitly allow only the three profile fields. Extra
JSON fields (including `id`, `operatorId`, and `operator_id`) are ignored and
cannot assign or transfer ownership. Ownership always comes from the authenticated
session's account lookup. This API does not offer a claim/transfer operation.

Every management operation rechecks the persisted account's enabled state, not
just its session role. The account is held with a `FOR SHARE` row lock until the
transaction ends, ordering concurrent disable/delete operations against writes.
The update itself includes both vendor ID and owner ID in its WHERE clause,
avoiding a separate ownership-check/write race. SQL values are bound parameters.

Public discovery routes remain anonymous and unchanged. Menu/schedule editing,
ownership transfer, deletion, staff permissions, moderation, and frontend work
are outside this story. Concurrent edits by the same owner are last-write-wins;
optimistic versioning and create idempotency are not implemented here.

## Try it in Swagger

1. Register an operator if necessary, then log in.
2. Fetch a fresh `/api/auth/csrf` token after login and update **Authorize → csrfToken**.
3. Open **Operator vendors**, POST the example, and note the returned ID.
4. GET your list, then PUT that ID with all three profile fields.
5. Verify the updated public `/api/vendors/{id}` response.
6. With a second account in a separate browser session, confirm the first vendor
   is absent from its management list and cannot be edited (404).

Use the same hostname throughout each session. Swagger calls change the real
local database. Rebuild the backend after pulling this feature before testing.

## Verification

Run `./mvnw clean verify` with Java 21 and the isolated PostgreSQL test database
credentials, without development fixtures. Coverage includes owner-scoped lists,
creation, cross-owner/unowned/missing updates, forged owner fields, validation,
CSRF/role/session checks, account disabling, preservation of menus and schedules,
safe database errors, public discovery, and Swagger. A separate connection test
verifies the account lock blocks concurrent disabling until the vendor write
transaction ends; it cleans only its own generated records.
