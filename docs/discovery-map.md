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

Run `npm --prefix frontend test -- src/features/discover/TruckMap.test.tsx`.
Tests use synthetic tile events and do not require a real key or external tiles.
In a browser, verify a real key, blank key, invalid key, blocked tile requests,
slow requests, retry after restoring connectivity, and truck links in the list.
Never include full tile request URLs (which contain the key) in public reports.

Provider guidance: https://myprojects.geoapify.com/help/api-keys/
Tile documentation: https://apidocs.geoapify.com/docs/maps
