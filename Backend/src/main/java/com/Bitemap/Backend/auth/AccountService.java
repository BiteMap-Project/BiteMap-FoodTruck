package com.Bitemap.Backend.auth;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountService {
    private final JdbcTemplate jdbc;
    public AccountService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    /** Verifies already-granted operator access before explicit session refresh; never grants roles. */
    @Transactional
    public void becomeOperator(long userId) {
        var users = jdbc.queryForList("SELECT id FROM app_users WHERE id=? AND enabled FOR UPDATE", Long.class, userId);
        if (users.isEmpty()) throw new AccessDeniedException("An enabled account is required.");
        boolean customer = Boolean.TRUE.equals(jdbc.queryForObject(
                "SELECT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='CUSTOMER')", Boolean.class, userId));
        if (!customer) throw new AccessDeniedException("A customer account is required.");
        var profiles = jdbc.queryForList("SELECT enabled FROM operators WHERE user_id=? FOR UPDATE", Boolean.class, userId);
        if (!profiles.isEmpty()) {
            boolean operator = Boolean.TRUE.equals(jdbc.queryForObject(
                    "SELECT EXISTS(SELECT 1 FROM app_user_roles WHERE user_id=? AND role='OPERATOR')", Boolean.class, userId));
            if (!profiles.getFirst() || !operator) throw new AccessDeniedException("Operator access requires review.");
            return;
        }
        throw new AccessDeniedException("Submit an owner application and wait for administrator approval.");
    }
}
