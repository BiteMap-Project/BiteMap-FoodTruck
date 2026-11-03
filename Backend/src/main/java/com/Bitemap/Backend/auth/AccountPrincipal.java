package com.Bitemap.Backend.auth;

import java.util.Collection;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.User;

/** Stable identity in the session. Password is erased by the authentication provider. */
public final class AccountPrincipal extends User {
    private final long userId;
    private final long credentialVersion;

    public AccountPrincipal(long userId, String email, String password, boolean enabled,
            Collection<? extends GrantedAuthority> authorities) {
        this(userId, email, password, enabled, authorities, 0);
    }
    public AccountPrincipal(long userId, String email, String password, boolean enabled,
            Collection<? extends GrantedAuthority> authorities, long credentialVersion) {
        super(email, password, enabled, true, true, true, authorities);
        this.userId = userId;
        this.credentialVersion = credentialVersion;
    }

    public long userId() { return userId; }
    public long credentialVersion() { return credentialVersion; }
}
