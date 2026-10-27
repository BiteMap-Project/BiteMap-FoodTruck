package com.Bitemap.Backend.auth.recovery;

import java.net.URI;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

@Component
public record RecoverySettings(boolean enabled, String resetUrl, String from) {
    @org.springframework.beans.factory.annotation.Autowired
    public RecoverySettings(@Value("${bitemap.recovery.enabled:false}") boolean enabled,
            @Value("${bitemap.recovery.reset-url:}") String resetUrl,
            @Value("${bitemap.recovery.from:no-reply@bitemap.invalid}") String from,
            @Value("${bitemap.recovery.allow-local-http:false}") boolean localHttp) {
        this(enabled, resetUrl, from);
        if (enabled) {
            URI uri = URI.create(resetUrl);
            boolean local = localHttp && "http".equals(uri.getScheme())
                    && java.util.Set.of("localhost", "127.0.0.1").contains(uri.getHost() == null ? "" : uri.getHost());
            if ((!"https".equals(uri.getScheme()) && !local) || uri.getHost() == null
                    || uri.getUserInfo() != null || uri.getQuery() != null || uri.getFragment() != null
                    || !"/reset-password".equals(uri.getPath())) {
                throw new IllegalArgumentException("Configure a trusted HTTPS password reset URL ending in /reset-password");
            }
            if (from.contains("\r") || from.contains("\n") || !from.contains("@")) {
                throw new IllegalArgumentException("Configure a valid recovery sender");
            }
        }
    }
}
