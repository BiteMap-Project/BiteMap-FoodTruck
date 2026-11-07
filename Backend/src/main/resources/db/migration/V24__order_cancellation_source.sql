-- Legacy cancellations deliberately remain NULL: audit user identity alone
-- cannot distinguish customer/owner actions by an account with both roles.
ALTER TABLE customer_orders ADD COLUMN cancellation_source VARCHAR(24),
    ADD CONSTRAINT customer_orders_cancellation_source_check CHECK (
        cancellation_source IS NULL OR
        (status='CANCELLED' AND cancellation_source IN ('CUSTOMER','OWNER','ACCEPTANCE_TIMEOUT'))
    );
