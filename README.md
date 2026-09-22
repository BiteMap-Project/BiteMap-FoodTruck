# BiteMap-FoodTruck
COMP 490/491 FoodTruck vendor discovery, ordering, delivery, and location intelligence platform

## Current status

This repository currently contains the Spring Boot backend foundation. The frontend,
business features, migrations, CI, and deployment configuration are future work.
The backend starts with PostgreSQL and provides an Actuator health endpoint.
Spring Security still uses its generated development login; production authentication
has not been implemented.

## Prerequisites

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
The generated Spring Security application password is separate from the database
password. The generated login is for local development only.

## Verify before review

With PostgreSQL running, load `.env` from the repository root as above, then run:

```bash
cd Backend
./mvnw verify
```

The current `@SpringBootTest` loads the application context and connects to the
configured database. Use your local development database only. This is a startup
smoke test, not complete feature coverage or an isolated test database setup.
Schema generation is disabled (`ddl-auto: validate`); add versioned migrations
before implementing persistent business entities.

## Sharing changes

Work on a branch, reference the actual Jira key in the commit and PR, and request
a teammate review before merging into `main`. Include setup or test limitations
in a draft PR when work is still in progress.

Review staged files with `git diff --cached` before committing. Include source,
`pom.xml`, `mvnw`, `mvnw.cmd`, and `.mvn/`; exclude `.env`, credentials, `target/`,
IDE settings, and generated logs. Do not add files using `git add -f` to bypass
ignore rules.
