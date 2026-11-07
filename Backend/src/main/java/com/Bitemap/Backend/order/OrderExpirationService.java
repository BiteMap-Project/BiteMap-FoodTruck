package com.Bitemap.Backend.order;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderExpirationService {
    public static final String REASON = "The truck did not accept your order in time.";
    private final JdbcTemplate jdbc;
    public OrderExpirationService(JdbcTemplate jdbc) { this.jdbc=jdbc; }

    /** One order per transaction avoids cross-truck signal-lock cycles between workers. */
    @Transactional(timeout=5)
    public boolean expireOne() {
        jdbc.execute("SET LOCAL lock_timeout = '1000ms'");
        var due=jdbc.queryForList("""
            SELECT id FROM customer_orders
            WHERE status='PLACED' AND acceptance_deadline <= statement_timestamp()
            ORDER BY acceptance_deadline,id LIMIT 1 FOR UPDATE SKIP LOCKED
            """,Long.class);
        if(due.isEmpty()) return false;
        long id=due.getFirst();
        jdbc.update("""
            UPDATE customer_orders SET status='CANCELLED',version=version+1,updated_at=clock_timestamp(),
                cancellation_reason=?,estimated_ready_at=NULL WHERE id=?
            """,REASON,id);
        jdbc.update("""
            INSERT INTO customer_order_status_history
                (order_id,from_status,to_status,version,changed_at,cancellation_reason,changed_by_user_id,actor_kind)
            SELECT id,'PLACED','CANCELLED',version,updated_at,cancellation_reason,NULL,'SYSTEM'
            FROM customer_orders WHERE id=?
            """,id);
        return true;
    }
}
