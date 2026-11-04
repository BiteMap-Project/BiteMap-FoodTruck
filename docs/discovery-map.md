# Discovery map setup and recovery

The map uses Leaflet with Geoapify street tiles. It displays scheduled pickup
stops from the current results page, not live GPS or every nearby truck.

## Local setup

Get a development Geoapify key from the team or your own Geoapify project.
Never commit an actual key. Vite embeds this key in browser code: it is not a
server secret. Configure provider restrictions appropriate to your allowed
development origins and use a separate restricted key for production.

For Docker Compose, put `VITE_GEOAPIFY_API_KEY=your-key` in the repository-root
`.env`, then run `docker compose up -d --build frontend` from the repository root.
This recreates the frontend with the changed environment; backend/database
rebuilds and database resets are unnecessary.

For native Vite, export `VITE_GEOAPIFY_API_KEY` in the shell before running
`npm --prefix frontend run dev`. The root `.env` is not automatically loaded by
Vite running in `frontend/`. Restart Vite after changing the environment.
For a production build, supply the variable at frontend build time.

## Expected behavior

- Missing/blank key: configuration notice, no tile requests, stop list remains usable.
- Pending tiles: loading notice; requests still stalled after 15 seconds show recovery.
- Failed tiles: controlled message, pins and list remain available, manual Retry map.
- Retry reloads only the tile layer; it does not submit an order or change filters.
- A failed tile batch must not be reported as successful just because it finished.
- A later successful batch clears the error. Attribution stays visible.

## Verification

### Responsive and keyboard checks (2026-11-04)

Browser checks at 375px and 320px verified popup/card rendering, Enter activation,
keyboard access to popup actions, and the Skip interactive map focus target.
At 320px, document scroll width and viewport width both measured 320px.
On narrow screens, zoom controls are hidden while a popup is open so they cannot
cover its content; closing the popup restores them. The close target is 44px.

Coarse-pointer devices default to page scrolling over the map. Enable map gestures
opts into map dragging/pinch zoom; Use page scrolling reverses it. Unit tests cover
this toggle. Desktop dragging and explicit zoom buttons remain available.

Remaining release checks: real iOS/Android touch gestures and screen-reader use,
actual browser 200% zoom / enlarged text, and live offline/provider-failure browser
scenarios. In-app browser zoom shortcuts did not change the measured viewport;
narrow viewport checks are not claimed as actual zoom testing. Provider failure
and recovery remain covered by synthetic tile regression tests, without live keys.

### Map/list selection and directions

Show on map highlights a stop's marker and opens its popup without changing zoom.
Selecting a marker highlights its first stop card. For shared coordinates, the
popup lists each stop and offers Show in list to select and focus that exact card.
Selection is scoped to a stop ID, not a truck ID, and clears when filters change
or the selected stop disappears from refreshed results. Background refresh does
not reopen popups or refit the viewport.

Cards and popups offer Get directions in Google Maps (a new tab). The link uses
the scheduled stop's validated coordinates, never the truck profile location.
No customer origin or API key is included; the external provider handles origin
selection. Invalid coordinates suppress directions. Venue name and address are
shown; the current API has no separate landmark field. Directions are not proof
that the truck is still serving. Confirm current pickup availability before travel.

Verify card → pin → popup → matching card with keyboard and pointer, including
two stops at one location. Repeat after manual refresh, filter/page changes and
tile failure. Check the destination URL without requiring live Google Maps in CI.

### Schedule freshness

Schedule results refresh 30 seconds after each completed request while the page
is visible. Returning to the tab or reconnecting triggers a refresh immediately;
overlapping requests are suppressed. Requests time out after 15 seconds. Relative
date windows are recalculated for each request, so ended or cancelled stops drop
out when the server no longer includes them in the selected results.

The last-update time is the browser's last successful response time, not a live
GPS timestamp. Failed background requests retain the last results with a stale
warning and replace serving-status labels with “Status unconfirmed.” Refresh stops
offers a manual retry. Filters and the map viewport survive background updates;
Fit pins explicitly fits the current results. Changing filters loads a new map view.

Run `npm --prefix frontend test -- src/features/discover/StopResults.test.tsx src/features/discover/TruckMap.test.tsx`.
Regression tests cover expired-result removal, retained stale results, recovery,
hidden tabs, overlapping requests, timeouts, ignored delayed responses, and map
viewport preservation. In the browser, check the last-update time, Refresh stops,
tab return, filters, zoom/pan preservation, and reconnect behavior. Checkout still
performs its own server-side availability validation; these updates do not reserve
a stop or guarantee it remains available.

Run `npm --prefix frontend test -- src/features/discover/TruckMap.test.tsx`.
Tests use synthetic tile events and do not require a real key or external tiles.
In a browser, verify a real key, blank key, invalid key, blocked tile requests,
slow requests, retry after restoring connectivity, and truck links in the list.
Never include full tile request URLs (which contain the key) in public reports.

Provider guidance: https://myprojects.geoapify.com/help/api-keys/
Tile documentation: https://apidocs.geoapify.com/docs/maps
