package com.Bitemap.Backend.location.management;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.DateTimeException;
import java.time.Instant;
import java.time.ZoneId;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import static com.Bitemap.Backend.location.management.ScheduleException.Kind.*;

@Service
@Validated
@Transactional(isolation = Isolation.READ_COMMITTED)
public class OperatorStopService {
    private static final RowMapper<ManagedStop> ROW = (r, i) -> new ManagedStop(
            r.getLong("id"), r.getLong("vendor_id"), r.getString("venue_name"), r.getString("address"),
            r.getDouble("latitude"), r.getDouble("longitude"), r.getTimestamp("starts_at").toInstant(),
            r.getTimestamp("ends_at").toInstant(), r.getString("time_zone"), r.getString("status"),
            r.getLong("version"), r.getTimestamp("created_at").toInstant(), r.getTimestamp("updated_at").toInstant());
    private final JdbcTemplate jdbc;
    private final Clock clock;
    public OperatorStopService(JdbcTemplate jdbc, Clock clock) { this.jdbc = jdbc; this.clock = clock; }

    public ManagedStop create(String email, long vendorId, @NotNull @Valid StopRequests.Details request) {
        ownedVendor(email, vendorId, true);
        validate(request);
        rejectOverlap(vendorId, null, request);
        return jdbc.queryForObject("""
                INSERT INTO vendor_stops(vendor_id,venue_name,address,latitude,longitude,starts_at,ends_at,time_zone)
                VALUES (?,?,?,?,?,?,?,?) RETURNING *
                """, ROW, vendorId, request.venueName(), request.address(), request.latitude(), request.longitude(),
                Timestamp.from(request.startsAt().toInstant()), Timestamp.from(request.endsAt().toInstant()), request.timeZone());
    }

    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public ManagedStop.Page list(String email, long vendorId, @Min(0) @Max(10000) int page, @Min(1) @Max(100) int size) {
        ownedVendor(email, vendorId, false);
        long count = jdbc.queryForObject("SELECT count(*) FROM vendor_stops WHERE vendor_id = ?", Long.class, vendorId);
        var rows = jdbc.query("SELECT * FROM vendor_stops WHERE vendor_id = ? ORDER BY starts_at DESC,id DESC LIMIT ? OFFSET ?",
                ROW, vendorId, size, (long) page * size);
        return new ManagedStop.Page(rows, page, size, count, (count + size - 1) / size);
    }

    public ManagedStop get(String email, long vendorId, long id) {
        ownedVendor(email, vendorId, false);
        return find(vendorId, id);
    }

    public ManagedStop update(String email, long vendorId, long id, @NotNull @Valid StopRequests.Update request) {
        ownedVendor(email, vendorId, true);
        var current = find(vendorId, id);
        version(current, request.version());
        if (!current.status().equals("scheduled") || !current.startsAt().isAfter(clock.instant())) {
            throw new ScheduleException(CONFLICT, "Only future scheduled stops can be edited.");
        }
        var stop = request.stop();
        validate(stop);
        rejectOverlap(vendorId, id, stop);
        var updated = jdbc.query("""
                UPDATE vendor_stops SET venue_name=?,address=?,latitude=?,longitude=?,starts_at=?,ends_at=?,time_zone=?,
                    version=version+1,updated_at=clock_timestamp()
                WHERE id=? AND vendor_id=? AND version=? RETURNING *
                """, ROW, stop.venueName(), stop.address(), stop.latitude(), stop.longitude(),
                Timestamp.from(stop.startsAt().toInstant()), Timestamp.from(stop.endsAt().toInstant()), stop.timeZone(),
                id, vendorId, request.version());
        return updated.stream().findFirst().orElseThrow(OperatorStopService::stale);
    }

    public ManagedStop cancel(String email, long vendorId, long id, @NotNull @Valid StopRequests.Cancel request) {
        ownedVendor(email, vendorId, true);
        var current = find(vendorId, id);
        version(current, request.version());
        if (current.status().equals("cancelled")) return current;
        if (current.status().equals("ended") || !current.endsAt().isAfter(clock.instant())) {
            throw new ScheduleException(CONFLICT, "Completed stops are retained as history and cannot be cancelled.");
        }
        return jdbc.query("""
                UPDATE vendor_stops SET status='cancelled',version=version+1,updated_at=clock_timestamp()
                WHERE id=? AND vendor_id=? AND version=? RETURNING *
                """, ROW, id, vendorId, request.version()).stream().findFirst().orElseThrow(OperatorStopService::stale);
    }

    private void ownedVendor(String email, long vendorId, boolean write) {
        // Consistent account-then-vendor lock ordering. Account lock prevents a racing disable.
        var owners = jdbc.query(com.Bitemap.Backend.auth.OperatorOwnership.SQL,
                (r, i) -> r.getLong(1), email);
        if (owners.isEmpty()) throw missing();
        String lock = write ? " FOR UPDATE" : " FOR SHARE";
        var vendors = jdbc.query("SELECT id FROM vendors WHERE id=? AND operator_id=?" + lock,
                (r, i) -> r.getLong(1), vendorId, owners.getFirst());
        if (vendors.isEmpty()) throw missing();
    }

    private ManagedStop find(long vendorId, long id) {
        return jdbc.query("SELECT * FROM vendor_stops WHERE id=? AND vendor_id=?", ROW, id, vendorId)
                .stream().findFirst().orElseThrow(OperatorStopService::missing);
    }

    private void rejectOverlap(long vendorId, Long excludedId, StopRequests.Details stop) {
        // Vendor row is exclusively locked. In READ COMMITTED a waiting writer sees the previous commit here.
        boolean overlap = jdbc.queryForObject("""
                SELECT EXISTS (SELECT 1 FROM vendor_stops WHERE vendor_id=? AND status IN ('scheduled','serving')
                  AND starts_at < ? AND ends_at > ? AND (?::bigint IS NULL OR id <> ?::bigint))
                """, Boolean.class, vendorId, Timestamp.from(stop.endsAt().toInstant()),
                Timestamp.from(stop.startsAt().toInstant()), excludedId, excludedId);
        if (overlap) throw new ScheduleException(CONFLICT, "This truck already has a stop during that time. Choose a non-overlapping interval.");
    }

    private void validate(StopRequests.Details stop) {
        if (!Double.isFinite(stop.latitude()) || !Double.isFinite(stop.longitude())) throw invalid("Coordinates must be finite.");
        var start = stop.startsAt(); var end = stop.endsAt();
        if (!start.toInstant().isAfter(clock.instant()) || !end.toInstant().isAfter(start.toInstant())
                || start.getYear() < 1900 || end.toInstant().isAfter(Instant.parse("2100-01-01T00:00:00Z"))) {
            throw invalid("Use a future start and a later end, before 2100.");
        }
        try {
            String name = stop.timeZone();
            if ((!name.equals("UTC") && !name.contains("/")) || name.startsWith("posix/") || name.startsWith("right/")
                    || !ZoneId.getAvailableZoneIds().contains(name)
                    || !Boolean.TRUE.equals(jdbc.queryForObject("SELECT valid_stop_time_zone(?)", Boolean.class, name))) {
                throw invalid("Use a supported IANA time zone, such as America/Los_Angeles.");
            }
            var rules = ZoneId.of(name).getRules();
            if (!rules.getValidOffsets(start.toLocalDateTime()).contains(start.getOffset())
                    || !rules.getValidOffsets(end.toLocalDateTime()).contains(end.getOffset())) {
                throw invalid("Date/time offsets must match the selected time zone; check daylight-saving transitions.");
            }
        } catch (DateTimeException e) { throw invalid("Invalid time zone or date/time."); }
    }

    private static void version(ManagedStop stop, long version) { if (stop.version() != version) throw stale(); }
    private static ScheduleException missing() { return new ScheduleException(NOT_FOUND, "Schedule resource not found."); }
    private static ScheduleException stale() { return new ScheduleException(CONFLICT, "Schedule changed. Reload before retrying."); }
    private static ScheduleException invalid(String message) { return new ScheduleException(INVALID, message); }
}
