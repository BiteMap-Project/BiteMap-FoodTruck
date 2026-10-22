# SCRUM-78: Save and manage favorite trucks

Signed-in customers can save trucks and find them again on `/favorites`.

## Database

`V13__customer_favorite_trucks.sql` adds `customer_favorites`:

| Column | Notes |
| --- | --- |
| `user_id` | `app_users.id`, removed with the account |
| `vendor_id` | `vendors.id`, removed with the truck |
| `created_at` | When it was saved; the list is newest first |

The primary key is `(user_id, vendor_id)`, so a customer can save a truck only once.

## API

All endpoints require a signed-in account with `ROLE_CUSTOMER` (the security
configuration covers `/api/customer/**`). The customer is always the one in the
session; no endpoint accepts an account ID. Writes need a CSRF token.

| Request | Result |
| --- | --- |
| `GET /api/customer/favorites?page=0&size=20` | Page of `{ id, name, category, location, savedAt }`, newest first |
| `GET /api/customer/favorites/ids` | `{ "vendorIds": [...] }` (up to 1,000) to mark Save buttons |
| `PUT /api/customer/favorites/{vendorId}` | 204. Saving again is a no-op. 404 if the truck does not exist |
| `DELETE /api/customer/favorites/{vendorId}` | 204, even if it was not saved |

401 when signed out or disabled, 403 without CSRF or without the customer role,
400 for a non-numeric ID or out-of-range paging, 503 if the database is down.
Responses use `Cache-Control: no-store`.

## Frontend

- **Save button** (`features/favorites/FavoriteButton.tsx`) on truck cards,
  schedule cards and the truck page. It is a toggle button (`aria-pressed`) named
  "Save <truck name>", showing **Save** or **Saved**. Guests are sent to customer
  sign-in and brought back to the same page.
- One shared store (`favoritesStore.ts`) follows the signed-in account from
  `AuthContext`: it loads the saved IDs once per account, clears them on sign-out
  or when another account signs in, and a button only changes after the server
  confirms.
- **Favorites page** (`/favorites`) with loading, empty, error/retry and paging,
  plus a Remove button per truck. Guarded by `RequireAccount` (guests go to
  customer sign-in) and linked from the account navigation.
