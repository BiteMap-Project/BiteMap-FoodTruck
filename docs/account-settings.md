# SCRUM-79: Customer account settings

Signed-in accounts (customers, owners and admins) can change their display name at
`/account`. The email is shown read-only. The sidebar's **Account settings** link
opens the page; guests are sent to customer sign-in and returned afterwards.

## API

`PATCH /api/account/profile`, authenticated, with a CSRF token:

```json
{ "displayName": "Casey C." }
```

- The account is always the session's account. Any `id`, `email`, `roles` or other
  field in the body is ignored, so one account can never edit another or change roles.
- The name is trimmed, required, at most 120 characters, and cannot contain line
  breaks or control characters (same limits as registration).
- Success returns `200` with the same shape as `GET /api/auth/me`, with `no-store`.
- `400` returns `{ detail, errors: { displayName } }`; `401` without a session;
  `403` without a CSRF token; `503` if the database is unavailable.

No migration is needed: it updates `app_users.display_name` and `updated_at`.

## Frontend

- `AuthContext.updateProfile()` saves through the API and replaces the shared
  account, so the navigation name updates immediately without a reload.
- The page validates the same rules before sending, shows loading ("Saving…"),
  success and failure messages, and keeps the typed name if saving fails.
- New `RequireAccount` route guard: any signed-in account; guests go to
  `/customer/login` with `returnTo`.

## Tests

- Backend `AccountSettingsTests`: own-row update and trimming, ignored
  id/email/roles, validation (blank, missing, 121 characters, line break, bad JSON),
  120-character limit, sign-in and CSRF required, owners can rename too.
- Frontend `AccountSettingsPage.test.tsx`: guest redirect, read-only email, CSRF
  PATCH and navigation refresh, client validation, 400/401/503 handling.
