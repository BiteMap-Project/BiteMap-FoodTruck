-- Preserve the old availability meaning while introducing explicit states.
ALTER TABLE vendor_menu_items
    ADD COLUMN availability_status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0);
UPDATE vendor_menu_items SET availability_status = CASE WHEN available THEN 'ACTIVE' ELSE 'INACTIVE' END;
ALTER TABLE vendor_menu_items ADD CONSTRAINT menu_availability_status_valid
    CHECK (availability_status IN ('ACTIVE', 'INACTIVE', 'SOLD_OUT'));
-- Single source of truth: the legacy public boolean remains readable, not writable.
ALTER TABLE vendor_menu_items DROP COLUMN available;
ALTER TABLE vendor_menu_items ADD COLUMN available BOOLEAN
    GENERATED ALWAYS AS (availability_status = 'ACTIVE') STORED;
