package com.Bitemap.Backend.auth;

import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class AccountOnboardingConcurrencyTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired AccountService accounts;

    @Test void concurrentRequestsCreateExactlyOneProfileAndRole() throws Exception {
        long user = jdbc.queryForObject("INSERT INTO app_users(display_name,email,password_hash) VALUES ('Race',?,'unused') RETURNING id",
                Long.class, "onboarding-" + UUID.randomUUID() + "@example.com");
        jdbc.update("INSERT INTO app_user_roles(user_id,role) VALUES (?, 'CUSTOMER')", user);
        try (var workers = Executors.newFixedThreadPool(2)) {
            var ready = new CountDownLatch(2);
            var start = new CountDownLatch(1);
            java.util.concurrent.Callable<Void> request = () -> {
                ready.countDown();
                if (!start.await(5, TimeUnit.SECONDS)) throw new AssertionError("Start timed out");
                accounts.becomeOperator(user);
                return null;
            };
            var first = workers.submit(request);
            var second = workers.submit(request);
            assertThat(ready.await(5, TimeUnit.SECONDS)).isTrue();
            start.countDown();
            first.get(10, TimeUnit.SECONDS);
            second.get(10, TimeUnit.SECONDS);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM operators WHERE user_id=?", Integer.class, user)).isEqualTo(1);
            assertThat(jdbc.queryForList("SELECT role FROM app_user_roles WHERE user_id=? ORDER BY role", String.class, user))
                    .containsExactly("CUSTOMER", "OPERATOR");
        } finally {
            jdbc.update("DELETE FROM operators WHERE user_id=?", user);
            jdbc.update("DELETE FROM app_users WHERE id=?", user);
        }
    }
}
