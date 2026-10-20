# Automated ordering journey

## Run locally

Prerequisites: macOS/Linux (or WSL2), Docker running, Node 24, and free localhost port 15173.
From `frontend/`:

```sh
npm ci
npx playwright install chromium
npm run test:e2e:typecheck
npm run test:e2e
```

The runner builds the real frontend and backend, migrates an empty PostgreSQL
database, runs Chromium, and removes its own randomly named test stack in a
`finally` block. It never uses the application `.env`, development database,
published database ports, or application volumes. PostgreSQL data lives in tmpfs.
Do not change this suite to target a shared/staging/production database.

The test setup registers disposable accounts through the real API. Only fixture
provisioning (operator roles and already-active schedules) uses SQL, explicitly
against `bitemap_e2e` in this run's test container. Trucks and menu items for the
main journey are created through owner-protected APIs. No test backdoor is added
to the application. Each browser context has independent cookies and storage.

## Coverage

- Customer and owner sign in through their actual UI.
- Customer discovers a truck, opens its menu, adds an item, changes quantity,
  reviews pickup location, and checks out.
- Checkout disables repeated clicks; a real committed response is deliberately
  lost and retry returns the original order without losing the cart.
- Concurrent first submissions and repeated requests share one order; changed
  contents under the same key conflict. Client-supplied prices cannot set totals.
- Correct owner sees the order and advances Placed → Accepted → Ready → Completed.
- Customer sees each change through actual polling, without clicking refresh,
  and can reload/reopen the saved receipt from My orders.
- Cancellation reason reaches the customer; stale owner commands conflict.
- Anonymous access, cross-customer access, cross-owner reads/writes, wrong roles
  and missing CSRF are rejected by the actual server.
- Negative seed-style vendor/item/stop IDs can check out. A sold-out item fails
  without losing the cart; cancelled pickup blocks UI and forged API checkout.
- Removing session cookies and refreshing hides protected receipt contents.

The browser suite complements—not replaces—the Maven integration/concurrency
tests and Vitest component/service tests. It does not test online payments,
emails, other browsers, mobile layouts, load capacity or production hosting.
No payment is collected by these tests.

## CI and failures

The `Ordering journey (real browser and PostgreSQL)` job runs on PRs to main and
pushes to main. Add it as a required check in branch protection after its first
successful GitHub run. Existing frontend/backend jobs remain unchanged.

Retries are disabled: failures must be investigated, not hidden by a passing
retry. Local failures retain screenshots and traces in ignored output folders.
Traces may contain session cookies: do not commit or publish them. CI disables
traces and does not upload browser artifacts.

```sh
npx playwright show-report playwright-report
```

If the process is forcibly killed, its cleanup cannot be guaranteed. Inspect
`docker compose ls` and remove only the exact `bitemap-e2e-xxxxxxxx` project left
by the interrupted run, using `docker-compose.e2e.yml`. Never run cleanup against
the normal `bitemap` project or its database volume.
