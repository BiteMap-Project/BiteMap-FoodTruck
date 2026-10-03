# Operator login, session, and logout — SCRUM-46

This adds backend authentication for registered operators. No frontend login
screen, vendor assignment, ownership permissions, JWT, or new migration is included.
The existing password hashes and `operators` table are reused. Generated Spring
form login and HTTP Basic are disabled.

## API

| Method and path | Success | Purpose |
| --- | --- | --- |
| GET `/api/auth/csrf` | 200, `headerName` and `token` | Obtain a CSRF token and session cookie |
| POST `/api/auth/login` | 200, `id`, `displayName`, `email` | Verify credentials and save the authenticated session |
| GET `/api/auth/me` | 200, same public account fields | Read the current enabled operator |
| POST `/api/auth/logout` | 204, no body | Invalidate session, clear CSRF and expire `JSESSIONID` |

Login accepts JSON:

```json
{"email":"owner@example.com","password":"your exact registered password"}
```

Emails are stripped/lowercased; passwords are never trimmed. Email must be valid
and at most 320 characters, password nonblank and at most 128 Java string code
units. Login does not reapply registration's minimum password length.

- `400`: missing/invalid fields or malformed JSON, without echoing credentials.
- `401`: invalid credentials; wrong password, unknown email, and disabled account
  have the same generic response. `/me` also returns 401 without a valid session
  or when the account has been removed/disabled.
- `403`: missing/invalid CSRF on a POST. These filter responses need not use the
  same problem JSON format as controller errors.
- `503`: authentication database/service unavailable; no internal details exposed.

Responses are not cacheable. Credentials and hashes are not returned. Spring's
authentication provider erases credentials from the authenticated session principal.
An unsuccessful login does not replace an already-authenticated session; explicitly
log out before switching accounts. Logout is idempotent but always needs a valid
CSRF token, even for an anonymous session.

## Browser and Swagger flow

1. Fetch `/api/auth/csrf` and preserve the session cookie.
2. POST login JSON with the returned header name/token and that cookie.
3. Login rotates the session ID and clears the old CSRF token. The browser accepts
   the new session cookie automatically. Fetch a **fresh** CSRF token.
4. GET `/api/auth/me` with the cookie to restore frontend login state.
5. POST logout with the fresh token and cookie. Fetch another token before later
   registration/login requests. Handle the empty 204 without parsing JSON.

In Swagger, execute the CSRF endpoint and paste its token into **Authorize →
csrfToken** before a POST. Repeat after login/logout. Swagger retains the browser
cookie automatically. Use `/api/auth/me` to confirm login, then confirm it returns
401 after logout. Registration creates real local accounts; use disposable data.

The React client should use relative `/api/...` URLs through the existing proxy
and `credentials: 'same-origin'`. Do not put passwords or session IDs in browser
storage. A separate-origin deployment requires a reviewed cookie/CORS design;
this story does not enable permissive cross-origin access.

## Session lifecycle and deployment limits

Sessions are held in the backend's memory and expire after 30 minutes of inactivity.
Restarting the backend loses them. `JSESSIONID` is HttpOnly, SameSite=Lax, and
cookie-only (not placed in URLs). Local HTTP uses non-Secure cookies; production
must use HTTPS and set `SESSION_COOKIE_SECURE=true` in the backend environment.
Multiple replicas need a shared session store or another explicit deployment design.

Disabling an account blocks new login and `/me`; this is not yet a general-purpose
session-revocation mechanism for future protected business endpoints. Those must
enforce active-account and vendor-ownership authorization in their own story.
Before public release add login/registration abuse protection, email verification,
password recovery, safe security audit events, and deployment/session hardening.
Do not enable credential request-body or SQL-parameter logging.

Implementation follows Spring's [explicit session persistence](https://docs.spring.io/spring-security/reference/servlet/authentication/session-management.html)
and [logout handling](https://docs.spring.io/spring-security/reference/servlet/authentication/logout.html).

## Verification

Run `./mvnw clean verify` in `Backend` with Java 21 and `DB_URL`, `DB_USERNAME`,
and `DB_PASSWORD` pointing to an isolated PostgreSQL test database, without the
development fixture profile. Session tests roll back their account inserts.
Tests cover the full CSRF/login/me/logout flow, session-ID rotation, credential
erasure, disabled/unknown/wrong-password failures, malformed and oversized input,
password spaces, anonymous access, old CSRF rejection, safe database failure,
Swagger contracts, and existing public APIs.
