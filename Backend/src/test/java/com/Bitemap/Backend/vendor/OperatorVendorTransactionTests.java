package com.Bitemap.Backend.vendor;

import java.sql.SQLException;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.*;

@SpringBootTest
class OperatorVendorTransactionTests {
	@Autowired JdbcTemplate jdbc;
	@Autowired DataSource dataSource;
	@Autowired OperatorVendorService service;
	@Autowired PlatformTransactionManager transactions;

	@Test
	void accountDisableWaitsForVendorTransactionAndBlocksSubsequentWrites() {
		String email = "ownership-lock-" + UUID.randomUUID() + "@example.com";
		long owner = com.Bitemap.Backend.TestAccounts.operator(jdbc, "Lock test", email, "not-used");
		try {
			new TransactionTemplate(transactions).executeWithoutResult(transaction -> {
				service.create(email, new OperatorVendorRequest("Lock test", "Food", "Test"));
				// A different connection is a genuinely separate PostgreSQL transaction.
				try (var connection = dataSource.getConnection()) {
					connection.setAutoCommit(false);
					try (var timeout = connection.createStatement();
							var disable = connection.prepareStatement("UPDATE operators SET enabled = FALSE WHERE id = ?")) {
						timeout.execute("SET LOCAL lock_timeout = '200ms'");
						disable.setLong(1, owner);
						assertThatThrownBy(disable::executeUpdate).isInstanceOf(SQLException.class)
								.satisfies(error -> assertThat(((SQLException) error).getSQLState()).isEqualTo("55P03"));
					} finally {
						connection.rollback();
					}
				} catch (SQLException exception) {
					throw new AssertionError("Unable to verify independent transaction", exception);
				}
			});
			assertThat(jdbc.update("UPDATE operators SET enabled = FALSE WHERE id = ?", owner)).isEqualTo(1);
			assertThatThrownBy(() -> service.create(email, new OperatorVendorRequest("Rejected", "Food", "Test")))
					.isInstanceOf(ResponseStatusException.class)
					.satisfies(error -> assertThat(((ResponseStatusException) error).getStatusCode().value()).isEqualTo(403));
			assertThat(jdbc.queryForObject("SELECT count(*) FROM vendors WHERE operator_id = ?", Integer.class, owner)).isEqualTo(1);
		} finally {
			// Clean only this test's generated owner and vendors, never unrelated rows.
			jdbc.update("DELETE FROM vendors WHERE operator_id = ?", owner);
			com.Bitemap.Backend.TestAccounts.deleteOperator(jdbc, owner);
		}
	}
}
