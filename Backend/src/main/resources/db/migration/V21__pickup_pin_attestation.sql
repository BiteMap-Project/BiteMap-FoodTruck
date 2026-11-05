-- NULL means legacy/imported: do not manufacture confirmation for existing stops.
ALTER TABLE vendor_stops ADD COLUMN location_confirmed_at timestamptz;
