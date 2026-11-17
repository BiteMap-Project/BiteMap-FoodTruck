package com.Bitemap.Backend.order;

import java.security.MessageDigest;
import java.security.SecureRandom;
import java.nio.charset.StandardCharsets;
import java.util.Base64;
import java.util.Locale;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/** Internal storage only. Callers must authorize and hold the order lock when verifying. */
@Component
public class PickupCodes {
    private static final SecureRandom RANDOM = new SecureRandom();
    private final JdbcTemplate jdbc;
    private final PickupCodeCipher cipher;

    public PickupCodes(JdbcTemplate jdbc, @Value("${PICKUP_CODE_KEY:}") String key) {
        this.jdbc = jdbc;
        try { this.cipher = new PickupCodeCipher(Base64.getDecoder().decode(key)); }
        catch (IllegalArgumentException exception) {
            throw new IllegalStateException("Configure PICKUP_CODE_KEY as a Base64-encoded 32-byte secret.");
        }
    }

    String forCustomer(long orderId, String status) {
        if (status.equals("COMPLETED") || status.equals("CANCELLED")) return null;
        ensure(orderId);
        return read(orderId);
    }

    private void ensure(long orderId) {
        if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM order_pickup_codes WHERE order_id=?)", Boolean.class, orderId))) return;
        String code = String.format(Locale.ROOT, "%06d", RANDOM.nextInt(1_000_000));
        jdbc.update("INSERT INTO order_pickup_codes(order_id,ciphertext) VALUES (?,?) ON CONFLICT (order_id) DO NOTHING",
                orderId, cipher.encrypt(orderId, code));
    }

    private String read(long orderId) {
        try { return cipher.decrypt(orderId, jdbc.queryForObject("SELECT ciphertext FROM order_pickup_codes WHERE order_id=?", String.class, orderId)); }
        catch (IllegalStateException exception) { throw new PickupCodeUnavailableException(); }
    }

    boolean matches(long orderId, String code) {
        return MessageDigest.isEqual(read(orderId).getBytes(StandardCharsets.US_ASCII), code.getBytes(StandardCharsets.US_ASCII));
    }

    /** Returns a controlled failure instead of throwing so failed-attempt updates commit. */
    Failure check(long orderId, String code) {
        ensure(orderId);
        Long seconds = jdbc.queryForObject("SELECT GREATEST(0,CEIL(EXTRACT(EPOCH FROM locked_until-clock_timestamp())))::bigint FROM order_pickup_codes WHERE order_id=?", Long.class, orderId);
        if (seconds != null && seconds > 0) return new Failure(429, "Too many incorrect pickup codes. Wait before trying again.", seconds);
        if (matches(orderId, code)) return null;
        int failures = jdbc.queryForObject("""
                UPDATE order_pickup_codes SET failed_attempts=CASE WHEN locked_until IS NOT NULL THEN 1 ELSE failed_attempts+1 END,
                    locked_until=NULL WHERE order_id=? RETURNING failed_attempts
                """, Integer.class, orderId);
        if (failures >= 5) {
            jdbc.update("UPDATE order_pickup_codes SET locked_until=clock_timestamp()+interval '5 minutes' WHERE order_id=?", orderId);
            return new Failure(429, "Too many incorrect pickup codes. Try again in five minutes.", 300);
        }
        return new Failure(409, "Pickup code is incorrect. Ask the customer to check their order details.", 0);
    }

    boolean verifiedRetry(long orderId, long version, long actor, String code) {
        return Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM order_pickup_codes WHERE order_id=? AND verified_version=? AND verified_by=?)",
                Boolean.class, orderId, version + 1, actor)) && matches(orderId, code);
    }

    void markVerified(long orderId, long version, long actor) {
        jdbc.update("UPDATE order_pickup_codes SET verified_version=?,verified_by=?,failed_attempts=0,locked_until=NULL WHERE order_id=?", version, actor, orderId);
    }

    record Failure(int status, String message, long retryAfter) {}
}
