# SCRUM-35: Consumer search and filters

The Discover page (`/`) has two views that share one search box:

| View | API | Filters |
| --- | --- | --- |
| **All trucks** (default) | `GET /api/vendors` | Text search |
| **Schedule & nearby** | `GET /api/vendor-stops` | Text search, cuisine, when, distance |

## Schedule & nearby filters

- **Cuisine**: free text sent as `cuisine`. The server matches vendor category
  exactly (case-insensitive), so the input suggests categories already seen in
  results. A categories endpoint would make this a proper dropdown later.
- **When**: sent as `from`/`to` (ISO-8601, UTC):
  - *Open now*: stops overlapping the current minute.
  - *Later today*: now until local midnight.
  - *Next 7 days*: no `from`/`to`, so the server default applies.
  - *Pick dates*: local midnight of the start date through the end of the end
    date (inclusive). The browser checks the range before calling the API
    (both dates set, end not before start, at most 31 days).
- **Distance**: *Near me* uses browser geolocation. Coordinates are rounded to
  4 decimals (~11 m) before they are sent. Radius choices are 1, 5, 10, 25 and
  50 miles, converted to `radiusKm`. Results are then ordered nearest first and
  show distance in miles.

Any filter change returns to page 1. *Clear filters* resets everything except
the search text. Stop times are shown in each stop's own `timeZone`.

A 400 response shows the server's `detail` message. Location permission denied
or unavailable is explained inline, and the current results stay visible.

## Not included

- Filters are not saved in the URL yet.
- No map. Stops include coordinates, so a map view can build on this page.
- There are no development fixtures for `vendor_stops`, so the schedule view is
  empty on a fresh database until stops are inserted.
