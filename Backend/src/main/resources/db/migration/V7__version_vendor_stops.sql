-- Preserve existing schedules; versions protect owner edits against stale clients.
ALTER TABLE vendor_stops ADD COLUMN version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0);
