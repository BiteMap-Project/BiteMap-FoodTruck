package com.Bitemap.Backend.auth.limit;

import jakarta.validation.constraints.*;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.validation.annotation.Validated;

@Validated
@ConfigurationProperties("bitemap.auth-limit")
public record AuthLimitProperties(
        String secret,
        @DefaultValue("10") @Min(1) @Max(100000) int loginAccountCapacity,
        @DefaultValue("60") @Min(1) @Max(86400) int loginAccountRefillSeconds,
        @DefaultValue("60") @Min(1) @Max(100000) int loginIpCapacity,
        @DefaultValue("5") @Min(1) @Max(86400) int loginIpRefillSeconds,
        @DefaultValue("5") @Min(1) @Max(100000) int registrationIpCapacity,
        @DefaultValue("720") @Min(1) @Max(86400) int registrationIpRefillSeconds) {
    public AuthLimitProperties {
        // Bean-validation failure reports can echo rejected field values.
        // Validate the secret without ever including its value in diagnostics.
        if (secret == null || secret.isBlank() || secret.length() < 32)
            throw new IllegalArgumentException("AUTH_RATE_LIMIT_SECRET must contain at least 32 characters");
    }
    @Override public String toString() { return "AuthLimitProperties[secret=REDACTED]"; }
}
