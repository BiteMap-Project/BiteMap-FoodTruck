package com.Bitemap.Backend.auth.limit;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

@Repository
public class AuthLimitRepository {
    private final JdbcTemplate jdbc;
    public AuthLimitRepository(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    public record Bucket(String scope, String key, int capacity, int refillSeconds) {}
    private record Credit(Bucket bucket, double tokens, Instant time) {}

    // Commit before authentication begins, including when its password check fails.
    // All callers acquire the IP bucket before the account bucket (stable order).
    @Transactional(propagation = Propagation.REQUIRES_NEW, timeout = 5)
    public long consume(List<Bucket> buckets) {
        jdbc.execute("SET LOCAL lock_timeout = '1500ms'");
        jdbc.execute("SET LOCAL statement_timeout = '3000ms'");
        var credits = new ArrayList<Credit>();
        for (var bucket : buckets) {
            jdbc.update("""
                    INSERT INTO auth_rate_limits(scope,subject_key,tokens,updated_at,expires_at)
                    VALUES (?,?,?,clock_timestamp(),clock_timestamp()+interval '1 day')
                    ON CONFLICT DO NOTHING
                    """, bucket.scope(), bucket.key(), bucket.capacity());
            var row = jdbc.queryForMap("""
                    SELECT tokens,updated_at FROM auth_rate_limits
                    WHERE scope=? AND subject_key=? FOR UPDATE
                    """, bucket.scope(), bucket.key());
            Instant now = jdbc.queryForObject("SELECT clock_timestamp()", Timestamp.class).toInstant();
            Instant previous = ((Timestamp) row.get("updated_at")).toInstant();
            // A backward wall-clock adjustment must not manufacture tokens.
            if (now.isBefore(previous)) now = previous;
            double elapsed = java.time.Duration.between(previous, now).toNanos() / 1_000_000_000.0;
            double available = Math.min(bucket.capacity(), ((Number) row.get("tokens")).doubleValue()
                    + elapsed / bucket.refillSeconds());
            if (available < 1) {
                // Do not extend cooldown, consume other buckets, or create account
                // keys after an IP is exhausted. This also bounds email-key churn.
                return Math.max(1, (long) Math.ceil((1 - available) * bucket.refillSeconds()));
            }
            credits.add(new Credit(bucket, available - 1, now));
        }
        for (var credit : credits) {
            var bucket = credit.bucket();
            long refill = (long) Math.ceil((bucket.capacity() - credit.tokens()) * bucket.refillSeconds());
            jdbc.update("""
                    UPDATE auth_rate_limits SET tokens=?,updated_at=?,expires_at=?
                    WHERE scope=? AND subject_key=?
                    """, credit.tokens(), Timestamp.from(credit.time()),
                    Timestamp.from(credit.time().plusSeconds(refill + 86400L)), bucket.scope(), bucket.key());
        }
        return 0;
    }

    @Transactional(propagation = Propagation.REQUIRES_NEW, timeout = 5)
    public int cleanup() {
        // Multiple instances can clean without blocking active authentication.
        return jdbc.update("""
                DELETE FROM auth_rate_limits WHERE (scope,subject_key) IN (
                    SELECT scope,subject_key FROM auth_rate_limits
                    WHERE expires_at < clock_timestamp() ORDER BY expires_at
                    LIMIT 500 FOR UPDATE SKIP LOCKED)
                """);
    }
}
