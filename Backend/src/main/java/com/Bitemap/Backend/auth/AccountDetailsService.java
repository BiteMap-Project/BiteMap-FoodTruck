package com.Bitemap.Backend.auth;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.authentication.BadCredentialsException;
import java.util.List;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.stereotype.Service;

@Service
public class AccountDetailsService implements UserDetailsService {
	private final JdbcTemplate jdbc;

	public AccountDetailsService(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	@Override
	public UserDetails loadUserByUsername(String email) {
        var rows = jdbc.queryForList("SELECT id,email,password_hash,enabled FROM app_users WHERE lower(email)=?", email);
        if (rows.isEmpty()) throw new UsernameNotFoundException("Invalid credentials");
        var row = rows.getFirst();
        long id = ((Number) row.get("id")).longValue();
        return new AccountPrincipal(id, (String) row.get("email"), (String) row.get("password_hash"),
                (Boolean) row.get("enabled"), roles(id).stream().map(SimpleGrantedAuthority::new).toList());
	}

	public AccountResponse account(String email) {
		return jdbc.query("SELECT id, display_name, email FROM app_users WHERE email = ? AND enabled = TRUE",
				(rs, row) -> new AccountResponse(rs.getLong("id"),
						rs.getString("display_name"), rs.getString("email"), roles(rs.getLong("id"))), email)
				.stream().findFirst().orElseThrow(() -> new BadCredentialsException("Invalid credentials"));
	}

    public List<String> roles(long userId) {
        return jdbc.queryForList("""
                SELECT 'ROLE_' || r.role FROM app_user_roles r
                WHERE r.user_id=? AND (r.role <> 'OPERATOR' OR EXISTS (
                    SELECT 1 FROM operators o WHERE o.user_id=r.user_id AND o.enabled))
                ORDER BY r.role
                """, String.class, userId);
    }
}
