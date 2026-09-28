# Serving-stop foundation

Step 1 of map discovery. V3 adds dated serving stops without changing existing
vendors, IDs, location labels, or GET /api/vendors. No demo locations are guessed
or inserted, so a fresh database returns an empty stop list. This task does not
add a map, geocoding, operator writes, ordering, or real-time GPS.

## Model

A vendor has many vendor_stops. Each stop has a venue name, address, coordinate
pair, starts_at/ends_at, named time_zone, status, last_confirmed_at, and timestamps.
Dates are timestamptz; PostgreSQL stores instants, and time_zone preserves the
display zone. The database validates a named zone against pg_timezone_names
(UTC or region-style names, excluding posix/right variants). Future write APIs
must also validate against Java ZoneId and resolve local DST ambiguity explicitly.

Required text cannot be whitespace-only. Coordinates must be finite and within
latitude/longitude ranges. Times must be finite, and end must follow start.
Status is scheduled, serving, ended, or cancelled. Serving requires a confirmation
timestamp. Vendor deletion is restricted while stops reference it. There is no
automatic cascading deletion. updated_at initially defaults to insertion time;
future update endpoints must advance it in their write transaction.

This release does not define a freshness threshold or return an openNow boolean.
The stored serving status is metadata, not a promise of fresh confirmation or
physical presence. Display scheduled hours until ownership, check-in, expiry,
and the team's freshness policy are implemented. Past serving rows are not
automatically rewritten; time filters exclude them from the default view.

## GET /api/vendor-stops

Public, read-only. Other security rules and CSRF remain enabled.

| Parameter | Default | Contract |
| --- | --- | --- |
| q | empty | Up to 200 characters; trimmed literal case-insensitive substring across vendor name/category and stop venue/address. SQL pattern characters are literal. |
| cuisine | empty | Up to 80 characters; trimmed case-insensitive exact match to vendor category. |
| from | server time | ISO-8601 timestamp with an explicit offset. |
| to | from + 7 days | Exclusive window end; must follow from by at most 31 days. Application date range is 1900-01-01 through 2100-01-01 UTC. |
| lat, lon | absent | Provide both or neither. Finite values in [-90,90] and [-180,180]. |
| radiusKm | absent | Requires center; greater than zero and at most 100 km. |
| page | 0 | Zero-based integer, 0–10000. |
| size | 20 | Integer, 1–100. |

Only scheduled/serving stops overlapping [from,to) are returned. A stop ending
exactly at from, or beginning exactly at to, does not overlap. Overnight and DST
intervals are compared as instants. Cancelled/ended stops are excluded even for
historical queries; this is a discovery API, not an audit-history endpoint.

Without a center: order by starts_at, then stop ID; distanceMeters is null.
With a center: order by distanceMeters, starts_at, then stop ID. Distance is
approximate spherical straight-line distance (mean Earth radius 6,371,008.8 m),
not driving distance or travel time. No external maps service is used. This
initial SQL distance calculation is suitable for a small initial dataset; measure
performance before scaling and decide on spatial indexing separately.

Response fields: items, page, size, totalElements, totalPages, evaluatedAt.
Each item includes stopId, vendor { id, name, category, location }, venueName,
address, latitude, longitude, startsAt, endsAt, timeZone, status,
lastConfirmedAt (nullable), and distanceMeters (nullable). vendor.location is the
legacy label; the stop address/coordinates determine map placement. Repeated
vendor IDs with different stop IDs are distinct scheduled occurrences.

Count and items share a read-only repeatable-read snapshot within one request;
different pages/requests may observe later changes. evaluatedAt is the server
instant used for default-window evaluation, not a vendor freshness timestamp.
Map clients must label pins as the displayed page's stops, not all matching stops.

Examples:

```bash
curl 'http://localhost:8080/api/vendor-stops'
curl --get 'http://localhost:8080/api/vendor-stops' \
  --data-urlencode 'from=2026-09-28T00:00:00-07:00' \
  --data-urlencode 'to=2026-09-29T00:00:00-07:00' \
  --data-urlencode 'q=taco' --data-urlencode 'lat=34' \
  --data-urlencode 'lon=-118' --data-urlencode 'radiusKm=25'
```

Empty results/beyond-last-page are 200 with items: []; totals remain accurate.
Invalid input returns 400 Problem Details. Database/transaction failures return
503 Problem Details with a safe message. No writable stop endpoint is provided.

## Verification

Run Maven clean verify using a separate empty PostgreSQL database and no dev
profile, as documented in README. Tests use synthetic coordinates, never claims
about actual vendor locations. They cover migration preservation, schema
constraints, boundary overlap, overnight/DST, search, distance/date-line/antipodes,
pagination, validation, error responses, and security. Fixtures roll back.

Next: review this contract and choose verified development stops and a map
provider. Coordinate the V3 number with teammates before merging. Operator
write/check-in features require authenticated ownership first.
