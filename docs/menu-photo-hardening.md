# Menu photo validation and delivery

## Storage and dependencies

Keep the existing PostgreSQL `vendor_menu_items.image_data` / `image_media_type`
storage. This change needs no storage service, API key, bucket or schema migration.
TwelveMonkeys `imageio-webp:3.15.0` is a pure-Java decoder, not a storage SDK.
JDK ImageIO handles JPEG/PNG input and JPEG output. Review decoder dependency
updates regularly; accepting untrusted images is not risk-free.

For a larger deployment, evaluate object storage/CDN delivery and per-owner quotas
separately. Owner menu list and detail reads now use metadata projections, so
they do not fetch photo bytes. Entity-based writes and the photo endpoint still
load the stored image. See [menu read verification](menu-metadata-reads.md).

## Upload contract

`POST /api/operator/vendors/{vendorId}/menu-items/{itemId}/image?version=N`
uses multipart `file`, owner session and CSRF. Ownership and current item version
are checked before decoding. Availability, name and price are unchanged by this
endpoint. A successful photo replacement increments the item version.

- Nonempty JPEG, PNG or WebP only; MIME must agree with detected container.
- Maximum source bytes: 2 MiB (2,097,152).
- Maximum width/height: 6000 each; maximum decoded pixels: 12,000,000.
- Check dimensions before allocating the decoded raster. Reject malformed,
  truncated, animated PNG/WebP, unsupported formats and decoder warnings.
- Re-encode a new RGB JPEG at quality 0.85, maximum long edge 1600, preserving
  aspect ratio without enlarging. Transparent pixels are flattened onto white.
- Source metadata (including EXIF, GPS, comments, profiles) and original filename
  are not copied. The current decoder does not apply EXIF orientation; rotate
  photos to their intended pixel orientation before upload.
- Normalized output is limited to 2 MiB. At most two decodes run concurrently
  per backend instance; excess requests receive 503 / Retry-After: 3. This is a
  local resource safeguard, not a distributed rate limit or malware scanner.

Invalid file content/type/dimensions returns 400 ProblemDetail. Servlet multipart
limits return 413. Missing photos/items or wrong vendor/item combinations return
404. Role/CSRF and stale-version protections remain 403 and 409 respectively.
Database failures are sanitized 503 responses, not SQL details.

## Public delivery and UI

`GET /api/vendors/{vendorId}/menu-items/{itemId}/image` stays public. It returns
the stored media type, nosniff, and an ETag with public/no-cache (revalidation),
so a replaced photo is not held by the old five-minute freshness window.
Missing-photo exceptions are now covered by the menu exception handler.

Customer and operator cards replace failed images with their existing illustration.
They do not retry a failing URL in a loop; a changed versioned URL can load again.

Item details and photo uploads are separate requests. If details commit and the
photo fails, the form switches to editing that saved item and tells the owner
what happened. It does not silently repeat the create request. On ambiguous
network failure, reload to check before retrying; no write is auto-retried.

Workspace writes now have a 30-second deadline per operation, including CSRF
lookup and reading the response body. The details save and photo upload are
separate operations, each with this limit. A timeout does not roll back the server.
After a timeout or unconfirmed network response, menu editing is blocked until
the owner explicitly reloads the menu. The reload button remains usable, and
the UI does not automatically retry or claim that the photo failed to save.
The form's disabled state is separate from its in-flight state: a rejected,
stale or timed-out save must not continue displaying `Saving…`.

Existing photos are not rewritten or deleted. Old corrupt images may still fail
to render, but now have a fallback; replace them through the validated endpoint.

## Verification

Two regressions were run failing first: forged PNG content returned 200, and a
missing public photo raised an unhandled exception. Unit/API coverage exercises
real formats, metadata stripping, resize bounds, corrupt content, ownership,
CSRF, stale versions, missing images and sanitized database failures.

Run Maven verify only with an isolated PostgreSQL database. Run `npm test`,
`npm run build`, `npm run test:e2e:typecheck`, and `npm run test:e2e` in frontend.
The browser suite uses the existing randomly named disposable Docker stack:
it submits an invalid photo, retries the same item with a real WebP, verifies
JPEG delivery/rendering, and verifies owner/customer fallbacks. Application
volumes and real customer data are never used by these tests.

For a local reproduction with a specific photo, run
`BITEMAP_E2E_PHOTO=/absolute/path/to/photo.jpg npm run test:e2e` from frontend.
This uploads the file only into the disposable test stack, not your application
database. Without the variable, CI uses the built-in WebP fixture. The browser
test also withholds an upload response after the server commits and checks
timeout recovery, explicit reload, and the absence of duplicate items.

### File-picker session-refresh regression

Closing a native file picker can trigger window focus. Previously the shared
session refresh switched to `loading`, causing the route guard to unmount the
menu editor before Save was clicked. Focus checks now run in the background
without removing an already-authorized page. A successful check for the same
account preserves the draft and selected file. Expired sessions, revoked roles,
and failed session checks still block protected content; switching accounts
discards the old account's draft. Late checks cannot restore a session after
logout or a 401 response.

Regression tests cover all three shared route guards. The real-browser photo
test opens the file chooser and explicitly simulates focus both before and after
file selection, with a delayed real `/api/auth/me` response. This covers the
lifecycle missed by the original `setInputFiles`-only test. Native macOS dialog
behavior should also be checked manually: Edit item → choose photo → confirm the
editor and filename remain visible → Save item → confirm the rendered photo.
