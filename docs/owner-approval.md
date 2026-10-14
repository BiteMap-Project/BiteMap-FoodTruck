# Owner application and approval

This supersedes instant onboarding in `unified-accounts.md`. One account and password remain shared. Existing operators retain their roles, profiles, and trucks. Migration V10 does not grant ADMIN to anyone or change existing ownership.

## Endpoints

- GET `/api/customer/owner-application`: own application, or 204 if none. CUSTOMER required.
- POST same path: `{businessName, contactEmail, operatingArea}`; 201 PENDING. Limits: 120/320/240 characters; valid contact email. Unknown roles, user IDs, and status fields are ignored. Contact email is contact information, not a change of login identity or proof of email ownership.
- GET `/api/admin/owner-applications?page=0`: ADMIN only; 20 pending applications per page, oldest first.
- POST `/api/admin/owner-applications/{id}/review`: `{decision:"APPROVED"|"REJECTED", note:"..."}`; ADMIN only; note required, max 500, visible to applicant. Self-review forbidden. Reviewer and time come from the server. Duplicate decisions return 409.
- POST `/api/auth/become-operator`: now only refreshes a session for an existing enabled operator with an OPERATOR grant. It cannot create a profile or grant access. Pending/rejected users get 403.

All writes require fresh CSRF tokens and the same browser session. Responses use no-store. Registration cannot assign ADMIN or OPERATOR. ADMIN does not bypass operator-role or vendor-ownership checks.

Approval creates one operator profile and OPERATOR role atomically with the audit decision. No vendor is created, assigned, or claimed. An already-open customer session must explicitly refresh via the approved screen or sign in again; after session rotation fetch fresh CSRF before the next write. Other sessions do not silently gain roles. Revoked profiles cannot be reactivated through this flow.

## UI

- `/operator/onboarding`: application form, pending status, rejection note, or approved entry to workspace.
- `/admin/owner-applications`: protected review queue, decision, required note, explicit confirmation.
- Browse account area: dual-role users see **Access your truck**. Customers see **Owner application**. ADMIN sees **Review applications**.
- No email notifications are promised or sent. Applicants refresh their status.

## Initial administrator setup — deliberate manual operation

Intended reviewers: Deep Patel and Aniket Christi. Exact registered email addresses must be confirmed before granting access. No names, credentials, or admin seed grants are hardcoded. Do not expose a public role-assignment API.

After deployment and database backup, a database maintainer should inspect the exact existing account ID/email/enabled state, then grant ADMIN in a transaction to that confirmed ID only:

```sql
-- Replace the placeholder with a confirmed enabled account ID. Do not guess by display name.
BEGIN;
SELECT id, email, enabled FROM app_users WHERE id = <confirmed_user_id> FOR UPDATE;
INSERT INTO app_user_roles(user_id, role)
SELECT id, 'ADMIN' FROM app_users WHERE id = <confirmed_user_id> AND enabled
ON CONFLICT DO NOTHING;
COMMIT;
```

Verify exactly the intended account was affected. Each reviewer uses their own credentials and signs in again after the grant. To revoke, delete only its ADMIN grant; existing sessions are revalidated on the next request. Record grant/revocation in the team's restricted operational change log. Approval/rejection auditing is stored in `owner_applications`; it is not a general admin-role-change audit system.

## Verification and limits

Use two separate browser sessions: customer applies → cannot access operator/admin APIs → administrator reviews → applicant refreshes status and enters approved workspace → creates new truck. Try spoofed roles/userId, missing CSRF, ordinary operator review, own-application review, duplicate decisions, disabled accounts, revoked administrator, and foreign truck access.

There is one application per account in this first version. Rejection is final in the UI; follow-up goes to the team. Resubmission/appeals, document verification, notification delivery, and a reviewer history screen are separate work. The database retains submitted fields and reviewer/note/time; it does not verify business legitimacy automatically.

Do not rebuild the normal app until V10 has been reviewed and a database backup exists. Tests use isolated PostgreSQL. No administrator grants or application-data changes are part of the source-code implementation.
