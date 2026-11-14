# Saved pickup locations

Operators can maintain a private address book from **Schedule → Saved locations**. Locations belong to the operator profile resolved from the authenticated account, not to a client-supplied owner ID. They can be reused across that operator's trucks. No new library, map provider, or storage service is required.

## Workflow

1. Add a location nickname and a public venue/pickup landmark.
2. Search for an address using the existing address search, check/adjust the pickup pin, confirm it, and select the location's IANA time zone.
3. Save the location. A maximum of 100 active entries is supported; active names are unique per operator (case-insensitive).
4. In Add stop, edit, or Schedule again, choose **Choose saved location**. Its venue, address, pin and time zone are copied into the draft. Dates are not copied from the address book; local clock times remain as shown, so check them after changing zones.
5. Confirm the pin for this stop, select dates/times, and publish using the existing schedule API. Existing overlap, ownership, and pickup rules are unchanged.

Editing a location requires pin reconfirmation. Archiving requires confirmation and hides it from the picker; it does not delete the record. Published stops and order pickup snapshots never reference mutable address-book fields and are never rewritten. A draft already copied from a location remains a separate draft, even if the source is subsequently edited/archived.

## API

All endpoints require an enabled operator and return `Cache-Control: no-store`. Writes require the current CSRF token obtained from `/api/auth/csrf`. No automatic write retries.

| Method | Path | Contract |
|---|---|---|
| GET | `/api/operator/saved-locations` | Active locations, sorted by name; bounded to 100 |
| GET | `/api/operator/saved-locations/{id}` | Owned active or archived record |
| POST | `/api/operator/saved-locations` | Create; returns 201 and Location header |
| PUT | `/api/operator/saved-locations/{id}` | `{ "location": Details, "version": currentVersion }` |
| POST | `/api/operator/saved-locations/{id}/archive` | `{ "version": currentVersion }`; already-archived retries succeed without mutation |

Details: `name` (1–80), `venueName` (1–160), `address` (1–300), finite `latitude` (-90…90), finite `longitude` (-180…180), `timeZone` (supported IANA name), `locationConfirmed` (literal boolean true). Strings are trimmed. Response includes `id`, these location fields, `archived`, `version`, and `updatedAt`; no owner ID is exposed.

Foreign and absent IDs both return 404. Invalid input returns 400; stale edits, duplicate names, cap and archived edits return 409. Database outages return controlled 503 responses. Session role enforcement uses the existing security chain; ownership is rechecked in the transactional service.

Writes take an owner-scoped PostgreSQL transaction advisory lock after the existing ownership locks. This serializes cap/name/version checks across backend instances without upgrading shared operator-row locks. The database also enforces unique active names and coordinate/required-field constraints. Migration V26 adds only the address-book table/indexes; no existing application data is rewritten.

## Verification

- `SavedLocationApiTests`: CRUD/archive, account isolation, forged owner fields, CSRF/roles, invalid fields, versions, cap, duplicate names, and published-stop preservation.
- `SavedLocationConcurrencyTests`: competing duplicate creates yield one success and one controlled conflict, without deadlock.
- `SavedLocations.test.tsx`: draft copying, fresh pin confirmation, fresh CSRF/version, archive confirmation, uncertain-write blocking, and aborted reads on unmount.
- `saved-locations.spec.ts`: real authentication, PostgreSQL writes and schedule creation; edit/archive leave the published stop unchanged; a second owner gets 404. Only external address lookup is stubbed. Responsive layouts are checked at 375/768/1024/1440px.

Run frontend tests/build and `npm run test:e2e` in `frontend`. Run backend Maven tests against a disposable PostgreSQL database, never the application database. The browser runner creates and removes its own isolated Compose project.
