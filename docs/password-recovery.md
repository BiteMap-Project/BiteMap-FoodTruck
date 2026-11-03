# Password recovery

One shared recovery flow serves customer, operator and administrator accounts.
Roles and truck ownership are never changed by a password reset.

## API

Both endpoints are anonymous-access POSTs, but still require a session CSRF token
from `GET /api/auth/csrf`, sent under its indicated header with session cookies.

- `POST /api/auth/forgot-password` with `{ "email": "person@example.com" }`:
  always 202 with the same generic message for existing, missing and disabled
  identities. It enqueues delivery; 202 is not a promise that SMTP accepted mail.
- `POST /api/auth/reset-password` with `{ "token": "...", "password": "..." }`:
  200 on success; malformed/expired/reused tokens return controlled 400 errors.
  Passwords use the existing 15–128-character policy and are not trimmed.
- 403: missing/invalid CSRF; 429: throttled, with `Retry-After`; 503: disabled
  recovery or unavailable database/limiter. No SQL/SMTP exception text is exposed.
- Responses use `Cache-Control: no-store`. Reset does not automatically sign in.

## Security and concurrency

Tokens contain 32 cryptographically random bytes, encoded base64url. Only SHA-256
hashes are stored, with a 15-minute expiry. Every reset locks the account row,
checks expiry/current credential version, changes the password using the existing
PBKDF2 encoder, increments `credential_version`, and deletes all that account's
reset tokens in one transaction. Simultaneous tokens cannot both succeed.

Existing sessions carry the credential version from login. Authenticated requests
recheck it against PostgreSQL; a mismatch invalidates the session. This works
across backend instances without an in-memory session registry. Requests already
authorized before the reset may finish; this is not cancellation of in-flight work.
Roles are not refreshed upward, and old queued recovery requests cannot mint
tokens after a successful reset. V17 initializes existing accounts at version 0.

The configured reset URL—not a request Host/forwarded header—is used in mail.
HTTPS is required except explicitly enabled localhost/127.0.0.1 testing. Tokens
travel in a URL fragment, never an HTTP query. The React page removes the fragment
using history replacement and retains it only in memory. Refreshing that page
requires reopening the email link. Password fields support show/hide and matching
confirmation. No writes are automatically retried; requests have a 20-second UI
deadline. Do not add third-party analytics to the reset page or log request bodies.

Database-backed token-bucket limits are independent of login limits:

| Operation | Capacity | Refill |
| --- | --- | --- |
| Request, global | 100 | 1 / 2 seconds |
| Request, client address | 10 | 1 / minute |
| Request, normalized email (HMAC key) | 3 | 1 / 15 minutes |
| Reset, client address | 20 | 1 / minute |

Unknown identities consume identical limit buckets. The existing trusted-proxy
rules still apply; the local Vite proxy can make browsers share one client bucket.

## Email queue and operational limits

The durable queue stores account IDs/credential versions, never raw tokens or
passwords. Unknown/disabled-account requests create null-identity jobs. Workers
select jobs with `FOR UPDATE SKIP LOCKED`, use bounded batches and generate tokens
only during delivery. SMTP connection/read/write timeouts are five seconds each.
Failed sends remove the tentative token and retry after one minute, at most three
attempts. RESET jobs older than 15 minutes are dropped. Successful reset enqueues
a notification without the password/token. Expired records are cleaned in bounded
batches; mail jobs are retained at most one day plus cleanup lag.

SMTP and PostgreSQL cannot commit atomically. A crash or uncertain SMTP response
can produce a duplicate email or a link whose database transaction did not commit.
Such links fail closed; the user can request another. This implementation favors
not persisting raw reset credentials over exactly-once email delivery.

Mail delivery briefly holds an account row lock and a DB connection. Monitor slow
SMTP and queue lag before scaling traffic; it does not block the request handler.
The worker continues retries after an application restart. Recovery can be disabled
without disabling ordering. SMTP is deliberately excluded from global health:
monitor `bitemap.recovery.mail` (`sent`, `retry`, `exhausted`),
`bitemap.recovery.worker.failures`, and `bitemap.recovery.cleanup.failures` separately.
Do not treat SMTP acceptance as inbox delivery; use provider bounce monitoring.

## Local testing

The development Compose stack includes **Mailpit**, bound only to loopback. It
captures messages locally; it does not send emails to Gmail or other real inboxes.

1. Run `docker compose up -d --build backend frontend mailpit` from the repository.
2. Use the same hostname throughout. Default frontend/reset origin is
   `http://localhost:5173`; override `PASSWORD_RESET_URL` in root `.env` if you use
   `127.0.0.1` or another local port. Do not replace existing `.env` contents.
3. Register a disposable test account and sign in in two browser profiles.
4. From either sign-in page choose **Forgot password?** and submit its email.
5. Open `http://localhost:8025`, open the reset email, and follow its link.
6. Enter matching new passwords. Check success, old-session rejection, old-password
   rejection, and fresh sign-in with the new password. Reopen the used link: it must
   fail. Requesting an unknown email must show the same confirmation without mail.
7. Mailpit contains sensitive reset links; never expose its UI/SMTP to the internet.
   Its local inbox is disposable and is not backed by a persistent volume.

Rebuilding the application applies V17 to its database. Automated tests instead
use a separate database and the disposable E2E stack on ports 15173/18025.

## Production enablement (not configured by this change)

Set `PASSWORD_RECOVERY_ENABLED=true`, `PASSWORD_RESET_URL=https://your-host/reset-password`,
`PASSWORD_RESET_FROM` to a verified sender, and `SMTP_HOST`, `SMTP_PORT`,
`SMTP_USERNAME`, `SMTP_PASSWORD`. SMTP authentication and required STARTTLS default
to true. Keep `PASSWORD_RESET_ALLOW_LOCAL_HTTP=false`. Configure SPF/DKIM/DMARC with
the mail provider, restrict outbound SMTP, use a secret manager, and verify real
delivery/bounces. Mailpit and the development Compose file are not production mail
infrastructure. Review recovery access for privileged admins before public launch
(email recovery is not MFA).

Design reference: https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
Local inbox: https://mailpit.axllent.org/docs/install/docker/
