-- Old orders intentionally have no snapshot: their historical pickup is unknown.
CREATE TABLE customer_order_pickups (
    order_id BIGINT PRIMARY KEY REFERENCES customer_orders(id) ON DELETE CASCADE,
    -- Historical source identifier, not a live link: retain data if a stop is retired.
    stop_id BIGINT NOT NULL CHECK (stop_id <> 0),
    venue_name VARCHAR(160) NOT NULL CHECK (venue_name ~ '[^[:space:]]'),
    address VARCHAR(300) NOT NULL CHECK (address ~ '[^[:space:]]'),
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    starts_at TIMESTAMPTZ NOT NULL CHECK (isfinite(starts_at)),
    ends_at TIMESTAMPTZ NOT NULL CHECK (isfinite(ends_at) AND ends_at > starts_at),
    time_zone VARCHAR(80) NOT NULL CHECK (valid_stop_time_zone(time_zone))
);
CREATE INDEX customer_order_pickups_stop_idx ON customer_order_pickups(stop_id);
