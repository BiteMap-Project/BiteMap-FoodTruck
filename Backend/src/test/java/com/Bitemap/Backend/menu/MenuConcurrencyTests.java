package com.Bitemap.Backend.menu;

import java.math.BigDecimal;
import java.sql.SQLException;
import java.util.UUID;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest
class MenuConcurrencyTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired DataSource dataSource;
    @Autowired MenuService service;
    @Autowired PlatformTransactionManager transactions;

    @Test
    void locksPreventOwnerChangesAndVersionPreventsConcurrentLostUpdate() {
        String email = "menu-race-" + UUID.randomUUID() + "@example.com";
        long owner = com.Bitemap.Backend.TestAccounts.operator(jdbc, "Race test", email, "unused");
        long vendor = jdbc.queryForObject("INSERT INTO vendors(name,category,location,operator_id) VALUES ('Race test','Food','Test',?) RETURNING id", Long.class, owner);
        try {
            var tx = new TransactionTemplate(transactions);
            var first = tx.execute(status -> {
                var item = service.create(email, vendor, new CreateMenuItemRequest("Original", null, BigDecimal.ONE, MenuAvailability.ACTIVE));
                assertBlocked("UPDATE operators SET enabled = FALSE WHERE id = ?", owner);
                assertBlocked("UPDATE app_users SET enabled=FALSE WHERE id=(SELECT user_id FROM operators WHERE id=?)", owner);
                assertBlocked("DELETE FROM app_user_roles WHERE role='OPERATOR' AND user_id=(SELECT user_id FROM operators WHERE id=?)", owner);
                assertBlocked("UPDATE vendors SET operator_id = NULL WHERE id = ?", vendor);
                return item;
            });
            var nested = new TransactionTemplate(transactions);
            nested.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
            assertThatThrownBy(() -> tx.executeWithoutResult(status -> {
                service.get(email, vendor, first.id()); // load version 0 into the outer persistence context
                nested.executeWithoutResult(inner -> service.changeAvailability(email, vendor, first.id(),
                        new ChangeMenuAvailabilityRequest(MenuAvailability.SOLD_OUT, 0L)));
                service.update(email, vendor, first.id(), new UpdateMenuItemRequest("Stale overwrite", null, BigDecimal.TEN, 0L));
            })).isInstanceOf(OptimisticLockingFailureException.class);
            var current = service.get(email, vendor, first.id());
            assertThat(current.name()).isEqualTo("Original");
            assertThat(current.status()).isEqualTo(MenuAvailability.SOLD_OUT);
            assertThat(current.version()).isEqualTo(1);
        } finally {
            jdbc.update("DELETE FROM vendor_menu_items WHERE vendor_id = ?", vendor);
            jdbc.update("DELETE FROM vendors WHERE id = ?", vendor);
            com.Bitemap.Backend.TestAccounts.deleteOperator(jdbc, owner);
        }
    }

    private void assertBlocked(String sql, long id) {
        try (var connection = dataSource.getConnection()) {
            connection.setAutoCommit(false);
            try (var timeout = connection.createStatement(); var update = connection.prepareStatement(sql)) {
                timeout.execute("SET LOCAL lock_timeout = '200ms'");
                update.setLong(1, id);
                assertThatThrownBy(update::executeUpdate).isInstanceOf(SQLException.class)
                        .satisfies(error -> assertThat(((SQLException) error).getSQLState()).isEqualTo("55P03"));
            } finally { connection.rollback(); }
        } catch (SQLException exception) { throw new AssertionError(exception); }
    }
}
