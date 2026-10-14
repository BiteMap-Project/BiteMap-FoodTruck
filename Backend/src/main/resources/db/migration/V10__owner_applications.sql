ALTER TABLE app_user_roles DROP CONSTRAINT app_user_roles_role_check;
ALTER TABLE app_user_roles ADD CONSTRAINT app_user_roles_role_check
    CHECK (role IN ('CUSTOMER', 'OPERATOR', 'ADMIN'));
-- Existing roles and vendor ownership are intentionally unchanged. No admin is seeded.
CREATE TABLE owner_applications (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE RESTRICT,
    business_name VARCHAR(120) NOT NULL CHECK (length(trim(business_name)) > 0),
    contact_email VARCHAR(320) NOT NULL CHECK (length(trim(contact_email)) > 0),
    operating_area VARCHAR(240) NOT NULL CHECK (length(trim(operating_area)) > 0),
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','APPROVED','REJECTED')),
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMPTZ,
    reviewed_by BIGINT REFERENCES app_users(id) ON DELETE RESTRICT,
    review_note VARCHAR(500),
    CHECK ((status='PENDING' AND reviewed_at IS NULL AND reviewed_by IS NULL AND review_note IS NULL)
        OR (status IN ('APPROVED','REJECTED') AND reviewed_at IS NOT NULL AND reviewed_by IS NOT NULL
            AND length(trim(review_note)) > 0)),
    CHECK (reviewed_by IS NULL OR reviewed_by <> user_id)
);
CREATE INDEX owner_applications_pending_idx ON owner_applications(status, submitted_at, id);
