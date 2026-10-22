-- SCRUM-78: a customer's saved trucks. One row per customer and truck, so saving
-- the same truck again cannot create a duplicate. Favorites have no meaning
-- without the account or the truck, so they are removed with either.
CREATE TABLE customer_favorites (
    user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
    vendor_id BIGINT NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY (user_id, vendor_id)
);

-- Newest-first listing for one customer.
CREATE INDEX customer_favorites_user_created_idx ON customer_favorites (user_id, created_at DESC, vendor_id DESC);
-- Cascading deletes from vendors.
CREATE INDEX customer_favorites_vendor_idx ON customer_favorites (vendor_id);
