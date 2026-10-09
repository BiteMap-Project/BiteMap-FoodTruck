-- Deploy with the backend stopped; old binaries must not write credentials after this migration.
-- Legacy credential columns are retained as a rollback snapshot, never read or dual-written by new code.
CREATE TABLE app_users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    display_name VARCHAR(120) NOT NULL CHECK (length(trim(display_name)) > 0),
    email VARCHAR(320) NOT NULL CHECK (length(trim(email)) > 0),
    password_hash VARCHAR(255) NOT NULL CHECK (length(trim(password_hash)) > 0),
    enabled BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX app_users_email_unique ON app_users(lower(email));
CREATE TABLE app_user_roles (
    user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    role VARCHAR(20) NOT NULL CHECK (role IN ('CUSTOMER', 'OPERATOR')),
    PRIMARY KEY (user_id, role)
);
INSERT INTO app_users(id, display_name, email, password_hash, enabled, created_at, updated_at)
    OVERRIDING SYSTEM VALUE
    SELECT id, display_name, email, password_hash, enabled, created_at, updated_at FROM operators;
SELECT setval(pg_get_serial_sequence('app_users', 'id'),
    COALESCE((SELECT max(id) FROM app_users), 1), EXISTS(SELECT 1 FROM app_users));
INSERT INTO app_user_roles(user_id, role) SELECT id, 'CUSTOMER' FROM app_users;
INSERT INTO app_user_roles(user_id, role) SELECT id, 'OPERATOR' FROM app_users;
ALTER TABLE operators ADD COLUMN user_id BIGINT;
UPDATE operators SET user_id = id;
ALTER TABLE operators
    ALTER COLUMN user_id SET NOT NULL,
    ADD CONSTRAINT operators_user_unique UNIQUE(user_id),
    ADD CONSTRAINT operators_user_fk FOREIGN KEY(user_id) REFERENCES app_users(id),
    ALTER COLUMN display_name DROP NOT NULL,
    ALTER COLUMN email DROP NOT NULL,
    ALTER COLUMN password_hash DROP NOT NULL;
-- operators.enabled is now the operator-specific access switch: false means revoked.
-- app_users.enabled is the independent global account switch.
COMMENT ON COLUMN operators.enabled IS 'Operator access: false is revoked and cannot be self-service reactivated';
