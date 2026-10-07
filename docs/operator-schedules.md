# SCRUM-29: Owner-protected schedule management

Branch: `feature/scrum-29-owner-schedules`.
The operator workspace Schedule tab uses the management API to list, create,
edit and cancel stops for the selected owned truck.
Existing public schedule/nearby discovery reads the same `vendor_stops` table
and sees published changes on its next request. This is planned location data,
not live GPS tracking or evidence a truck is physically serving.

## Rules

- An enabled authenticated operator can manage only explicitly owned vendors.
  Missing, unowned, foreign, and disabled-account targets return the same 404.
- One-time stops only; recurring schedules are not included.
- Future start, strictly later end, end no later than 2100-01-01T00:00:00Z.
  Overnight stops are valid. No automatic travel buffer is imposed.
- Overlapping scheduled/serving stops for the same vendor return 409 regardless
  of address. Intervals are half-open `[start,end)`; touching boundaries are valid.
  Different vendors owned by the same operator can overlap.
- Venue/address and finite in-range coordinates are mandatory. No geocoding or
  address/coordinate correspondence verification is provided in this phase.
- Send an IANA zone and explicit offsets. Offsets must be valid for each local
  date/time in that zone. Nonexistent daylight-saving times fail; repeated hours
  are disambiguated by the supplied offset. Responses use UTC instants plus the
  original zone, so clients must format in that zone, not the browser default.
- Only future `scheduled` stops can be edited. Ongoing scheduled/serving stops
  can be cancelled. Completed history cannot be edited or cancelled.
- Cancellation retains the row. Repeating cancellation with its current version
  returns the same record; an old version returns 409. No DELETE endpoint exists.
- No automatic transition to `serving` or `ended` is added. Existing discovery's
  time-window logic still excludes elapsed stops; history may retain `scheduled`.

## API

All paths start with `/api/operator/vendors/{vendorId}/stops`.

| Method | Suffix | Response |
| --- | --- | --- |
| POST | (none) | 201, saved stop, Location header |
| GET | `?page=0&size=20` | 200, history page (newest start first, then id) |
| GET | `/{stopId}` | 200, owned stop |
| PUT | `/{stopId}` | 200, replacement details with incremented version |
| POST | `/{stopId}/cancel` | 200, retained cancelled stop |

Management successes use `Cache-Control: no-store`. Page is 0–10000, size is
1–100. Reads do not require CSRF; writes require session cookies and a fresh
`X-CSRF-TOKEN` fetched from `/api/auth/csrf`. Login refreshes the token.

Create request (choose future dates when testing):

```json
{
  "venueName": "Campus lunch stop",
  "address": "18111 Nordhoff St, Northridge, CA",
  "latitude": 34.24,
  "longitude": -118.53,
  "startsAt": "2030-01-02T11:00:00-08:00",
  "endsAt": "2030-01-02T14:00:00-08:00",
  "timeZone": "America/Los_Angeles"
}
```

The response includes `id`, `vendorId`, these business fields, `status`, `version`,
`createdAt`, and `updatedAt`. New records are always `scheduled`, version 0;
request fields cannot select ownership or force a status.

For PUT send `{"stop": { ...all create fields... }, "version": 0}`.
For cancellation send `{"version": 0}` using the latest response version.
After a 409, reload and let the operator reconsider the edit; do not retry blindly.
400 means invalid input; 401 requires login; 403 means role/CSRF failure;
404 hides resource existence; 503 means database unavailable. Error responses do
not expose SQL. Session/security-filter errors retain the existing auth format.

## Concurrency and persistence

Service-level transactions first lock the enabled operator row FOR SHARE, then
the owned vendor row. Writes use FOR UPDATE on that vendor, so simultaneous
schedule writers for one truck serialize. Reads use FOR SHARE. Read-list count
and results share a REPEATABLE READ snapshot. Writes use READ COMMITTED so a
writer waiting on the vendor lock checks overlaps against the previous commit.
Updates/cancellation also compare and predicate the write on the current version.
There is no per-stop ownership query loop.

This overlap guarantee covers this service's write path, not arbitrary direct SQL.
Any future importer/admin writer must use the same locking protocol (or add an
appropriate database constraint after auditing legacy overlaps). Existing data is
not silently rewritten, cancelled, or deleted. The development fixture callback
still controls only its reserved demo IDs; these unowned fixtures are not operator
managed. Do not assign those reserved demo vendors to real operators.

V7 adds a nonnegative `version` column with default 0. V1–V6 are unchanged.
Apply on staging and back up production before deployment. Starting a newly built
backend will apply V7 through Flyway. Rollback of application code should leave
the additive column in place rather than rewriting migration history.

## Verification

### Frontend flow

After rebuilding the backend (which applies additive V7), open
`http://localhost:5173/operator`, sign in, select an owned truck and choose
**Schedule**. Do not use the standalone HTML demo on port 5500.

1. Add a stop using a future date, venue, address, coordinates and IANA time zone.
   For CSUN, example coordinates are `34.24, -118.53`; verify actual locations
   before publishing real schedules. Coordinates are entered manually, not geocoded.
2. Reload and verify persistence. Dates display in the saved zone regardless of
   the browser zone. Overnight intervals are allowed. Skipped DST hours are
   rejected; repeated hours require choosing the UTC offset.
3. Try an overlapping stop for the same truck: expect 409 with no automatic retry.
   The draft remains visible. **Reload schedule (discard draft)** discards it
   explicitly; reconsider the edit with current data. Different trucks may overlap.
4. Edit a future stop; the request sends its stored version. In two browser tabs,
   editing the same version should produce a conflict in the second tab.
5. Cancel a stop, confirm, and verify its retained Cancelled history. Completed
   stops cannot be edited/cancelled. “Completed” also labels elapsed intervals;
   it does not claim the truck actually served or change the stored status.
6. Check empty pages, read failures/reload, expired sessions and mobile layout.
   Paging and pending-write controls prevent duplicate submissions. Switching
   trucks/tabs discards unsaved forms; late responses do not update the next screen.

Frontend tests exercise API payloads, fresh CSRF, versioned updates/cancellation,
confirmation, empty/error states, pagination, duplicate submissions, unmounts,
conflicts, access failures and DST conversion. Run `npm run lint`, `npm test`, and
`npm run build` in `frontend`. Browser visual verification is still required.

### Backend verification

Tests cover create/read/update/cancel, public visibility, ownership for every
operation, child-parent substitution, roles, CSRF, disabled accounts, forged
ownership/status, overlapping and adjacent intervals, different trucks, stale
versions, pagination, coordinates, overnight/DST behavior, retention, database
errors and migration preservation. A real PostgreSQL concurrency test holds one
truck's write open, verifies a sibling truck proceeds, then proves the competing
same-truck request fails rather than double-booking.

Manual flow: register/login with disposable local accounts, create an owned
vendor, fetch fresh CSRF in Swagger, POST a stop, repeat to see 409, publish the
same interval for another owned vendor, edit using version 0, and cancel using
the returned version. Query public `/api/vendor-stops` with a range covering the
example dates before/after cancellation. Test a second operator cannot read or
mutate the first operator's management resources. No customer alerts are sent.
