package com.Bitemap.Backend.auth;

import java.util.List;

public record AccountResponse(long id, String displayName, String email, List<String> roles) {
    public AccountResponse { roles = List.copyOf(roles); }
}
