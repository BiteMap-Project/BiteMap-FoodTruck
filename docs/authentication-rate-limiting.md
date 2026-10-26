# Authentication rate limiting

## Scope and behavior

`POST /api/auth/login` and `POST /api/auth/register` now check shared PostgreSQL
token buckets after CSRF and DTO validation, before password verification/hashing.
Other endpoints, existing sessions, and logout are not limited by these buckets.
Both successful and failed admitted attempts consume allowance. No request is
automatically retried. These limits reduce abuse; they do not make the application
immune to credential stuffing, distributed denial of service, or resource exhaustion.

| Bucket | Burst capacity | Replenishment |
| --- | ---: | --- |
| Login per normalized email | 10 | 1 attempt / 60 seconds |
| Login per connection IP | 60 | 1 attempt / 5 seconds |
| Registration per connection IP | 5 | 1 attempt / 720 seconds |

These are initial tunable values, not traffic-tested production sizing. Shared
campus/NAT IPs need observation and tuning. An attacker may temporarily exhaust
another user's email allowance; there is no permanent lockout and rejected
requests do not extend the cooldown. Email/account existence is not queried by
the limiter. Existing registration's duplicate-email 409 behavior is unchanged.

429 responses use `application/problem+json`, `Cache-Control: no-store`,
`code: AUTH_RATE_LIMITED`, `retryAfterSeconds`, and integer-seconds `Retry-After`.
No bucket name/account existence is disclosed. A retry can still be denied if
other concurrent requests consume the replenished allowance. Limiter database
errors/timeouts fail closed with sanitized 503 responses.

All four customer/operator login/registration pages show a retry countdown,
disable submission during the cooldown, and never resubmit credentials. A 429
does not clear authentication state. Reloading the page may clear the UI timer,
but cannot bypass server enforcement.

## Configuration and deployment requirements

Non-development startup **requires `AUTH_RATE_LIMIT_SECRET`**, at least 32
characters. Generate a cryptographically random value (e.g. `openssl rand -hex 32`)
and store it in the deployment's secret store. All instances must use the same
secret and limits. Do not commit it. Changing the key creates new bucket identities
and effectively resets limits; coordinate rotation and monitor it.

The explicit `dev` profile has a public development-only fallback key. Compose
already enables this profile. Never use this profile/key for a public deployment.
Maven tests and the disposable browser stack have separate test-only keys. Test
resources raise capacities for unrelated test cases; dedicated tests override them
with small limits, and browser tests exercise the real default policy.

Properties under `bitemap.auth-limit` (standard Spring environment binding):
`login-account-capacity`, `login-account-refill-seconds`, `login-ip-capacity`,
`login-ip-refill-seconds`, `registration-ip-capacity`,
`registration-ip-refill-seconds`. Capacities must be 1–100000; refill seconds 1–86400.

### Client address and reverse proxies

The implementation uses `request.getRemoteAddr()` and explicitly sets
`server.forward-headers-strategy: none`. It ignores client-supplied `Forwarded`
and `X-Forwarded-For`. **There is no trusted-proxy address extraction implemented
yet.** Vite and other reverse proxies therefore share their IP allowance across
their clients. Account limiting still distinguishes emails.

Before public deployment, configure a trusted ingress that strips untrusted
headers and implement/test a trusted-proxy resolver for that exact topology.
Do not simply enable arbitrary forwarded headers. Ingress connection/request-size
limits, network-level rate limits and HTTPS remain required: this application
limiter runs after parsing/validation and does not cap malformed request traffic.
IPv6 prefix aggregation and distributed-attack controls are separate follow-ups.

## Persistence and transactions

Flyway V16 creates `auth_rate_limits`; no account/vendor/order records change.
Keys are scope-separated HMAC-SHA256 hashes, not raw emails/IPs. Account credentials
are never stored in this table. PostgreSQL time governs refill; backward clock
movement cannot create extra credits. Node-local memory is not the source of truth.

Each attempt locks the IP bucket, then the account bucket, using short independent
`REQUIRES_NEW` transactions. No password hashing occurs while bucket locks are held.
Allowance is consumed only if all required buckets admit the attempt. Failed
authentication cannot roll back allowance. An exhausted IP stops processing before
creating another email bucket, bounding per-IP key churn.

Lock waits are capped at 1.5 seconds, SQL statements at 3 seconds, and the consume
transaction at 5 seconds. Connection pool acquisition has its own datasource timeout;
size and monitor the pool for the deployment. High-volume edge filtering is still
needed to avoid overloading PostgreSQL with rejected requests.

Scheduled cleanup removes at most 500 expired rows per minute per instance with
`SKIP LOCKED`. Expiry is at least a full refill plus one idle day after admission.
Adjust cleanup throughput if unique traffic grows; monitor table size. Multiple
instances can clean concurrently without deleting active buckets. Policy changes
must be deployed consistently; reassess retention when increasing refill periods.

Micrometer counters: `bitemap.auth.limit` tagged only with operation and
allowed/denied/unavailable, plus `bitemap.auth.limit.cleanup.failures`. No emails,
IP addresses, passwords, subject keys or exception SQL become metric labels.
These counters still need an operational monitoring/alerting destination.

## Verification

Use an isolated PostgreSQL database for Maven `verify`. Tests cover normalization,
forged headers, separate registration/login buckets, concurrent independent limiter
instances, cooldown refill without sleeps, no cooldown extension, CSRF/input
validation ordering, database failure, existing sessions, and bounded cleanup.

`npm test`, `npm run build`, `npm run test:e2e:typecheck`, and `npm run test:e2e`
cover the frontend and browser behavior. Browser tests provision disposable users,
make real failed logins until 429, fast-forward only the test bucket timestamps,
and verify the countdown followed by a successful sign-in. Test cleanup never
targets the application's Compose database.

To install locally after review: rebuild the backend with `docker compose up -d
--build backend`. This applies V16 to the application database. Existing accounts
and passwords remain unchanged. Do not use `docker compose down -v`.
