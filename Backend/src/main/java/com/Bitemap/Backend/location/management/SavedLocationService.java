package com.Bitemap.Backend.location.management;

import java.time.ZoneId;
import java.util.List;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import static com.Bitemap.Backend.location.management.ScheduleException.Kind.*;

@Service @Validated @Transactional(isolation=Isolation.READ_COMMITTED)
public class SavedLocationService {
    private final JdbcTemplate jdbc;
    private static final RowMapper<SavedLocation> ROW = (r,i) -> new SavedLocation(r.getLong("id"),r.getString("name"),
        r.getString("venue_name"),r.getString("address"),r.getDouble("latitude"),r.getDouble("longitude"),
        r.getString("time_zone"),r.getBoolean("archived"),r.getLong("version"),r.getTimestamp("updated_at").toInstant());
    public SavedLocationService(JdbcTemplate jdbc) { this.jdbc=jdbc; }

    public List<SavedLocation> list(String email) {
        long owner=owner(email,false);
        // Writes enforce the same bound; never download an unbounded address book.
        return jdbc.query("SELECT * FROM operator_saved_locations WHERE operator_id=? AND NOT archived ORDER BY lower(name),id LIMIT 100", ROW,owner);
    }
    public SavedLocation get(String email,long id) { return find(owner(email,false),id); }
    public SavedLocation create(String email,@NotNull @Valid SavedLocation.Details d) {
        long owner=owner(email,true);
        validate(d);
        if (jdbc.queryForObject("SELECT count(*) FROM operator_saved_locations WHERE operator_id=? AND NOT archived",Long.class,owner)>=100)
            throw conflict("You can save up to 100 active locations. Archive an unused location first.");
        unique(owner,null,d.name());
        return jdbc.queryForObject("""
            INSERT INTO operator_saved_locations(operator_id,name,venue_name,address,latitude,longitude,time_zone)
            VALUES (?,?,?,?,?,?,?) RETURNING *
            """,ROW,owner,d.name(),d.venueName(),d.address(),d.latitude(),d.longitude(),d.timeZone());
    }
    public SavedLocation update(String email,long id,@NotNull @Valid SavedLocation.Update request) {
        long owner=owner(email,true);
        var current=find(owner,id);
        if (current.archived()) throw conflict("This location is archived. Save a new location instead.");
        version(current,request.version());
        var d=request.location(); validate(d); unique(owner,id,d.name());
        return jdbc.queryForObject("""
            UPDATE operator_saved_locations SET name=?,venue_name=?,address=?,latitude=?,longitude=?,time_zone=?,
            version=version+1,updated_at=clock_timestamp(),location_confirmed_at=clock_timestamp()
            WHERE id=? AND operator_id=? RETURNING *
            """,ROW,d.name(),d.venueName(),d.address(),d.latitude(),d.longitude(),d.timeZone(),id,owner);
    }
    public SavedLocation archive(String email,long id,@NotNull @Valid SavedLocation.Archive request) {
        long owner=owner(email,true);
        var current=find(owner,id);
        // Terminal and idempotent: retrying an already archived resource changes nothing.
        if (current.archived()) return current;
        version(current,request.version());
        return jdbc.queryForObject("UPDATE operator_saved_locations SET archived=true,version=version+1,updated_at=clock_timestamp() WHERE id=? AND operator_id=? RETURNING *",ROW,id,owner);
    }
    private long owner(String email,boolean write) {
        var owners=jdbc.query(com.Bitemap.Backend.auth.OperatorOwnership.SQL,(r,i)->r.getLong(1),email);
        if (owners.isEmpty()) throw missing();
        long owner=owners.getFirst();
        // Separate owner-scoped advisory lock avoids upgrading the ownership SHARE lock.
        // Serializes duplicate-name/cap checks and mutations across backend instances.
        if (write) jdbc.query("SELECT pg_advisory_xact_lock(73126, hashtext(?))",(r,i)->0,Long.toString(owner));
        return owner;
    }
    private SavedLocation find(long owner,long id) {
        return jdbc.query("SELECT * FROM operator_saved_locations WHERE operator_id=? AND id=?",ROW,owner,id)
            .stream().findFirst().orElseThrow(SavedLocationService::missing);
    }
    private void unique(long owner,Long id,String name) {
        if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM operator_saved_locations WHERE operator_id=? AND NOT archived AND lower(name)=lower(?) AND (?::bigint IS NULL OR id<>?))",Boolean.class,owner,name,id,id)))
            throw conflict("A saved location already uses this name. Choose another name or reload your locations.");
    }
    private void validate(SavedLocation.Details d) {
        if (!Boolean.TRUE.equals(d.locationConfirmed()) || !Double.isFinite(d.latitude()) || !Double.isFinite(d.longitude()))
            throw new ScheduleException(INVALID,"Confirm a valid pickup pin before saving.");
        String zone=d.timeZone();
        if ((!zone.equals("UTC") && !zone.contains("/")) || zone.startsWith("posix/") || zone.startsWith("right/")
                || !ZoneId.getAvailableZoneIds().contains(zone)
                || !Boolean.TRUE.equals(jdbc.queryForObject("SELECT valid_stop_time_zone(?)",Boolean.class,zone)))
            throw new ScheduleException(INVALID,"Use a supported IANA time zone, such as America/Los_Angeles.");
    }
    private static void version(SavedLocation current,long version) {
        if (current.version()!=version) throw conflict("This saved location changed. Reload before trying again.");
    }
    private static ScheduleException missing() { return new ScheduleException(NOT_FOUND,"Saved location not found."); }
    private static ScheduleException conflict(String detail) { return new ScheduleException(CONFLICT,detail); }
}
