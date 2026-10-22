ALTER TABLE vendors
    ADD COLUMN accepting_orders BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN ordering_version BIGINT NOT NULL DEFAULT 0 CHECK (ordering_version >= 0);
