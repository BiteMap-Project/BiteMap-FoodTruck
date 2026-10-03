package com.Bitemap.Backend.auth;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.BadCredentialsException;
import org.springframework.security.core.userdetails.User;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class OperatorAccountService implements UserDetailsService {
	private final JdbcTemplate jdbc;

	public OperatorAccountService(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public UserDetails loadUserByUsername(String email) {
		return jdbc.query("SELECT email, password_hash, enabled FROM operators WHERE lower(email) = ?",
				(rs, row) -> User.withUsername(rs.getString("email"))
						.password(rs.getString("password_hash")).disabled(!rs.getBoolean("enabled"))
						.roles("OPERATOR").build(), email)
				.stream().findFirst().orElseThrow(() -> new UsernameNotFoundException("Invalid credentials"));
	}

	public OperatorRegistrationService.OperatorAccount account(String email) {
		return jdbc.query("SELECT id, display_name, email FROM operators WHERE email = ? AND enabled = TRUE",
				(rs, row) -> new OperatorRegistrationService.OperatorAccount(rs.getLong("id"),
						rs.getString("display_name"), rs.getString("email")), email)
				.stream().findFirst().orElseThrow(() -> new BadCredentialsException("Invalid credentials"));
	}
}
