-- Explicit dated stops; vendor identity and its legacy location label stay intact.
CREATE FUNCTION valid_stop_time_zone(zone_name TEXT) RETURNS BOOLEAN
LANGUAGE SQL STABLE AS $$
    SELECT EXISTS (
        SELECT 1 FROM pg_timezone_names
        WHERE name = zone_name AND (name = 'UTC' OR name LIKE '%/%')
          AND name NOT LIKE 'posix/%' AND name NOT LIKE 'right/%'
    );
$$;

CREATE TABLE vendor_stops (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    vendor_id BIGINT NOT NULL REFERENCES vendors(id),
    venue_name VARCHAR(160) NOT NULL CHECK (venue_name ~ '[^[:space:]]'),
    address VARCHAR(300) NOT NULL CHECK (address ~ '[^[:space:]]'),
    latitude DOUBLE PRECISION NOT NULL CHECK (latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    starts_at TIMESTAMPTZ NOT NULL CHECK (isfinite(starts_at)),
    ends_at TIMESTAMPTZ NOT NULL CHECK (isfinite(ends_at)),
    time_zone VARCHAR(80) NOT NULL CHECK (valid_stop_time_zone(time_zone)),
    status VARCHAR(20) NOT NULL DEFAULT 'scheduled'
        CHECK (status IN ('scheduled', 'serving', 'ended', 'cancelled')),
    last_confirmed_at TIMESTAMPTZ CHECK (isfinite(last_confirmed_at)),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT stop_interval_valid CHECK (ends_at > starts_at),
    CONSTRAINT serving_requires_confirmation CHECK (status <> 'serving' OR last_confirmed_at IS NOT NULL)
);

CREATE INDEX vendor_stops_vendor_start_idx ON vendor_stops (vendor_id, starts_at);
CREATE INDEX vendor_stops_active_start_idx ON vendor_stops (starts_at, id)
    WHERE status IN ('scheduled', 'serving');
