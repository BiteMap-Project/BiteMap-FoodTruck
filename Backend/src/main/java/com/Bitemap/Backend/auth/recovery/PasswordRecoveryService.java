package com.Bitemap.Backend.auth.recovery;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class PasswordRecoveryService {
    private final JdbcTemplate jdbc;
    private final PasswordEncoder encoder;
    private final RecoverySettings settings;
    public PasswordRecoveryService(JdbcTemplate jdbc, PasswordEncoder encoder, RecoverySettings settings) {
        this.jdbc = jdbc; this.encoder = encoder; this.settings = settings;
    }

    @Transactional(timeout = 5)
    public void request(String email) {
        requireEnabled();
        // Same query and queue operation for known, unknown and disabled accounts.
        jdbc.update("""
                INSERT INTO password_recovery_mail(user_id,credential_version,kind)
                SELECT u.id,u.credential_version,'RESET' FROM (SELECT 1) seed
                LEFT JOIN app_users u ON lower(u.email)=? AND u.enabled
                """, email);
    }

    @Transactional(timeout = 10)
    public void reset(String token, String password) {
        requireEnabled();
        String hash = hash(token);
        var ids = jdbc.queryForList("SELECT user_id FROM password_reset_tokens WHERE token_hash=?", Long.class, hash);
        if (ids.isEmpty()) throw new InvalidResetToken();
        long user = ids.getFirst();
        // All token issuance/consumption for an account serializes on this row.
        var versions = jdbc.queryForList("SELECT credential_version FROM app_users WHERE id=? AND enabled FOR UPDATE", Long.class, user);
        if (versions.isEmpty()) throw new InvalidResetToken();
        int consumed = jdbc.update("""
                DELETE FROM password_reset_tokens WHERE token_hash=? AND user_id=?
                AND credential_version=? AND expires_at > clock_timestamp()
                """, hash, user, versions.getFirst());
        if (consumed != 1) throw new InvalidResetToken();
        jdbc.update("UPDATE app_users SET password_hash=?,credential_version=credential_version+1 WHERE id=?", encoder.encode(password), user);
        jdbc.update("DELETE FROM password_reset_tokens WHERE user_id=?", user);
        jdbc.update("INSERT INTO password_recovery_mail(user_id,credential_version,kind) VALUES (?,?,'NOTICE')", user, versions.getFirst() + 1);
    }

    private void requireEnabled() { if (!settings.enabled()) throw new RecoveryUnavailable(); }
    static String hash(String token) {
        try { return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.US_ASCII))); }
        catch (java.security.NoSuchAlgorithmException exception) { throw new IllegalStateException("SHA-256 unavailable"); }
    }
    public static class InvalidResetToken extends RuntimeException {}
    public static class RecoveryUnavailable extends RuntimeException {}
}
