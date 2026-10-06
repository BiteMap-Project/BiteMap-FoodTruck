# Owner-protected menu management

Implemented for this repository's Java 21 / Spring Boot 4.1.1 stack. No framework
downgrade, frontend edits, new dependencies, ownership transfer, or delete API.

## Authorization and transaction architecture

The existing security filter requires ROLE_OPERATOR for `/api/operator/**`.
Every MenuService entry point then checks resource ownership within its own
transaction. The controller supplies the email from Authentication, never from
the request. `MenuItemRepository.lockOwnedVendor` joins the requested vendor to
its enabled operator and applies PostgreSQL `FOR SHARE OF o, v`. Missing,
unowned, disabled, and foreign vendors all yield the same domain not-found
exception, mapped to 404 by controller advice. Item reads additionally bind
both item ID and vendor ID, preventing item-ID substitution across vendors.

A database-backed `@PreAuthorize` expression by itself would add a query outside
the write's transaction and would not prevent ownership changing between check
and write. We therefore use URL-level role checks plus a mandatory service-level
resource check, not duplicate expression checks. The locks prevent account
disabling, deletion, or vendor reassignment until the operation completes.

No per-item authorization or lazy association traversal is used. The entity maps
`vendorId` as a scalar. A full page needs at most three statements: one owner
check, one page select, and one count. Item reads need two. Management reads also
use write-capable transactions because PostgreSQL row locks cannot be acquired
in read-only transactions. List count/content share a repeatable-read snapshot.

Details/status writes load the item in that same transaction. The entity's JPA
`@Version` provides optimistic locking: the request's version catches stale
clients, and Hibernate's version predicate catches a concurrent commit after
the initial read. Flush occurs before response mapping. There is no automatic
retry of a business edit: on 409, reload and let the user reconcile changes.

MenuService has no HTTP types, servlet state, or Spring Security dependency.
Domain exceptions are mapped by MenuExceptionHandler. DTO validation runs in
the controller and on the service proxy; price uses BigDecimal, never double.
Repository SQL uses bound values. The service is the ownership boundary; do not
inject its repository into future controllers to bypass that boundary.

## API contract

Base: `/api/operator/vendors/{vendorId}/menu-items`

| Method | Suffix | Success | Request record |
| --- | --- | --- | --- |
| POST | none | 201 + Location + item | CreateMenuItemRequest |
| GET | `?page=0&size=20` | 200 + paginated items | none |
| GET | `/{itemId}` | 200 + item | none |
| PUT | `/{itemId}` | 200 + item | UpdateMenuItemRequest |
| PATCH | `/{itemId}/availability` | 200 + item | ChangeMenuAvailabilityRequest |

All management routes require the enabled owner's session. Writes additionally
require a valid CSRF header. Fetch a fresh token after login. Swagger documents
these endpoints under **Operator menu**. A CSRF token alone is not authentication.
Success responses use `Cache-Control: no-store`.

### Create

```json
{"name":"Chicken Taco","description":"Chicken, salsa, onion","price":4.50,"status":"ACTIVE"}
```

Validation: name required/nonblank, maximum 150 code units; optional description
maximum 500; price required, nonnegative, at most eight integer and two fractional
digits (USD); status required. Name/description are trimmed and blank description
becomes null. No silent price rounding. Allowed state names are exactly `ACTIVE`,
`INACTIVE`, `SOLD_OUT`; numeric enum ordinals are rejected. Unknown ownership/ID
fields cannot assign vendor or owner; extra fields follow the existing ignore
behavior and are never bound to entity setters.

### Edit details

```json
{"name":"Chicken Taco","description":"New description","price":5.00,"version":0}
```

Same text/price validation; version is required and nonnegative. All editable
detail fields are replaced (omitting description clears it). Availability and
vendor identity are not changed. Use the version from the latest item response.

### Change availability

```json
{"status":"SOLD_OUT","version":1}
```

Both fields required. All three states can transition to one another. Details
are unchanged. Actual changes increment version; an unchanged write may retain
its version. No inventory quantity or automatic restock behavior is implied.

Responses contain `id`, `vendorId`, `name`, `description`, `price`, `status`, and
`version`. Lists contain `items`, `page`, `size`, `totalElements`, `totalPages`;
ordering is name then ID. Bounds: page 0–10000, size 1–100. An owned empty menu
returns 200 with an empty array, not 404. Entities are never serialized directly.

Errors: 400 invalid input; 401 no login; 403 wrong role/CSRF (CSRF runs first);
404 inaccessible/missing resource; 409 stale version/concurrent change; 503
database unavailable. Errors do not return SQL, credentials, or rejected values.

## Public compatibility and migration

Owner-only viewing refers to the **management** API. Existing customer-facing
`GET /api/vendors/{id}` still returns public menu items and their boolean
`available`. This preserves current behavior, including listing unavailable
items. INACTIVE is not a private/draft visibility mode in this version; both
INACTIVE and SOLD_OUT render as unavailable to the current frontend. If INACTIVE
should hide items, that requires a separate public contract/frontend decision.

V6 adds canonical `availability_status` and `version`. Existing available=true
becomes ACTIVE, false becomes INACTIVE; all IDs, text, prices, relationships,
and old boolean meanings are preserved. `available` is rebuilt as a stored
generated column (`availability_status = 'ACTIVE'`) so it cannot drift from
status. V1–V5 are unchanged. The development repeatable fixture now writes the
status column and retains ON CONFLICT DO NOTHING to preserve local edits.

After V6, manual SQL/imports must write availability_status, not available.
Old API readers remain compatible, but old fixture/import writers are not;
deploy the schema and new code together, with a database backup before a shared
environment rollout. The DDL takes a table lock/rebuilds the generated column;
plan a maintenance window for a large deployed table. Do not deploy old code
with the old development fixture against V6 or rewrite previous migrations.
Historical descriptions longer than 500 are preserved; new edits enforce the
new API limit. This feature does not make the whole application production-ready:
existing rate-limit, TLS, session deployment, and audit requirements still apply.

## Verification

Run `./mvnw clean verify` with Java 21 and isolated PostgreSQL credentials, never
against production. Tests cover owner/role/CSRF enforcement, item-ID substitution,
invalid states/prices/fields, bounded pagination and query count, public backwards
compatibility, V5-to-V6 data preservation, schema invariants, stale versions,
independent transactions attempting owner changes, genuine concurrent JPA edits,
safe errors, and Swagger contracts. Fixtures clean only their own generated data.

References: [Spring Data JPA transactions](https://docs.spring.io/spring-data/jpa/reference/jpa/transactions.html),
[PostgreSQL row locks](https://www.postgresql.org/docs/15/explicit-locking.html).
