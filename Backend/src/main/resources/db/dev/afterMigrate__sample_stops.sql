-- Development-only callback: refresh these reserved demo IDs on every startup.
-- Runs after migrations so sample vendors exist. Never loaded by the default profile.
-- These are fictional stops at approximate landmarks, not real vendor locations.
INSERT INTO vendor_stops (id, vendor_id, venue_name, address, latitude, longitude,
    starts_at, ends_at, time_zone, status, last_confirmed_at)
OVERRIDING SYSTEM VALUE
VALUES
    (-201, -1, '[DEMO] CSUN lunch stop', '18111 Nordhoff St, Northridge, CA', 34.2400, -118.5291,
        CURRENT_TIMESTAMP - INTERVAL '1 hour', CURRENT_TIMESTAMP + INTERVAL '2 hours',
        'America/Los_Angeles', 'serving', CURRENT_TIMESTAMP),
    (-202, -2, '[DEMO] CSUN later stop', '18111 Nordhoff St, Northridge, CA', 34.2405, -118.5285,
        CURRENT_TIMESTAMP + INTERVAL '2 hours', CURRENT_TIMESTAMP + INTERVAL '4 hours',
        'America/Los_Angeles', 'scheduled', NULL),
    (-203, -3, '[DEMO] Reseda tomorrow', '18411 Victory Blvd, Reseda, CA', 34.1867, -118.5351,
        CURRENT_TIMESTAMP + INTERVAL '24 hours', CURRENT_TIMESTAMP + INTERVAL '27 hours',
        'America/Los_Angeles', 'scheduled', NULL),
    (-204, -2, '[DEMO] Santa Monica tomorrow', '200 Santa Monica Pier, Santa Monica, CA', 34.0100, -118.4960,
        CURRENT_TIMESTAMP + INTERVAL '24 hours', CURRENT_TIMESTAMP + INTERVAL '27 hours',
        'America/Los_Angeles', 'scheduled', NULL),
    (-205, -1, '[DEMO] Ended stop', '18111 Nordhoff St, Northridge, CA', 34.2400, -118.5291,
        CURRENT_TIMESTAMP - INTERVAL '4 hours', CURRENT_TIMESTAMP - INTERVAL '2 hours',
        'America/Los_Angeles', 'ended', NULL),
    (-206, -3, '[DEMO] Cancelled stop', '18411 Victory Blvd, Reseda, CA', 34.1867, -118.5351,
        CURRENT_TIMESTAMP + INTERVAL '2 hours', CURRENT_TIMESTAMP + INTERVAL '4 hours',
        'America/Los_Angeles', 'cancelled', NULL)
ON CONFLICT (id) DO UPDATE SET
    vendor_id = EXCLUDED.vendor_id, venue_name = EXCLUDED.venue_name,
    address = EXCLUDED.address, latitude = EXCLUDED.latitude, longitude = EXCLUDED.longitude,
    starts_at = EXCLUDED.starts_at, ends_at = EXCLUDED.ends_at,
    time_zone = EXCLUDED.time_zone, status = EXCLUDED.status,
    last_confirmed_at = EXCLUDED.last_confirmed_at, updated_at = CURRENT_TIMESTAMP;
