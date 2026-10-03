# BiteMap-FoodTruck
COMP 490/491 FoodTruck vendor discovery, ordering, delivery, and location intelligence platform

## Current status

This repository contains the Spring Boot backend foundation and a React frontend
with database-backed food-truck search and Flyway-managed vendor migrations.
A public vendor-list/search API is available; other business APIs and production
deployment are future work. Docker Compose runs all three development services
together, enabling development-only database fixtures.
The backend starts with PostgreSQL and provides an Actuator health endpoint.
Operators can register, log in, inspect their session, and log out through the API.
The generated Spring login and HTTP Basic are disabled. Frontend authentication
screens and vendor ownership authorization remain separate work; production
security hardening is still required. See [operator sessions](docs/operator-sessions.md).

Operator account registration is available at `POST /api/auth/register` (SCRUM-45).
See [the registration API guide](docs/operator-registration.md) for validation,
CSRF usage, responses, and security limitations. Registration does not log an
operator in; there is no registration screen yet.

## Start everything with Docker Compose (recommended)

### Interactive API documentation (development only)

After rebuilding the backend (`docker compose up --build -d backend`), open
[Swagger UI](http://localhost:8080/swagger-ui/index.html). Adjust the port if you
changed `BACKEND_PORT`. Expand an endpoint, click **Try it out**, fill in the
parameters, and click **Execute**. The generated specification is at
[/v3/api-docs](http://localhost:8080/v3/api-docs).

For registration, login, or logout, first execute `GET /api/auth/csrf` in Swagger.
Copy the returned `token`, click **Authorize**, and paste it into `csrfToken`.
Then execute the request in the same browser session. Fetch and authorize a fresh
token after login/logout or if the session expires. Login sets a session cookie;
the CSRF token itself does not log you in.
Requests act on your real local database, so use disposable test accounts.

Docker Compose already enables the `dev` profile. For manual backend startup,
set `SPRING_PROFILES_ACTIVE=dev` (this also enables development database fixtures).
Swagger and its specification are disabled by default outside this profile.
Only business `/api/**` endpoints are listed, not Actuator or framework login routes.
Never use the `dev` profile in production. Swagger is manual testing/documentation,
not a replacement for the automated test suite.

Integration uses [springdoc-openapi](https://springdoc.org/), the Spring Boot
integration for Swagger UI.

### Starting the services

Install and start Docker Desktop with Docker Compose v2. You do not need Java,
Node.js, Maven, or PostgreSQL installed on the host for this path. Run commands
from the repository root. Git tracks the frontend directory as lowercase `frontend`;
keep that casing for Linux and container compatibility.

If you do not have a root `.env`, copy the Docker template once:

```bash
cp -n compose.env.example .env
```
for MAC or
```bash
if not exist .env copy compose.env.example .env
```
for windows.

If `.env` already exists, add the variables from `compose.env.example` to it
without replacing your existing values. Set `COMPOSE_DB_PASSWORD` to your own
local-development password. Compose loads `.env` automatically; unlike the manual
Maven workflow below, you do not need to source it. Keep this file out of Git.
`COMPOSE_DB_PASSWORD` is independent of `DB_PASSWORD` used by host PostgreSQL.

Start the app:

```bash
docker compose up --build
```

- Frontend: http://localhost:5173
- Backend health: http://localhost:8080/actuator/health
- PostgreSQL: `postgres:5432` inside Docker; `127.0.0.1:5433` from your computer.

The backend waits for PostgreSQL readiness, and the frontend waits for backend
health. The Docker database is separate from any PostgreSQL installed on your
machine, so your existing port 5432 and local data are unaffected.
This is a development setup: the frontend uses Vite's development server and
database-backed vendor discovery. Profiles and menus load from the vendor detail API.
Authentication still needs production hardening before public deployment. Only localhost
ports are published, and both application containers run as non-root users.

### Connect DBeaver to the Docker database

Start the services as described above. In DBeaver, create a new **PostgreSQL**
connection and enter:

| Setting | Value |
| --- | --- |
| Host | `127.0.0.1` |
| Port | `5433` |
| Database | `bitemap` |
| Username | `bitemap` |
| Password | Your local `COMPOSE_DB_PASSWORD` from the root `.env` |

Click **Test Connection** (allow the PostgreSQL driver download if prompted),
then **Finish**. Expand `bitemap` → **Schemas** → **public** → **Tables** to
inspect your local data. Do not share passwords or commit `.env`.

Port 5433 is bound only to the local machine, not the network. The backend still
uses Docker's internal `postgres:5432`; do not change its connection URL.
If port 5433 is already occupied, stop the conflicting local service or change
the host-side port in your local Compose file and use that port in DBeaver.
Changing `.env` does not reset an existing database password; use the password
with which the database was initialized. Do not delete the database volume to
solve a login problem.

### Service status and shutdown

For background operation and status:

```bash
docker compose up --build -d --wait
docker compose ps
docker compose logs -f backend
```

Frontend edits inside `frontend/src` and `frontend/public` are mounted into the
container for development updates. Rebuild after backend code, dependency, Vite
configuration, or other unmounted file changes:

```bash
docker compose up --build
```

Stop with Control+C when attached, or use:

```bash
docker compose down
```

The named PostgreSQL volume preserves data across stops, rebuilds, and `down`.
Do not add `--volumes` or `-v` to `down` unless you intend to permanently delete
that Docker database. Keep the same Compose project name to reuse its volume.
Changing `COMPOSE_DB_PASSWORD` does not change a password in an initialized
database; coordinate a database password change rather than deleting its volume.

If port 5173 or 8080 is occupied, stop the separately running application or set
`FRONTEND_PORT` / `BACKEND_PORT` in `.env` to unused ports. Docker Desktop must be
running. The first build downloads images and dependencies and may take several
minutes. Tests are skipped during backend image packaging because its build has
no database; Maven verification remains a separate CI/test step.

Frontend checks can run inside its container:

```bash
docker compose exec frontend npm run lint
docker compose exec frontend npm test
docker compose exec frontend npm run build
```

## Manual setup prerequisites (without Docker)

- JDK 21. Confirm `java -version` reports 21.
- A running local PostgreSQL server (the foundation was checked with PostgreSQL 15).
- Git. Maven is provided by the committed Maven Wrapper.

On macOS, select an installed JDK 21 in the current terminal with:

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 21)
export PATH="$JAVA_HOME/bin:$PATH"
```

## Set up your local database

Connect to PostgreSQL using your own local administrator account, replacing
`YOUR_ADMIN_USER` below. Administrator usernames vary by installation.

```bash
psql -h localhost -p 5432 -U YOUR_ADMIN_USER -d postgres
```

Use `\du` and `\l` to check existing roles and databases. If the `bitemap` role
does not exist, create it:

```sql
CREATE ROLE bitemap LOGIN;
```

Set its password interactively so the password is not included in an SQL command:

```text
\password bitemap
```

If the `bitemap` database does not exist, create it:

```sql
CREATE DATABASE bitemap OWNER bitemap;
```

If a database with that name already exists, check its ownership and permissions
before reusing it. Do not drop an existing database as a setup step. Exit with `\q`.
Each teammate uses their own local database and password.

## Configure and run the backend

From the repository root, copy the example once if `.env` does not already exist:

```bash
cp -n .env.example .env
```

Edit `.env` locally and set `DB_PASSWORD` to the password chosen above. This file
uses shell assignment syntax; keep values with special characters properly quoted.
Never commit `.env` or real credentials. `.env.example` contains placeholders only.

| Variable | Meaning | Default in the backend |
| --- | --- | --- |
| `DB_URL` | PostgreSQL JDBC connection URL | `jdbc:postgresql://localhost:5432/bitemap` |
| `DB_USERNAME` | Application database role | `bitemap` |
| `DB_PASSWORD` | Local database password | Required; no default |

In Bash or Zsh, load the file and start the backend:

```bash
set -a
source .env
set +a
cd Backend
./mvnw spring-boot:run
```

Spring Boot does not automatically read `.env`. If you run the application using
an IDE Run button, configure these three variables in that run configuration as
well (or configure its environment-file support), and select JDK 21. A separate
IDE process does not inherit variables set in an already-open terminal.

The server uses port 8080. While it is running, open
[the health endpoint](http://localhost:8080/actuator/health) or run:

```bash
curl --fail http://localhost:8080/actuator/health
```

Expected response: `{"status":"UP"}`. Stop the application with Control+C.
Operator passwords are set through registration and are separate from the database
password. Use the login API; the generated Spring Security login is disabled.

## Verify before review

With PostgreSQL running, configure `DB_URL`, `DB_USERNAME`, and `DB_PASSWORD`
for a dedicated test database (not production), then run without the `dev` profile:

```bash
cd Backend
./mvnw verify
```

The startup test loads the application context and applies Flyway migrations.
Migration tests use isolated temporary schemas in the configured PostgreSQL
database; the test role needs permission to create and drop schemas. GitHub
Actions already provisions a separate temporary database for each job.
Hibernate validates the schema (`ddl-auto: validate`) and never creates it.
These checks are not complete business-feature coverage.

## Vendor discovery API

`GET /api/vendors` lists database-backed vendors without requiring login. It
supports case-insensitive search (`q`) and bounded pagination (`page`, `size`).
See [Vendor API](docs/vendor-api.md) for request/response examples, error behavior,
security boundaries, and tests. React discovery uses this API with search,
pagination, loading, empty, and retry states. Profiles and menus load from the vendor detail API.
See [frontend setup and checks](frontend/README.md).
See [consumer discovery acceptance criteria](docs/consumer-discovery.md) for the
SCRUM-30 behavior, scope, and verification steps.

## Database migrations

Serving-stop schedules are available through public `GET /api/vendor-stops`.
See [serving-stop API](docs/vendor-stops-api.md) for time windows, coordinate and
distance filters, validation, and the limits of schedule versus live status.
The default profile has no sample stops. In development, six fictional `[DEMO]`
stops refresh on backend startup so time and distance filters can be exercised.
See [development sample schedules](docs/consumer-search-filters.md#development-sample-schedules)
for locations, reserved IDs, refresh behavior, and filter examples.
No schedule write endpoints are added.

Flyway initializes the vendor schema and tracks subsequent versioned SQL changes.
Docker Compose enables the `dev` profile to load three sample vendors from a
separate fixture folder. The default profile and CI load no demo vendors.
The frontend uses the vendor list and detail APIs.

See [Database migrations](docs/database-migrations.md) for file locations,
manual setup, team migration rules, safety precautions, and verification.
See [Initial database schema](docs/database/README.md) for the current relationship
diagram and the planned operator-to-truck ownership design.

## Continuous integration (CI)

[BiteMap CI](.github/workflows/ci.yml) runs on pull requests targeting `main` and
pushes to `main`. Once the workflow is on the default branch, it can also be
started manually from the repository's Actions tab.

Each run checks out the code on an Ubuntu runner, installs Java 21, starts a fresh
PostgreSQL 15 service, and runs this command inside `Backend`:

```bash
./mvnw --batch-mode --no-transfer-progress clean verify
```

The job supplies its own `DB_URL`, `DB_USERNAME`, and `DB_PASSWORD`. It does not
use your local `.env`, development database, or production credentials. The
credentials written in the workflow are intentionally public, disposable values
for that job's temporary database only; no repository secrets are needed.
GitHub removes the service container after the job finishes.

The frontend job runs a clean dependency install, lint, component tests, and a
production build with Node 24. The backend job checks whether the backend compiles,
the existing tests pass, and the JAR can
be packaged in a fresh environment. Tests check application startup, database
connectivity, migrations (including separated development fixtures), and the
vendor-list API's search, pagination, input validation, errors, and security.
Add behavior tests with each new feature; a green
check does not yet demonstrate that ordering, authorization, or other future
features work. This workflow does not deploy the application.

To inspect a failure, open the PR's Checks tab (or Actions > BiteMap CI), select
the failed frontend or backend job, and read the failing step's logs. Fix the problem
on the same branch and push again; the PR check will rerun automatically.

After the first successful GitHub run, a repository administrator should require
the **Backend build and tests** status check and at least one approving review
in the rules for `main`, if supported by the repository's plan and settings.
Adding this workflow alone does not prevent someone from merging a failing PR.
All PRs targeting `main` run the check, including documentation-only PRs, so a
required check is not left pending because of a file-path filter.

GitHub-maintained actions are pinned to release commit SHAs. Update those pins
deliberately when upgrading the actions. PostgreSQL is pinned to major version 15
to match the current local backend baseline; update local and CI versions together.

## Sharing changes

Work on a branch, reference the actual Jira key in the commit and PR, and request
a teammate review before merging into `main`. Include setup or test limitations
in a draft PR when work is still in progress.

Review staged files with `git diff --cached` before committing. Include source,
`pom.xml`, `mvnw`, `mvnw.cmd`, and `.mvn/`; exclude `.env`, credentials, `target/`,
IDE settings, and generated logs. Do not add files using `git add -f` to bypass
ignore rules.
