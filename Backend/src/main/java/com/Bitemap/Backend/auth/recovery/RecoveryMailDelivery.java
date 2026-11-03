package com.Bitemap.Backend.auth.recovery;

import java.security.SecureRandom;
import java.util.Base64;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.MailException;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class RecoveryMailDelivery {
    private final JdbcTemplate jdbc;
    private final JavaMailSender mail;
    private final RecoverySettings settings;
    private final MeterRegistry metrics;
    private final SecureRandom random = new SecureRandom();
    public RecoveryMailDelivery(JdbcTemplate jdbc, JavaMailSender mail, RecoverySettings settings, MeterRegistry metrics) {
        this.jdbc = jdbc; this.mail = mail; this.settings = settings; this.metrics = metrics;
    }

    @Transactional(timeout=30)
    public boolean deliverOne() {
        if (!settings.enabled()) return false;
        jdbc.execute("SET LOCAL lock_timeout = '2000ms'");
        var jobs = jdbc.queryForList("""
                SELECT id,user_id,credential_version,kind,attempts,
                    created_at > clock_timestamp()-interval '15 minutes' AS fresh
                FROM password_recovery_mail
                WHERE available_at <= clock_timestamp() ORDER BY available_at,id LIMIT 1 FOR UPDATE SKIP LOCKED
                """);
        if (jobs.isEmpty()) return false;
        var job = jobs.getFirst();
        long id = ((Number) job.get("id")).longValue();
        if ("RESET".equals(job.get("kind")) && !Boolean.TRUE.equals(job.get("fresh"))) {
            delete(id); return true;
        }
        var user = job.get("user_id");
        var accounts = user == null ? java.util.List.<java.util.Map<String,Object>>of()
                : jdbc.queryForList("SELECT email,credential_version FROM app_users WHERE id=? AND enabled FOR UPDATE", user);
        if (accounts.isEmpty()) { delete(id); return true; }
        var account = accounts.getFirst();
        boolean reset = "RESET".equals(job.get("kind"));
        if (reset && !account.get("credential_version").equals(job.get("credential_version"))) {
            delete(id); return true; // Requests queued before a reset cannot mint new recovery credentials.
        }
        String hash = null;
        var message = new SimpleMailMessage();
        message.setFrom(settings.from());
        message.setTo((String) account.get("email"));
        if (reset) {
            byte[] bytes = new byte[32];
            random.nextBytes(bytes);
            String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
            hash = PasswordRecoveryService.hash(token);
            jdbc.update("""
                    INSERT INTO password_reset_tokens(token_hash,user_id,credential_version,expires_at)
                    VALUES (?,?,?,clock_timestamp()+interval '15 minutes')
                    """, hash, user, account.get("credential_version"));
            message.setSubject("Reset your BiteMap password");
            // Fragment is not transmitted in HTTP URLs or Referer headers.
            message.setText("A password reset was requested for your BiteMap account.\n\n"
                    + settings.resetUrl() + "#token=" + token
                    + "\n\nThis link expires in 15 minutes and can be used once. If you did not request it, ignore this email. Your password has not changed.");
        } else {
            message.setSubject("Your BiteMap password was changed");
            message.setText("Your BiteMap password was changed and existing sign-in sessions were revoked. If this was not you, use Forgot password immediately to recover your account.");
        }
        try {
            mail.send(message);
            delete(id);
            metrics.counter("bitemap.recovery.mail", "result", "sent").increment();
        } catch (MailException exception) {
            // SMTP diagnostics may contain addresses or message content: do not log them.
            if (hash != null) jdbc.update("DELETE FROM password_reset_tokens WHERE token_hash=?", hash);
            int attempts = ((Number) job.get("attempts")).intValue() + 1;
            if (attempts >= 3) delete(id);
            else jdbc.update("UPDATE password_recovery_mail SET attempts=?,available_at=clock_timestamp()+interval '1 minute' WHERE id=?", attempts, id);
            metrics.counter("bitemap.recovery.mail", "result", attempts >= 3 ? "exhausted" : "retry").increment();
        }
        return true;
    }
    private void delete(long id) { jdbc.update("DELETE FROM password_recovery_mail WHERE id=?", id); }
}
