# Unified accounts: backend contract and rollout

This is a backend-only change. Coordinate frontend integration before deploying it.
The repository uses Java 21 / Spring Boot 4.1.1. Existing JDBC account persistence is retained; there is no parallel authentication implementation or unused JPA identity model.

## Identity and ownership

- app_users is the only live source of email, display name, password hash, and global enabled state.
- app_user_roles stores CUSTOMER / OPERATOR, exposed as ROLE_CUSTOMER / ROLE_OPERATOR.
- operators is a profile linked by unique, non-null user_id. Its existing ID still backs vendors.operator_id.
- Account IDs and operator IDs are separate. Never use /me.id as an operator ID.
- Existing operators receive both roles. Password hashes, operator IDs, timestamps, disabled flags, and vendor references are preserved.
- operators.enabled=false means operator access is revoked; customer access can remain active. app_users.enabled=false disables everything.
- Revoked profiles cannot self-reactivate. Removing the OPERATOR role also prevents re-onboarding while the profile exists. Retain the profile when administratively revoking access; do not delete it.

## Frontend handoff

| Endpoint | Success | Meaning |
| --- | --- | --- |
| GET /api/auth/csrf | 200 | Obtain headerName/token in the same cookie session |
| POST /api/auth/register | 201 | CUSTOMER only; no automatic login or operator profile |
| POST /api/auth/login | 200 | Authenticate either account type and rotate session |
| GET /api/auth/me | 200 | Current session's effective roles |
| POST /api/auth/become-operator | 200 | Authenticated CUSTOMER only; no request body; idempotent |
| POST /api/auth/logout | 204 | Invalidate session and clear session cookie |

Registration retains displayName, email, password and existing validation rules. Submitted roles/IDs are ignored.
Registration, login, /me and onboarding return the following shape (registration has only ROLE_CUSTOMER):

```json
{"id":42,"displayName":"Truck Owner","email":"owner@example.com","roles":["ROLE_CUSTOMER","ROLE_OPERATOR"]}
```

No password/hash is returned. Authentication responses use Cache-Control: no-store.
All POSTs require CSRF. Fetch a NEW CSRF token after login or successful onboarding and before the next write.
Keep the same hostname and cookies; do not mix localhost and 127.0.0.1.
Onboarding rotates session ID and CSRF only after the DB transaction commits. If its response is lost after commit, retry with fresh CSRF or log in again.

Frontend flow: register customer → login → explicitly choose “Become a truck owner” → POST onboarding → refresh CSRF/account → show workspace → create a NEW truck via POST /api/operator/vendors.
Render customer/operator features based on the corresponding roles. Successful login alone does not imply operator access.
Onboarding never claims demo, unassigned, or another operator's trucks. It has no vendor update statement.
The frontend is unchanged and its current operator-registration assumptions require a teammate's integration work.

## Session and authorization behavior

Each authenticated API request revalidates enabled account state and intersects DB roles with existing session grants.
Revocation therefore applies on the next request. Global disable/deletion invalidates the session with 401; database failure fails closed with 503.
Unknown/legacy principal types require fresh login. Stable account IDs prevent old sessions following a deleted/reused email.
Role additions are not silently granted to another active session: login again or explicitly onboard there.
/me reports actual session grants, not merely all roles in the database.

URL role rules protect operator/customer routes; method security additionally protects onboarding.
Resource ownership remains inside transactional services/repositories. Vendor/menu/schedule/analytics queries require enabled account, active profile and OPERATOR role.
Foreign/missing resources retain 404; lacking operator access returns 403.
Role lookups have a fixed query count. Ownership joins/locks avoid per-item authorization queries.
Onboarding serializes on the account row, with unique profile/role constraints preventing duplicates.
Ownership locks also hold the account/role/profile stable during mutations.

## V8 rollout and rollback

Do not rebuild against your application database until this migration and frontend contract are reviewed.

1. Back up PostgreSQL and verify restoration into a separate database.
2. Stop ALL old backend instances: V8 is a coordinated cutover, not a mixed-version rolling deployment.
3. Apply V8 with the new backend; verify counts, unchanged ownership, existing-password login, and disabled accounts.
4. Users log in again after restart (sessions are currently in memory).
5. Verify customer registration, explicit onboarding, new truck creation, and foreign-owner rejection.

Old nullable operators.display_name/email/password_hash columns remain only as a migration snapshot. New code NEVER reads or dual-writes them; new operator profiles contain no credentials there.
Remove these columns in a separate reviewed migration after cutover validation.
They are NOT a rollback mechanism once new accounts or changes exist. Do not run old binaries against V8.
Rollback needs a planned data-aware restore/reconciliation, not deleting Flyway history or discarding post-cutover data.

## Verification and remaining production work

Run ./mvnw clean verify using an isolated PostgreSQL database without the dev profile.
Coverage includes migration preservation, role injection, session/CSRF rotation, revocation, foreign ownership, email reuse, simultaneous onboarding, and locks against racing account/role changes.
HTTPS, rate limiting, email verification/recovery, monitoring, and operational backups remain broader production-readiness work.
