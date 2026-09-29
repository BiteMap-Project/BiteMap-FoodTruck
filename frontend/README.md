# BiteMap frontend

Discovery loads database-backed vendors from GET /api/vendors. Search is
debounced by 300 ms and searches name, category, and location on the backend.
Results use 20-item pages. Loading, empty results, request errors, and retry are
displayed explicitly. Superseded requests are cancelled and ignored.

Cards link to `/trucks/:id`, which fetches the selected vendor and its menu from
`GET /api/vendors/{id}`. Profiles show name, category, and location. Menu prices
are formatted as USD and unavailable items are labeled. Loading, empty menus,
not-found, errors, and Retry are supported. No hardcoded truck data or hours are
shown. Direct URLs and refresh work through the development server; production
hosting must provide an SPA fallback for `/trucks/*`.

The development profile includes sample menus for the three sample vendors.
Other vendors can still exercise the empty-menu state.

See [profile and menu contract](../docs/truck-profile-menu.md).

## Development

From the repository root, run `docker compose up --build`, then open
http://localhost:5173. Compose sets API_PROXY_TARGET=http://backend:8080.

For a frontend running directly on your machine:

```bash
cd frontend
npm ci
npm run dev
```

Start the backend separately. Vite proxies /api to http://localhost:8080 by
default. If the backend uses another port, set API_PROXY_TARGET in the process
environment before starting Vite. This is a server-side development setting,
not a browser secret. No broad backend CORS policy is needed.

Production hosting must route /api to the backend on the same origin.
The Vite development proxy is not included in the static build; production
deployment remains a separate task.

## Checks

```bash
npm run lint
npm test
npm run build
```

The same checks can run with `docker compose exec frontend` prefixed to each
command after rebuilding. Tests mock HTTP responses and exercise the rendered
discovery page, including stale responses, failures, retry, search, and paging.
Backend integration tests independently exercise PostgreSQL and the API.

Manual smoke check: open discovery, search for taco, clear search, and try a
query with no results. In browser developer tools, /api/vendors requests should
use the frontend origin and return JSON. Browser offline mode can exercise the
error and Retry state. Development data only has three vendors, so pagination
is covered using larger mocked responses in tests.
