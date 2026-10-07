# Connected operator workspace

Both `/owner` and `/operator` now restore the existing operator session before
loading private data. Login still redirects to `/operator`. Anonymous sessions
return to `/operator/login`; failed session checks offer a retry.

## Included

- Paginated owned-truck list, first-truck creation, profile editing and selection.
- Paginated management menu with all three availability states.
- Create items; edit name, description and price; change availability separately.
- Fresh session-bound CSRF token before every write, with same-origin cookies.
- Menu version sent on edits/status changes; conflicts require an explicit reload.
- Loading, empty, retry, save-pending and access-denied states.
- Server-confirmed results only: no optimistic success, automatic write retries,
  browser-local business data, or client-supplied ownership.

The backend remains the authority for ownership and validation. Frontend checks
and route protection are usability measures, not substitutes for authorization.
Vendor profiles retain the existing last-write-wins contract; menu edits use the
backend's optimistic version contract. Switching trucks resets the menu editor
and pagination, aborts old reads and ignores late responses.

## Design and scope

`features/operator/owner-design.css` preserves the stylesheet from Hayk's original
`BiteMap-Owner-Readable.html`, excluding its global body/root styles. React owns
the connected workspace markup; `workspace.css` styles the real forms and states.
The original HTML and simpler demo component remain untouched as design references,
but neither is mounted on the live `/owner` route. This is the functional first
integration, not a claim of pixel-for-pixel reproduction of every demo panel.

Orders, revenue, schedule editing, and open/closed controls have no management
integration here. They are not simulated as live business metrics. The workspace
links to private operational metrics filtered to the signed-in operator's trucks.
The current public menu exposes a boolean availability: INACTIVE and SOLD_OUT
both appear unavailable, and inactive items remain listed.

## Verify locally

1. Start the normal local app and sign in at `/operator/login` using a disposable
   development account. `/owner` must require the same login.
2. Create a truck if none is owned; existing public sample trucks are not
   automatically assigned to your account.
3. In Menu, create an item; reload the browser and confirm persistence.
4. Edit its name/price; change its status. Follow View customer menu and refresh
   that page to see the saved public result (there is no live push subscription).
5. Use two tabs to edit the same menu item. A stale write must show a conflict,
   preserve entered fields, and require Reload menu before another edit.
6. Log out, sign in with a second account and confirm the first account's trucks
   are absent. Direct foreign-resource requests must still be rejected by Java.

`npm test` covers session restoration, owner-route redirect, empty truck lists,
create/update payloads, CSRF, status/version writes, validation, denied access,
session expiry, stale saves, error preservation, paging and late read responses.
`npm run lint` and `npm run build` verify static checks and the production bundle.

Writes act on the selected development database. After an interrupted create
request, refresh the truck/menu list before retrying to avoid duplicate records.
