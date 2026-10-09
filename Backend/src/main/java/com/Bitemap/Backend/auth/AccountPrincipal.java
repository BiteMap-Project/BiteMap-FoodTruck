package com.Bitemap.Backend.auth;

import java.util.Collection;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.userdetails.User;

/** Stable identity in the session. Password is erased by the authentication provider. */
public final class AccountPrincipal extends User {
    private final long userId;

    public AccountPrincipal(long userId, String email, String password, boolean enabled,
            Collection<? extends GrantedAuthority> authorities) {
        super(email, password, enabled, true, true, true, authorities);
        this.userId = userId;
    }

    public long userId() { return userId; }
}
