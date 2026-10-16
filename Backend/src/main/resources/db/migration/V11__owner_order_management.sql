ALTER TABLE customer_orders
    ADD COLUMN version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    ADD COLUMN updated_at TIMESTAMPTZ,
    ADD COLUMN cancellation_reason VARCHAR(500);

UPDATE customer_orders SET updated_at = created_at;
ALTER TABLE customer_orders ALTER COLUMN updated_at SET NOT NULL;
ALTER TABLE customer_orders ALTER COLUMN updated_at SET DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE customer_orders ADD CONSTRAINT customer_orders_cancellation_reason_check
    CHECK (cancellation_reason IS NULL OR (status = 'CANCELLED' AND length(btrim(cancellation_reason)) > 0));

-- Historical rows predate auditing; do not invent an actor or cancellation reason.
CREATE TABLE customer_order_status_history (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
    from_status VARCHAR(16) NOT NULL,
    to_status VARCHAR(16) NOT NULL,
    version BIGINT NOT NULL CHECK (version > 0),
    changed_by_user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    cancellation_reason VARCHAR(500),
    UNIQUE (order_id, version),
    CHECK (
        (from_status = 'PLACED' AND to_status IN ('ACCEPTED','CANCELLED')) OR
        (from_status = 'ACCEPTED' AND to_status IN ('READY','CANCELLED')) OR
        (from_status = 'READY' AND to_status = 'COMPLETED')
    ),
    CHECK (
        (to_status = 'CANCELLED' AND cancellation_reason IS NOT NULL AND length(btrim(cancellation_reason)) > 0) OR
        (to_status <> 'CANCELLED' AND cancellation_reason IS NULL)
    )
);
CREATE INDEX customer_orders_vendor_status_created_idx
    ON customer_orders (vendor_id, status, created_at DESC, id DESC);
