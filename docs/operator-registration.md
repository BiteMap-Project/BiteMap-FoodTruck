# Operator registration — SCRUM-45

## Scope

Creates an enabled operator in the existing `operators` table from migration V5.
No new migration is needed. Registration does not log the operator in, issue an
access token, assign a vendor, or implement customer registration. The frontend
registration screen and operator login are separate tasks. Existing development
Spring Security login remains unchanged.

## API contract

First call `GET /api/auth/csrf`, preserving the session cookie. It returns
`headerName` and `token`. Send that header and the same cookie with
`POST /api/auth/register`, using `Content-Type: application/json`:

```json
{
  "displayName": "Example Operator",
  "email": "operator@example.com",
  "password": "a long example passphrase"
}
```

Rules:

- Display name: required, stripped of surrounding whitespace, at most 120 characters.
- Email: required, valid email format, stripped and lowercased, at most 320 characters.
- Password: required, not all whitespace, 15–128 Java string code units (most
  characters count as one; supplementary Unicode characters count as two).
  Spaces are preserved. No arbitrary symbol/uppercase requirement.

Success is HTTP 201 with only `id`, `displayName`, and `email`. Responses have
`Cache-Control: no-store`. Neither a password nor its hash is returned.

| Status | Meaning |
| --- | --- |
| 201 | Account created |
| 400 | Invalid fields or malformed JSON; validation problems include an `errors` map |
| 403 | Missing/invalid CSRF token or mismatched session |
| 409 | Email already registered, ignoring case |
| 503 | Database unavailable; retry later |

Controller errors use `application/problem+json` and never include rejected
passwords or database exception details. CSRF failures occur in Spring Security
before the controller, so clients must not assume they share that JSON format.

## Browser integration example

Use the frontend's same-origin `/api` proxy; do not hardcode a backend hostname.

```javascript
async function registerOperator(displayName, email, password) {
  const csrfResponse = await fetch('/api/auth/csrf', {
    credentials: 'same-origin',
  });
  if (!csrfResponse.ok) throw new Error('Unable to start registration.');
  const csrf = await csrfResponse.json();
  return fetch('/api/auth/register', {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      [csrf.headerName]: csrf.token,
    },
    body: JSON.stringify({ displayName, email, password }),
  });
}
```

The caller should handle each status, show safe validation messages, and never
log the request body. Opening the POST URL in a browser address bar is not a
registration request.

## Storage and security

Passwords use salted PBKDF2-HMAC-SHA256 with 600,000 iterations, a random 16-byte
salt, and a 256-bit output. A Spring delegating-encoder prefix identifies the
format for future password-hash upgrades. Passwords are not encrypted/recoverable.
The database's unique index plus a single `INSERT ... ON CONFLICT` statement
prevents duplicate email rows without a check-then-insert race.

This is not a complete production authentication system. Before public launch,
add operator login/logout and authorization, registration rate limiting (hashing
is deliberately expensive), email verification/recovery, breached-password
screening, and production TLS/session-cookie configuration. The explicit 409
response reveals whether an email is registered; review that privacy tradeoff
before launch. Never enable request-body/SQL-parameter logging for credentials.

References: [Spring CSRF documentation](https://docs.spring.io/spring-security/reference/7.0/servlet/exploits/csrf.html),
[OWASP password storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html),
[OWASP authentication guidance](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html).

## Verification

Run `./mvnw clean verify` from `Backend` with Java 21 and `DB_URL`, `DB_USERNAME`,
and `DB_PASSWORD` pointing to a dedicated disposable PostgreSQL test database.
Do not run the tests against a teammate's or production database. Do not enable
the development sample-data profile in the test environment.

Registration tests cover normalized input, salted hashes, preserved password
spaces, password boundaries, invalid/missing fields, duplicate emails without
overwriting accounts, CSRF/session handling, malformed JSON, no automatic login
or vendor assignment, safe responses, and simulated database failure. Successful
registration test inserts are rolled back.
