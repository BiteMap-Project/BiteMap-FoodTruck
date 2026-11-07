ALTER TABLE vendors ADD COLUMN acceptance_minutes INTEGER NOT NULL DEFAULT 5
    CHECK (acceptance_minutes IN (3,5,10,15,20));

-- Null snapshots intentionally grandfather orders placed before this release.
ALTER TABLE customer_orders
    ADD COLUMN acceptance_minutes INTEGER,
    ADD COLUMN acceptance_deadline TIMESTAMPTZ,
    ADD CONSTRAINT customer_orders_acceptance_snapshot CHECK (
        (acceptance_minutes IS NULL AND acceptance_deadline IS NULL) OR
        (acceptance_minutes IS NOT NULL AND acceptance_minutes IN (3,5,10,15,20) AND acceptance_deadline IS NOT NULL)
    );
CREATE INDEX customer_orders_pending_deadline_idx ON customer_orders(acceptance_deadline,id)
    WHERE status='PLACED' AND acceptance_deadline IS NOT NULL;

ALTER TABLE customer_order_status_history
    ALTER COLUMN changed_by_user_id DROP NOT NULL,
    ADD COLUMN actor_kind VARCHAR(8) NOT NULL DEFAULT 'USER',
    ADD CONSTRAINT customer_order_history_actor CHECK (
        (actor_kind='USER' AND changed_by_user_id IS NOT NULL) OR
        (actor_kind='SYSTEM' AND changed_by_user_id IS NULL AND from_status='PLACED' AND to_status='CANCELLED')
    );
