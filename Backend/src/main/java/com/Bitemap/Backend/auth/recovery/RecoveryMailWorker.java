package com.Bitemap.Backend.auth.recovery;

import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name="bitemap.recovery.worker-enabled", havingValue="true", matchIfMissing=true)
public class RecoveryMailWorker {
    private final RecoveryMailDelivery delivery;
    private final JdbcTemplate jdbc;
    private final MeterRegistry metrics;
    public RecoveryMailWorker(RecoveryMailDelivery delivery, JdbcTemplate jdbc, MeterRegistry metrics) {
        this.delivery = delivery; this.jdbc = jdbc; this.metrics = metrics;
    }
    @Scheduled(fixedDelayString="${bitemap.recovery.poll-ms:5000}", initialDelay=5000)
    public void poll() {
        try {
            // Bounded batches, multiple replicas use SKIP LOCKED.
            for (int i=0; i<10 && delivery.deliverOne(); i++) { /* delivery owns its transaction */ }
        } catch (RuntimeException exception) {
            metrics.counter("bitemap.recovery.worker.failures").increment();
        }
    }
    @Scheduled(fixedDelay=60000, initialDelay=60000)
    public void cleanup() {
        try {
            jdbc.update("DELETE FROM password_reset_tokens WHERE token_hash IN (SELECT token_hash FROM password_reset_tokens WHERE expires_at < clock_timestamp() LIMIT 500 FOR UPDATE SKIP LOCKED)");
            jdbc.update("DELETE FROM password_recovery_mail WHERE id IN (SELECT id FROM password_recovery_mail WHERE created_at < clock_timestamp()-interval '1 day' LIMIT 500 FOR UPDATE SKIP LOCKED)");
        } catch (RuntimeException exception) {
            metrics.counter("bitemap.recovery.cleanup.failures").increment();
        }
    }
}
