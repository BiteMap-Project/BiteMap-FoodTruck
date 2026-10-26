package com.Bitemap.Backend.auth.limit;

public final class AuthLimitUnavailableException extends RuntimeException {
    public AuthLimitUnavailableException() { super("Authentication is temporarily unavailable. Please try again later."); }
}
