# Menu photo validation and delivery

## Storage and dependencies

Keep the existing PostgreSQL `vendor_menu_items.image_data` / `image_media_type`
storage. This change needs no storage service, API key, bucket or schema migration.
TwelveMonkeys `imageio-webp:3.15.0` is a pure-Java decoder, not a storage SDK.
JDK ImageIO handles JPEG/PNG input and JPEG output. Review decoder dependency
updates regularly; accepting untrusted images is not risk-free.

For a larger deployment, evaluate object storage/CDN delivery and per-owner quotas
separately. The current menu entity eagerly loads photo bytes; large menus should
eventually use metadata projections rather than fetching blobs for list pages.

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
