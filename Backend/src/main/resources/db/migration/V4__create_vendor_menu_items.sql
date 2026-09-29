-- SCRUM-31: read-only menu browsing. Prices are USD; no sample data.
CREATE TABLE vendor_menu_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    vendor_id BIGINT NOT NULL REFERENCES vendors(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL CHECK (name ~ '[^[:space:]]'),
    description TEXT,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0 AND price <> 'NaN'::numeric),
    available BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX vendor_menu_items_vendor_idx ON vendor_menu_items (vendor_id);
