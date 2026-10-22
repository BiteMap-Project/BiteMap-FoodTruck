package com.Bitemap.Backend.account;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AccountProfileService {
	private final JdbcTemplate jdbc;

	public AccountProfileService(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	/** Updates only the signed-in account's own row; the caller passes the session's user ID. */
	@Transactional
	public void updateDisplayName(long userId, String displayName) {
		int updated = jdbc.update("""
				UPDATE app_users SET display_name = ?, updated_at = CURRENT_TIMESTAMP
				WHERE id = ? AND enabled
				""", displayName, userId);
		if (updated != 1) throw new AccountUnavailableException();
	}

	/** The session's account was disabled or removed between the session check and the update. */
	public static class AccountUnavailableException extends RuntimeException {
		AccountUnavailableException() {
			super("Account unavailable", null, false, false);
		}
	}
}
