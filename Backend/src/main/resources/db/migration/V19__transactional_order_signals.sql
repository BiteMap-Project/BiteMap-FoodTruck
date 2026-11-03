-- Compact invalidation state, not a second order store or an unbounded event log.
CREATE TABLE vendor_order_signals (
    vendor_id BIGINT PRIMARY KEY REFERENCES vendors(id) ON DELETE CASCADE,
    revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0),
    created_count BIGINT NOT NULL DEFAULT 0 CHECK (created_count >= 0),
    placed_count BIGINT NOT NULL DEFAULT 0 CHECK (placed_count >= 0)
);
INSERT INTO vendor_order_signals(vendor_id,revision,created_count,placed_count)
SELECT vendor_id,count(*),count(*),count(*) FILTER (WHERE status='PLACED')
FROM customer_orders GROUP BY vendor_id;

CREATE FUNCTION update_vendor_order_signal() RETURNS trigger LANGUAGE plpgsql SET search_path FROM CURRENT AS $$
DECLARE truck BIGINT; created_delta BIGINT := 0; placed_delta BIGINT := 0;
BEGIN
    IF TG_OP='INSERT' THEN
        truck := NEW.vendor_id; created_delta := 1;
        placed_delta := CASE WHEN NEW.status='PLACED' THEN 1 ELSE 0 END;
    ELSIF TG_OP='DELETE' THEN
        truck := OLD.vendor_id;
        placed_delta := CASE WHEN OLD.status='PLACED' THEN -1 ELSE 0 END;
    ELSE
        IF NEW.vendor_id <> OLD.vendor_id THEN
            RAISE EXCEPTION 'An order cannot be moved to another vendor';
        END IF;
        IF NEW IS NOT DISTINCT FROM OLD THEN RETURN NEW; END IF;
        truck := NEW.vendor_id;
        placed_delta := (CASE WHEN NEW.status='PLACED' THEN 1 ELSE 0 END)
                      - (CASE WHEN OLD.status='PLACED' THEN 1 ELSE 0 END);
    END IF;
    INSERT INTO vendor_order_signals(vendor_id) VALUES (truck) ON CONFLICT DO NOTHING;
    UPDATE vendor_order_signals SET revision=revision+1,
        created_count=created_count+created_delta, placed_count=placed_count+placed_delta
    WHERE vendor_id=truck;
    RETURN NULL;
END;
$$;
CREATE TRIGGER customer_order_signal AFTER INSERT OR UPDATE OR DELETE ON customer_orders
FOR EACH ROW EXECUTE FUNCTION update_vendor_order_signal();
