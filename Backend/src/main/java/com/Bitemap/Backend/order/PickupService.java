package com.Bitemap.Backend.order;

import java.sql.Timestamp;
import java.time.Clock;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PickupService {
    private final JdbcTemplate jdbc;
    private final Clock clock;
    private static final RowMapper<PickupDetails> ROW = (r, i) -> new PickupDetails(
        r.getLong("stop_id"),r.getString("venue_name"),r.getString("address"),r.getDouble("latitude"),
        r.getDouble("longitude"),r.getTimestamp("starts_at").toInstant(),r.getTimestamp("ends_at").toInstant(),r.getString("time_zone"));

    public PickupService(JdbcTemplate jdbc, Clock clock) { this.jdbc=jdbc; this.clock=clock; }

    @Transactional(readOnly=true)
    public PickupDetails current(long vendorId) {
        Boolean accepting = jdbc.query("SELECT accepting_orders FROM vendors WHERE id=?", r -> r.next() ? r.getBoolean(1) : null, vendorId);
        if (Boolean.FALSE.equals(accepting)) throw new OrderUnavailableException("Temporarily not accepting orders.");
        var now=Timestamp.from(clock.instant());
        var rows=jdbc.query("""
            SELECT id AS stop_id,venue_name,address,latitude,longitude,starts_at,ends_at,time_zone
            FROM vendor_stops WHERE vendor_id=? AND status IN ('scheduled','serving')
              AND starts_at <= ? AND ends_at > ? ORDER BY id LIMIT 2
            """,ROW,vendorId,now,now);
        // Fail closed for legacy/imported overlapping stops instead of picking an arbitrary location.
        return rows.size()==1 ? rows.getFirst() : null;
    }

    // Caller holds the vendor row FOR SHARE. Schedule writers take FOR UPDATE on that
    // row, so validation and saving cannot race an edit/cancellation via our APIs.
    public PickupDetails requireCurrent(long vendorId,long stopId) {
        var stop=current(vendorId);
        if (stop==null || stop.stopId()!=stopId) throw new OrderUnavailableException(
            "This pickup stop is no longer available for ordering. Refresh pickup details before trying again.");
        return stop;
    }

    public void save(long orderId,PickupDetails p) {
        jdbc.update("""
            INSERT INTO customer_order_pickups(order_id,stop_id,venue_name,address,latitude,longitude,starts_at,ends_at,time_zone)
            VALUES (?,?,?,?,?,?,?,?,?)
            """,orderId,p.stopId(),p.venueName(),p.address(),p.latitude(),p.longitude(),Timestamp.from(p.startsAt()),Timestamp.from(p.endsAt()),p.timeZone());
    }

    public PickupDetails saved(long orderId) {
        return jdbc.query("SELECT * FROM customer_order_pickups WHERE order_id=?",ROW,orderId).stream().findFirst().orElse(null);
    }
}
