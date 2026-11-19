package com.Bitemap.Backend.vendor;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class TruckAvailabilityService {
    public record Availability(String status, Instant checkedAt, Instant ordersCloseAt, Long stopId) {}
    private final NamedParameterJdbcTemplate jdbc;
    private final Clock clock;

    public TruckAvailabilityService(NamedParameterJdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    // Same eligibility as PickupService: exactly one active stop, ordering enabled,
    // and before the operator's cutoff. This describes pickup ordering, not live GPS.
    @Transactional(readOnly = true)
    public Map<Long, Availability> forVendors(List<Long> ids) {
        if (ids.isEmpty()) return Map.of();
        Instant now = clock.instant();
        var result = new HashMap<Long, Availability>();
        jdbc.query("""
            SELECT v.id, v.accepting_orders, v.ordering_cutoff_minutes,
                   count(s.id) AS active_count, max(s.id) AS stop_id, max(s.ends_at) AS ends_at
            FROM vendors v
            LEFT JOIN vendor_stops s ON s.vendor_id = v.id
                AND s.status IN ('scheduled', 'serving')
                AND s.starts_at <= :now AND s.ends_at > :now
            WHERE v.id IN (:ids)
            GROUP BY v.id, v.accepting_orders, v.ordering_cutoff_minutes
            """, Map.of("ids", ids, "now", Timestamp.from(now)),
            (org.springframework.jdbc.core.RowCallbackHandler) row -> {
                Instant closes = row.getLong("active_count") == 1
                    ? row.getTimestamp("ends_at").toInstant().minusSeconds(row.getLong("ordering_cutoff_minutes") * 60)
                    : null;
                boolean open = row.getBoolean("accepting_orders") && closes != null && now.isBefore(closes);
                String status = !open ? "CLOSED" : !now.isBefore(closes.minusSeconds(30 * 60)) ? "CLOSING_SOON" : "OPEN";
                result.put(row.getLong("id"), new Availability(status, now, open ? closes : null,
                    open ? row.getLong("stop_id") : null));
            });
        return result;
    }
}