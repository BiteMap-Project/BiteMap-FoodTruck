# Vendor discovery API

## GET /api/vendors

Public, read-only endpoint backed by PostgreSQL. No login is needed. This is the
first business API, not an implementation of vendor ownership, menus, or ordering.

| Parameter | Default | Behavior |
| --- | --- | --- |
| `q` | Empty | Up to 200 characters before trimming; case-insensitive literal substring match across name, category, or location. Leading/trailing Java whitespace is stripped. Blank means no filter. |
| `page` | `0` | Zero-based integer, 0 through 10000. The cap bounds offset size. |
| `size` | `20` | Integer, 1 through 100. |

Results are sorted by name ascending (database collation), then ID ascending for
ties. Sorting is fixed, not client-selectable. `%`, `_`, `!`, and backslashes in
search are literal characters, not SQL wildcards. Queries use bound parameters.
Search does not inspect menu items, coordinates, distance, or opening hours.
An index/search-engine optimization is not included; measure this substring query
on realistic data before scaling it. Pagination is not a snapshot across requests
if vendors are concurrently added or renamed.

Example with the development fixtures:

```bash
curl --get 'http://localhost:8080/api/vendors' \
  --data-urlencode 'q= taco ' \
  --data-urlencode 'page=0' \
  --data-urlencode 'size=20'
```

```json
{
  "items": [
    { "id": -2, "name": "Taco Mobile", "category": "Tacos", "location": "Northridge" }
  ],
  "page": 0,
  "size": 20,
  "totalElements": 1,
  "totalPages": 1
}
```

IDs are database IDs, not array indexes. Development fixtures use negative IDs;
new database-generated IDs are positive. The public response explicitly exposes
only `id`, `name`, `category`, and `location`. Do not invent a closing time or
treat the location label as real-time GPS data.

### Empty results and errors

- Empty database or no matches: HTTP 200 with `items: []`, `totalElements: 0`,
  and `totalPages: 0`.
- Page beyond the last result: HTTP 200 with empty items and the actual totals.
- Invalid numeric/range/length input: HTTP 400, `application/problem+json`.
- Database access/transaction connection failure: HTTP 503,
  `application/problem+json`, with a safe message instead of SQL or stack traces.

Example database-unavailable response:

```json
{
  "type": "about:blank",
  "title": "Service Unavailable",
  "status": 503,
  "detail": "Vendor information is temporarily unavailable. Please try again later.",
  "instance": "/api/vendors"
}
```

Clients should check the HTTP status, then render loading, empty, or error states
as appropriate. Do not treat a failure as an empty successful list.

## Security boundary and frontend integration

GET `/api/vendors`, `/api/vendors/{id}`, `/api/vendor-stops`, and health endpoints are anonymously accessible.
Other application routes require authentication, and CSRF protection remains
enabled. Error dispatches are allowed so framework errors retain their intended
status. The generated Spring Security login is still development scaffolding;
this change does not implement real accounts, roles, or a production auth system.

No create/update/delete endpoint is provided. CORS is not opened globally.
React discovery uses a same-origin /api request through the Vite development
proxy (Docker target: http://backend:8080; host default: http://localhost:8080).
It displays loading, empty, error/retry states and paginated search results.
Closing times are not displayed. Cards link to database-backed truck profiles
and menus; see [profile and menu contract](truck-profile-menu.md).
Production hosting must provide same-origin /api routing separately.

## Verification

Use a dedicated empty PostgreSQL test database, without the `dev` profile, and
run `./mvnw --batch-mode --no-transfer-progress clean verify` from `Backend`.
API integration tests exercise HTTP handling, security, JPA, and real PostgreSQL.
Fixture inserts are rolled back after each test; tests refuse to delete existing
vendor data to make the test database empty. MVC slice tests simulate database
failures to verify safe error responses. The existing backend CI runs these tests.

For a local development smoke check:

```bash
docker compose up --build -d --wait
curl 'http://localhost:8080/api/vendors'
curl -i 'http://localhost:8080/api/vendors?size=0'
```
