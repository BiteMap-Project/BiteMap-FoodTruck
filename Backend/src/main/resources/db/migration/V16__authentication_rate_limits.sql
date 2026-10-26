CREATE TABLE auth_rate_limits (
    scope varchar(32) NOT NULL,
    subject_key char(64) NOT NULL,
    tokens double precision NOT NULL CHECK (tokens >= 0),
    updated_at timestamptz NOT NULL,
    expires_at timestamptz NOT NULL,
    PRIMARY KEY (scope, subject_key)
);
CREATE INDEX auth_rate_limits_expiry_idx ON auth_rate_limits(expires_at);
