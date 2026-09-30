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

## Development sample schedules

With the `dev` profile (enabled by Docker Compose), an `afterMigrate` callback
in `db/dev` inserts or refreshes six fictional stops after vendor fixtures load.
No production migration or default-profile configuration includes this data.
All sample venues are labeled `[DEMO]`; coordinates are approximate landmarks.

| Stop | Time relative to backend startup | Status |
| --- | --- | --- |
| Soup at CSUN | One hour ago through two hours ahead | Serving |
| Tacos at CSUN | Two through four hours ahead | Scheduled |
| Coffee at Reseda | 24 through 27 hours ahead | Scheduled |
| Tacos at Santa Monica | 24 through 27 hours ahead | Scheduled |
| Soup at CSUN | Four through two hours ago | Ended (hidden) |
| Coffee at Reseda | Two through four hours ahead | Cancelled (hidden) |

Run `docker compose up --build -d --wait` after pulling this change.
Later, `docker compose restart backend` refreshes the sample times without
deleting the database. Reserved stop IDs -201 through -206 are overwritten;
create your own stops with generated IDs to preserve edits across restarts.
Vendor and menu edits are preserved. Samples age normally while the app runs;
restart before demos. The +2 hour stop may fall tomorrow near midnight.

Try these checks immediately after startup:

- Next 7 days: four visible stops; Open now: the Soup stop only.
- Cuisine `Tacos`: two stops; `Sushi`: empty results.
- Pick dates: tomorrow includes the Reseda and Santa Monica stops.
- For repeatable distance checks use the API with `lat=34.2400&lon=-118.5291`:
  `radiusKm=1.609344` includes two CSUN stops; `radiusKm=8.04672` also includes
  Reseda; `radiusKm=40.2336` includes Santa Monica. These match 1, 5, and 25 miles.
- In the UI, Near me uses your actual browser location, so results depend on
  where you are. Ended/cancelled samples never appear in public results.
