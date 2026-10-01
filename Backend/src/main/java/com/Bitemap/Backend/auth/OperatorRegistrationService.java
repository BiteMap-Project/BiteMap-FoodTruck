package com.Bitemap.Backend.auth;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class OperatorRegistrationService {
	private final JdbcTemplate jdbc;
	private final PasswordEncoder passwordEncoder;

	public OperatorRegistrationService(JdbcTemplate jdbc, PasswordEncoder passwordEncoder) {
		this.jdbc = jdbc;
		this.passwordEncoder = passwordEncoder;
	}

	public OperatorAccount register(RegisterOperatorRequest request) {
		String hash = passwordEncoder.encode(request.password());
		// The existing unique index arbitrates simultaneous registrations atomically.
		var accounts = jdbc.query("""
				INSERT INTO operators (display_name, email, password_hash)
				VALUES (?, ?, ?)
				ON CONFLICT (lower(email)) DO NOTHING
				RETURNING id, display_name, email
				""", (rs, row) -> new OperatorAccount(rs.getLong("id"),
				rs.getString("display_name"), rs.getString("email")),
				request.displayName(), request.email(), hash);
		if (accounts.isEmpty()) throw new EmailAlreadyRegisteredException();
		return accounts.getFirst();
	}

	public record OperatorAccount(long id, String displayName, String email) {}

	static class EmailAlreadyRegisteredException extends RuntimeException {}
}
