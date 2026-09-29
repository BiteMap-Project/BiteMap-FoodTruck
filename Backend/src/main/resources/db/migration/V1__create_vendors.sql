-- Vendor discovery foundation only. Ownership, coordinates, and schedules will
-- be introduced by later migrations alongside their corresponding features.
CREATE TABLE vendors (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    category VARCHAR(80) NOT NULL,
    location VARCHAR(200) NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT vendors_name_not_blank CHECK (length(trim(name)) > 0),
    CONSTRAINT vendors_category_not_blank CHECK (length(trim(category)) > 0),
    CONSTRAINT vendors_location_not_blank CHECK (length(trim(location)) > 0)
);
