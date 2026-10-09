package com.Bitemap.Backend.auth;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;

@Service
public class AccountRegistrationService {
	private final JdbcTemplate jdbc;
	private final PasswordEncoder passwordEncoder;

	public AccountRegistrationService(JdbcTemplate jdbc, PasswordEncoder passwordEncoder) {
		this.jdbc = jdbc;
		this.passwordEncoder = passwordEncoder;
	}

    @Transactional
	public AccountResponse register(RegisterAccountRequest request) {
		String hash = passwordEncoder.encode(request.password());
		// The existing unique index arbitrates simultaneous registrations atomically.
		var accounts = jdbc.query("""
				INSERT INTO app_users (display_name, email, password_hash)
				VALUES (?, ?, ?)
				ON CONFLICT (lower(email)) DO NOTHING
				RETURNING id, display_name, email
				""", (rs, row) -> new AccountResponse(rs.getLong("id"),
				rs.getString("display_name"), rs.getString("email"), List.of("ROLE_CUSTOMER")),
				request.displayName(), request.email(), hash);
		if (accounts.isEmpty()) throw new EmailAlreadyRegisteredException();
        jdbc.update("INSERT INTO app_user_roles(user_id,role) VALUES (?, 'CUSTOMER')", accounts.getFirst().id());
		return accounts.getFirst();
	}

	static class EmailAlreadyRegisteredException extends RuntimeException {}
}
