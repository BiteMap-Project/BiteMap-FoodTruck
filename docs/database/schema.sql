-- SCRUM-24: proposed initial schema for PostgreSQL 15.
-- Review draft, not an automatically applied migration.
-- Prices are USD. Each truck has one operator; an operator may own many trucks.
BEGIN;

CREATE TABLE operators (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(150) NOT NULL CHECK (length(trim(name)) > 0),
    email VARCHAR(254) NOT NULL CHECK (length(trim(email)) > 0)
);

CREATE UNIQUE INDEX operators_email_unique ON operators (lower(trim(email)));

CREATE TABLE food_trucks (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    operator_id BIGINT NOT NULL REFERENCES operators(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL CHECK (length(trim(name)) > 0),
    description TEXT,
    category VARCHAR(80) NOT NULL CHECK (length(trim(category)) > 0)
);

CREATE INDEX food_trucks_operator_idx ON food_trucks (operator_id);

CREATE TABLE menu_items (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    truck_id BIGINT NOT NULL REFERENCES food_trucks(id) ON DELETE RESTRICT,
    name VARCHAR(150) NOT NULL CHECK (length(trim(name)) > 0),
    description TEXT,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    is_available BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX menu_items_truck_idx ON menu_items (truck_id);

CREATE TABLE truck_stops (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    truck_id BIGINT NOT NULL REFERENCES food_trucks(id) ON DELETE RESTRICT,
    location_name VARCHAR(200) NOT NULL CHECK (length(trim(location_name)) > 0),
    latitude NUMERIC(9, 6),
    longitude NUMERIC(9, 6),
    opens_at TIMESTAMPTZ NOT NULL,
    closes_at TIMESTAMPTZ NOT NULL,
    CONSTRAINT valid_stop_times CHECK (closes_at > opens_at),
    CONSTRAINT valid_latitude CHECK (latitude BETWEEN -90 AND 90),
    CONSTRAINT valid_longitude CHECK (longitude BETWEEN -180 AND 180),
    CONSTRAINT coordinates_together CHECK (
        (latitude IS NULL) = (longitude IS NULL)
    )
);

CREATE INDEX truck_stops_truck_time_idx ON truck_stops (truck_id, opens_at);

COMMIT;
