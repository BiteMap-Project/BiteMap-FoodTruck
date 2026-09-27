# Database migrations

Flyway is the only schema-initialization mechanism. Spring Boot runs pending
migrations before JPA initializes. Hibernate remains on `ddl-auto: validate`;
do not switch it to `update`, `create`, or `create-drop`.

## Files and environments

- `Backend/src/main/resources/db/migration/V1__create_vendors.sql` creates the
  initial discovery table. It contains no demo data.
- `Backend/src/main/resources/db/dev/R__sample_vendors.sql` inserts three sample
  trucks, only when the `dev` Spring profile is active.
- `application.yaml` enables only production schema migrations by default.
- `application-dev.yaml` adds the separate development fixture location.
- Local Docker Compose explicitly activates `dev`. CI does not activate it.

The initial table has a generated bigint ID, name, category, human-readable
location, and creation timestamp. Location is a display label, not coordinates.
Names are not unique: separate vendors may share a name. Ownership, schedules,
closing times, menus, and geographic search are deliberately left for later
feature migrations. The frontend still uses its own hardcoded trucks; this task
does not connect it to the database or introduce a vendor API.

Sample rows reserve IDs -1, -2, and -3, separate from positive generated IDs.
These are not the frontend's hardcoded IDs. The repeatable fixture runs initially
and when its contents change; conflicts on an existing ID do nothing, preserving
local edits. An unchanged fixture is not rerun on every restart. Removing a row
from the SQL file does not delete an existing database row.

Never activate `dev` against staging or production. Disabling `dev` does not
remove sample data already inserted: use separate databases per environment.
The application artifact includes the fixture SQL, but only the explicitly
selected development profile loads it. The current Compose file is not a
production deployment configuration.

## Run locally

From the repository root, with `.env` configured as described in the README:

```bash
docker compose up --build -d --wait
docker compose exec postgres psql -U bitemap -d bitemap -c 'TABLE vendors;'
docker compose exec postgres psql -U bitemap -d bitemap -c 'SELECT version, description, success FROM flyway_schema_history ORDER BY installed_rank;'
```

Restarting or rebuilding preserves the database and runs only pending migrations.
Do not delete the Docker volume to apply a schema change.

For a manual Maven launch, load the database environment variables first, then:

```bash
cd Backend
./mvnw spring-boot:run -Dspring-boot.run.profiles=dev
```

Omit the profile argument for schema-only initialization. The database and login
role must already exist; Flyway creates tables, not the PostgreSQL server or role.

## Add the next migration

1. Pull the latest `main` and coordinate a unique next version with teammates.
2. Add a file such as `V2__add_vendor_description.sql` under `db/migration`.
   There are two underscores between the version and description.
3. Include only reviewed schema/data changes needed for the feature. Use a new
   migration to change an existing table; do not use manual SQL as the rollout.
4. Test both a fresh database and an existing development database containing
   data. Review drops, renames, constraints, and backfills for data loss and locks.
5. Commit the migration with its related code and request a teammate review.

Once a migration is merged and applied by others, do not edit or rename it.
Flyway records its checksum in `flyway_schema_history`; fixes belong in a new
migration. Rebase and resolve duplicate version numbers before merging a PR.
Do not add demo rows to production migrations or introduce `schema.sql`/`data.sql`.

`clean` is disabled and automatic baselining is off. If an existing database has
application tables but no Flyway history, stop and inspect it before adoption.
Do not enable `baseline-on-migrate`, run `repair`, modify history, or delete data
just to bypass a startup error. Migrations are not backups or automatic rollback;
production changes require a backup and a reviewed deployment/recovery plan.

## Verification and CI

Run `./mvnw --batch-mode --no-transfer-progress clean verify` from `Backend`,
with `DB_URL`, `DB_USERNAME`, and `DB_PASSWORD` pointing at a **dedicated test
database**. Do not activate `dev` for this command. The test role must own that
database or have permission to create and drop schemas.

The application startup test applies real migrations to the configured database.
Migration tests create uniquely named `migration_test_*` schemas and remove only
those schemas afterward. They verify schema-only initialization, exclusion of
development fixtures from the default configuration, identity/default/constraint
behavior, repeat startup without duplicate data, and adding demo fixtures while
preserving existing records. They use real PostgreSQL, not an H2 substitute.

The existing GitHub Actions backend job supplies a fresh PostgreSQL 15 database
and runs the same Maven verification, so it exercises migrations on every run.
No CI credentials or local `.env` changes are required for this feature.
