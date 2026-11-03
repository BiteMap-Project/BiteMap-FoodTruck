package com.Bitemap.Backend.auth.limit;

import java.nio.charset.StandardCharsets;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import io.micrometer.core.instrument.MeterRegistry;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

@Service
public class AuthenticationRateLimiter {
    private final AuthLimitRepository repository;
    private final AuthLimitProperties settings;
    private final MeterRegistry metrics;
    public AuthenticationRateLimiter(AuthLimitRepository repository, AuthLimitProperties settings, MeterRegistry metrics) {
        this.repository = repository;
        this.settings = settings;
        this.metrics = metrics;
    }
    public void login(String address, String email) {
        check("login", List.of(
                bucket("login-ip", address, settings.loginIpCapacity(), settings.loginIpRefillSeconds()),
                bucket("login-account", email.strip().toLowerCase(Locale.ROOT), settings.loginAccountCapacity(), settings.loginAccountRefillSeconds())));
    }
    public void registration(String address) {
        check("registration", List.of(bucket("registration-ip", address, settings.registrationIpCapacity(), settings.registrationIpRefillSeconds())));
    }
    public void recoveryRequest(String address, String email) {
        check("recovery-request", List.of(
                bucket("recovery-global", "all", 100, 2),
                bucket("recovery-ip", address, 10, 60),
                bucket("recovery-account", email, 3, 900)));
    }
    public void recoveryReset(String address) {
        check("recovery-reset", List.of(bucket("recovery-reset-ip", address, 20, 60)));
    }
    private AuthLimitRepository.Bucket bucket(String scope, String subject, int capacity, int refill) {
        try {
            var mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(settings.secret().getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            String key = HexFormat.of().formatHex(mac.doFinal((scope + "\0" + subject).getBytes(StandardCharsets.UTF_8)));
            return new AuthLimitRepository.Bucket(scope, key, capacity, refill);
        } catch (java.security.GeneralSecurityException exception) {
            throw new AuthLimitUnavailableException();
        }
    }
    private void check(String operation, List<AuthLimitRepository.Bucket> buckets) {
        final long wait;
        try { wait = repository.consume(buckets); }
        catch (org.springframework.dao.DataAccessException | org.springframework.transaction.TransactionException exception) {
            metrics.counter("bitemap.auth.limit", "operation", operation, "result", "unavailable").increment();
            throw new AuthLimitUnavailableException();
        }
        metrics.counter("bitemap.auth.limit", "operation", operation, "result", wait == 0 ? "allowed" : "denied").increment();
        if (wait > 0) throw new RateLimitExceededException(wait);
    }
    @Scheduled(fixedDelayString = "${bitemap.auth-limit.cleanup-delay-ms:60000}", initialDelay = 60000)
    public void cleanup() {
        try { repository.cleanup(); }
        catch (org.springframework.dao.DataAccessException | org.springframework.transaction.TransactionException exception) {
            // Do not log database exception text or subject keys.
            metrics.counter("bitemap.auth.limit.cleanup.failures").increment();
        }
    }
}
