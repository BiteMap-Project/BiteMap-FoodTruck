# Metadata-only owner menu reads

Owner menu list and detail queries select the existing `MenuItemResponse` fields
directly. `image_data IS NOT NULL` supplies `hasCustomImage`; neither image bytes
nor the media type are returned by those database queries. No schema migration,
API change, storage service, or frontend change is required.

Ownership checks and their existing locking/transaction boundaries remain in
place. List ordering remains name then ID, with database pagination and an
explicit count query. Public customer menu reads already select metadata only.
The public image endpoint still loads and serves photos separately.

Writes intentionally retain managed entities, optimistic version checks, CSRF,
and ownership enforcement. Ordinary price or availability edits preserve the
photo; explicitly choosing a preset retains its existing photo-removal behavior.
This change does not optimize image delivery or mutation queries.

## Regression checks

`MenuReadTests` was run failing before the implementation: all three tests
detected image bytes in the old select queries. The tests inspect emitted SQL
and Hibernate entity loads, rather than relying on timing thresholds:

- Mixed photo/no-photo metadata and stable name/ID pagination.
- Metadata-only detail reads and ownership/missing-item rejection.
- A 101-item fixture with 64 KiB photos: reading the first 100 items previously
  materialized 6,553,600 image bytes (6.25 MiB); the projection materializes none,
  while producing identical response metadata. This is not a latency benchmark
  or a claim that browser image downloads are eliminated.

`MenuApiTests` also uploads a valid photo, changes price and availability, and
checks photo flags, versions, identical served bytes, and the unchanged ETag.
Existing browser tests cover upload, owner/customer rendering, fallback, and
the ordering journey against a disposable PostgreSQL stack.

Run backend `./mvnw verify` with DB_URL/DB_USERNAME/DB_PASSWORD pointing only to
an isolated test database. Run `npm run test:e2e` from frontend for the disposable
real-browser suite. Never run database-mutating tests against application data.
