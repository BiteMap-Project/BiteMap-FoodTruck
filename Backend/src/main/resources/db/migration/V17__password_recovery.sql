ALTER TABLE app_users ADD COLUMN credential_version BIGINT NOT NULL DEFAULT 0 CHECK (credential_version >= 0);

CREATE TABLE password_reset_tokens (
    token_hash CHAR(64) PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    credential_version BIGINT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX password_reset_tokens_user_idx ON password_reset_tokens(user_id);
CREATE INDEX password_reset_tokens_expiry_idx ON password_reset_tokens(expires_at);

-- Queue contains no raw reset token or password. Unknown accounts get a null
-- identity job and the same HTTP response; delivery happens outside the request.
CREATE TABLE password_recovery_mail (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    user_id BIGINT REFERENCES app_users(id) ON DELETE CASCADE,
    credential_version BIGINT,
    kind VARCHAR(16) NOT NULL CHECK (kind IN ('RESET', 'NOTICE')),
    attempts INTEGER NOT NULL DEFAULT 0,
    available_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX password_recovery_mail_due_idx ON password_recovery_mail(available_at, id);
