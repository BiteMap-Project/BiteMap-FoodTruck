package com.Bitemap.Backend.auth.limit;

public final class RateLimitExceededException extends RuntimeException {
    private final long retryAfterSeconds;
    public RateLimitExceededException(long seconds) {
        super("Too many authentication attempts. Please wait before trying again.");
        retryAfterSeconds = seconds;
    }
    public long retryAfterSeconds() { return retryAfterSeconds; }
}
