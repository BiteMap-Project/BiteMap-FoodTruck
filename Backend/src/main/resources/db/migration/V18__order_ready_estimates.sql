ALTER TABLE customer_orders
    ADD COLUMN estimated_ready_at TIMESTAMPTZ;

ALTER TABLE customer_orders
    ADD CONSTRAINT customer_orders_estimated_ready_after_creation
    CHECK (estimated_ready_at IS NULL OR estimated_ready_at >= created_at);
