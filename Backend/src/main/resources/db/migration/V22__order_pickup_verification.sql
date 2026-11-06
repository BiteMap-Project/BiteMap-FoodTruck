CREATE TABLE order_pickup_codes (
    order_id BIGINT PRIMARY KEY REFERENCES customer_orders(id) ON DELETE CASCADE,
    ciphertext VARCHAR(100) NOT NULL,
    key_version INTEGER NOT NULL DEFAULT 1 CHECK (key_version = 1),
    failed_attempts INTEGER NOT NULL DEFAULT 0 CHECK (failed_attempts BETWEEN 0 AND 5),
    locked_until TIMESTAMPTZ,
    verified_version BIGINT,
    verified_by BIGINT REFERENCES app_users(id),
    CHECK ((verified_version IS NULL) = (verified_by IS NULL))
);
-- Existing open orders receive a code lazily on authorized customer retrieval.
-- Encryption keys never belong in migrations; historical completed orders are unchanged.
