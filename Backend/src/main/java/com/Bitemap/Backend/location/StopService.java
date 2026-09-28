package com.Bitemap.Backend.location;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.namedparam.MapSqlParameterSource;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import com.Bitemap.Backend.vendor.VendorSummary;

@Service
public class StopService {
    private final NamedParameterJdbcTemplate jdbc;

    public StopService(NamedParameterJdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    // Count and page see one snapshot even if another request changes a stop.
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public StopPage list(String q, String cuisine, OffsetDateTime from, OffsetDateTime to,
            Double lat, Double lon, Double radiusKm, int page, int size) {
        Instant evaluatedAt = Instant.now();
        Instant start = from == null ? evaluatedAt : from.toInstant();
        Instant end;
        try {
            end = to == null ? start.plus(Duration.ofDays(7)) : to.toInstant();
        } catch (java.time.DateTimeException | ArithmeticException exception) {
            throw invalid("Invalid schedule range.");
        }
        // Keep timestamps within a portable, supported application range.
        if (start.isBefore(Instant.parse("1900-01-01T00:00:00Z"))
                || end.isAfter(Instant.parse("2100-01-01T00:00:00Z"))
                || !end.isAfter(start) || Duration.between(start, end).compareTo(Duration.ofDays(31)) > 0) {
            throw invalid("Use an increasing schedule range of at most 31 days between 1900 and 2100.");
        }
        if ((lat == null) != (lon == null)) throw invalid("Supply lat and lon together.");
        if (lat != null && (!Double.isFinite(lat) || !Double.isFinite(lon)
                || lat < -90 || lat > 90 || lon < -180 || lon > 180)) {
            throw invalid("Invalid search coordinates.");
        }
        if (radiusKm != null && (lat == null || !Double.isFinite(radiusKm) || radiusKm <= 0 || radiusKm > 100)) {
            throw invalid("radiusKm requires a search center and must be greater than 0 and at most 100.");
        }
        String pattern = "%" + q.strip().replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
        var params = new MapSqlParameterSource()
                .addValue("from", Timestamp.from(start)).addValue("to", Timestamp.from(end))
                .addValue("q", pattern).addValue("cuisine", cuisine.strip())
                .addValue("lat", lat).addValue("lon", lon)
                .addValue("limit", size).addValue("offset", (long) page * size);
        // Spherical straight-line distance, in meters. Clamp roundoff at coincident/antipodal points.
        // Only fixed SQL fragments vary; every user value is a bound parameter.
        String distance = lat == null ? "NULL::double precision" : """
                6371008.8 * acos(least(1.0, greatest(-1.0,
                    sin(radians(:lat)) * sin(radians(s.latitude))
                    + cos(radians(:lat)) * cos(radians(s.latitude))
                    * cos(radians(s.longitude - :lon)))))
                """;
        String cte = """
                WITH matches AS (
                    SELECT s.*, v.name, v.category, v.location AS vendor_location,
                """ + distance + " AS distance_meters " + """
                    FROM vendor_stops s JOIN vendors v ON v.id = s.vendor_id
                    WHERE s.status IN ('scheduled', 'serving')
                      AND s.starts_at < :to AND s.ends_at > :from
                      AND (lower(v.name) LIKE lower(:q) ESCAPE '!'
                        OR lower(v.category) LIKE lower(:q) ESCAPE '!'
                        OR lower(s.venue_name) LIKE lower(:q) ESCAPE '!'
                        OR lower(s.address) LIKE lower(:q) ESCAPE '!')
                      AND (:cuisine = '' OR lower(v.category) = lower(:cuisine))
                )
                """;
        String where = "";
        if (radiusKm != null) {
            where = " WHERE distance_meters <= :radius";
            params.addValue("radius", radiusKm * 1000);
        }
        long count = jdbc.queryForObject(cte + "SELECT count(*) FROM matches" + where, params, Long.class);
        String order = lat == null ? "starts_at, id" : "distance_meters, starts_at, id";
        var items = jdbc.query(cte + "SELECT * FROM matches" + where
                + " ORDER BY " + order + " LIMIT :limit OFFSET :offset", params, (rs, row) -> {
            Timestamp confirmed = rs.getTimestamp("last_confirmed_at");
            return new StopPage.Stop(rs.getLong("id"),
                    new VendorSummary(rs.getLong("vendor_id"), rs.getString("name"),
                            rs.getString("category"), rs.getString("vendor_location")),
                    rs.getString("venue_name"), rs.getString("address"),
                    rs.getDouble("latitude"), rs.getDouble("longitude"),
                    rs.getTimestamp("starts_at").toInstant(), rs.getTimestamp("ends_at").toInstant(),
                    rs.getString("time_zone"), rs.getString("status"),
                    confirmed == null ? null : confirmed.toInstant(), rs.getObject("distance_meters", Double.class));
        });
        return new StopPage(items, page, size, count, (count + size - 1) / size, evaluatedAt);
    }

    private static ResponseStatusException invalid(String message) {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, message);
    }
}
