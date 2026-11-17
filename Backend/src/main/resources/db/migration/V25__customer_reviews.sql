CREATE TABLE customer_reviews (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    vendor_id BIGINT NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    customer_user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
    rating SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment VARCHAR(2000) NOT NULL CHECK (length(trim(comment)) BETWEEN 1 AND 2000),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (vendor_id, customer_user_id)
);
CREATE INDEX customer_reviews_vendor_created_idx ON customer_reviews(vendor_id, created_at DESC, id DESC);
CREATE INDEX customer_orders_review_eligibility_idx ON customer_orders(customer_user_id, vendor_id) WHERE status = 'COMPLETED';