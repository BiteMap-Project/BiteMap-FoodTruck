# SCRUM-30: Consumer truck discovery

As a consumer, I can browse and search food trucks so I can find a truck that
matches what I want and open its profile.

## Acceptance criteria

1. The discovery page loads trucks from `GET /api/vendors`; it does not use a
   hardcoded frontend list.
2. Search matches truck name, category, or location without regard to case.
3. Each result shows the truck name, category, location, and a link to the
   matching `/trucks/:id` profile.
4. Loading, empty database, no-match, later-page, and request-error states give
   the consumer clear feedback. Errors include a Retry button.
5. Results support stable pagination, and a new search returns to page one.
6. Superseded searches are cancelled so an older response cannot replace newer
   results.
7. Search and result links are keyboard accessible, and the page does not create
   horizontal scrolling at a 375-pixel viewport.

## Current scope

Search covers the vendor name, category, and stored location label. It does not
search menu-item text, calculate distance, use live GPS, or determine whether a
truck is currently open. Map and schedule discovery use the separate vendor-stop
foundation and remain follow-up work.

The frontend uses consumer-facing “truck” wording while the existing backend
continues to use `vendor` in table, class, and API names.

## Verification

Frontend tests cover database results, profile links, debounce behavior, encoded
search text, empty and error states, retry, pagination, stale responses, and
request cancellation. The backend API tests cover name/category/location search,
case handling, literal special characters, pagination, validation, security, and
safe database errors.

Manual verification:

1. Open `http://localhost:5173` and confirm the development trucks load.
2. Search for `taco`, `coffee`, or `Reseda`, then try a query with no matches.
3. Clear search and open a truck profile.
4. Check the page at a 375-pixel viewport and confirm there is no horizontal
   scrollbar.
