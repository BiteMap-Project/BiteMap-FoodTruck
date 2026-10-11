CREATE TABLE customer_orders (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    customer_user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
    vendor_id BIGINT NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    idempotency_key UUID NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PLACED'
        CHECK (status IN ('PLACED', 'ACCEPTED', 'READY', 'COMPLETED', 'CANCELLED')),
    total NUMERIC(12, 2) NOT NULL CHECK (total >= 0 AND total <> 'NaN'::numeric),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (customer_user_id, idempotency_key)
);

CREATE TABLE customer_order_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES customer_orders(id) ON DELETE CASCADE,
    menu_item_id BIGINT NOT NULL REFERENCES vendor_menu_items(id) ON DELETE RESTRICT,
    name_snapshot VARCHAR(150) NOT NULL,
    unit_price NUMERIC(10, 2) NOT NULL CHECK (unit_price >= 0 AND unit_price <> 'NaN'::numeric),
    quantity INTEGER NOT NULL CHECK (quantity BETWEEN 1 AND 10),
    line_total NUMERIC(12, 2) NOT NULL CHECK (line_total >= 0 AND line_total <> 'NaN'::numeric),
    UNIQUE (order_id, menu_item_id)
);

CREATE INDEX customer_orders_customer_created_idx
    ON customer_orders (customer_user_id, created_at DESC, id DESC);
CREATE INDEX customer_orders_vendor_created_idx
    ON customer_orders (vendor_id, created_at DESC, id DESC);
CREATE INDEX customer_order_items_order_idx ON customer_order_items (order_id, id);
