-- Require at least one non-whitespace character, including for tabs/newlines.
-- Validate existing rows too: fail and roll back rather than silently changing
-- or deleting vendor data. See docs/database-migrations.md for remediation.
ALTER TABLE vendors
    DROP CONSTRAINT vendors_name_not_blank,
    DROP CONSTRAINT vendors_category_not_blank,
    DROP CONSTRAINT vendors_location_not_blank,
    ADD CONSTRAINT vendors_name_not_blank CHECK (name ~ '[^[:space:]]'),
    ADD CONSTRAINT vendors_category_not_blank CHECK (category ~ '[^[:space:]]'),
    ADD CONSTRAINT vendors_location_not_blank CHECK (location ~ '[^[:space:]]');
