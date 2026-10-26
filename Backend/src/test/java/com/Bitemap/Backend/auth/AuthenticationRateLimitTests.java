package com.Bitemap.Backend.auth;

import org.junit.jupiter.api.*;
import com.Bitemap.Backend.auth.limit.*;
import org.springframework.jdbc.core.JdbcTemplate;
import java.util.*;
import java.util.concurrent.*;
import static org.assertj.core.api.Assertions.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {
    "bitemap.auth-limit.secret=isolated-test-secret-at-least-32-characters",
    "bitemap.auth-limit.login-account-capacity=2",
    "bitemap.auth-limit.login-ip-capacity=3",
    "bitemap.auth-limit.login-ip-refill-seconds=60",
    "bitemap.auth-limit.registration-ip-capacity=2"
})
@AutoConfigureMockMvc
class AuthenticationRateLimitTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired AuthenticationRateLimiter limiter;
    @Autowired AuthLimitRepository repository;
    @Autowired AuthLimitProperties settings;
    @Autowired io.micrometer.core.instrument.MeterRegistry metrics;
    @Autowired org.springframework.security.crypto.password.PasswordEncoder encoder;
    @BeforeEach @AfterEach
    void clearLimiterFixtures() { jdbc.update("DELETE FROM auth_rate_limits"); }

    @Test
    void repeatedUnknownAccountIsThrottledBeforePasswordVerification() throws Exception {
        for (int attempt = 0; attempt < 2; attempt++) {
            mvc.perform(post("/api/auth/login").with(csrf()).contentType("application/json")
                    .content("{\"email\":\"rate-limit-red@example.test\",\"password\":\"Wrong password here\"}"))
                    .andExpect(status().isUnauthorized());
        }
        mvc.perform(post("/api/auth/login").with(csrf()).contentType("application/json")
                .content("{\"email\":\"rate-limit-red@example.test\",\"password\":\"Wrong password here\"}"))
                .andExpect(status().isTooManyRequests())
                .andExpect(header().exists("Retry-After"))
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.code").value("AUTH_RATE_LIMITED"));
    }

    @Test
    void accountNormalizationAndSpoofedForwardedAddressesCannotBypassLimits() throws Exception {
        for (int i = 0; i < 2; i++) login("  TARGET@example.test  ", "198.51.100." + i).andExpect(status().isUnauthorized());
        login("target@example.test", "203.0.113.99").andExpect(status().isTooManyRequests());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM auth_rate_limits WHERE scope='login-account'", Integer.class)).isOne();
        assertThat(jdbc.queryForList("SELECT subject_key FROM auth_rate_limits", String.class))
                .allMatch(key -> key.matches("[0-9a-f]{64}"));
    }

    @Test
    void ipLimitBlocksRotatingEmailsAndDoesNotCreateUnlimitedAccountKeys() throws Exception {
        for (int i = 0; i < 3; i++) login("ip-" + i + "@example.test", "198.51.100." + i).andExpect(status().isUnauthorized());
        login("another@example.test", "198.51.100.99").andExpect(status().isTooManyRequests());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM auth_rate_limits WHERE scope='login-account'", Integer.class)).isEqualTo(3);
    }

    @Test
    void csrfAndMalformedRequestsAreRejectedBeforeConsumingAllowance() throws Exception {
        mvc.perform(post("/api/auth/login").contentType("application/json").content("{}"))
                .andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/login").with(csrf()).contentType("application/json").content("{}"))
                .andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM auth_rate_limits", Integer.class)).isZero();
    }

    @Test
    void rejectionDoesNotExtendCooldownAndRefillAllowsRecovery() {
        limiter.login("test-ip", "refill@example.test");
        limiter.login("test-ip", "refill@example.test");
        var before = jdbc.queryForList("SELECT * FROM auth_rate_limits ORDER BY scope");
        assertThatThrownBy(() -> limiter.login("test-ip", "refill@example.test"))
                .isInstanceOf(RateLimitExceededException.class);
        assertThat(jdbc.queryForList("SELECT * FROM auth_rate_limits ORDER BY scope")).isEqualTo(before);
        // Move the disposable database's bucket timestamp, not the production clock.
        jdbc.update("UPDATE auth_rate_limits SET updated_at=updated_at-interval '61 seconds'");
        assertThatCode(() -> limiter.login("test-ip", "refill@example.test")).doesNotThrowAnyException();
    }

    @Test
    void concurrentIndependentLimitersShareOneAtomicAllowance() throws Exception {
        var secondInstance = new AuthenticationRateLimiter(repository, settings, metrics);
        var gate = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(8)) {
            var tasks = new ArrayList<Future<Boolean>>();
            for (int i = 0; i < 8; i++) {
                final int n = i;
                tasks.add(executor.submit(() -> {
                    gate.await();
                    try {
                        (n % 2 == 0 ? limiter : secondInstance).login("parallel-ip-" + n, "parallel@example.test");
                        return true;
                    } catch (RateLimitExceededException expected) { return false; }
                }));
            }
            gate.countDown();
            int allowed = 0;
            for (var task : tasks) if (task.get(10, TimeUnit.SECONDS)) allowed++;
            assertThat(allowed).isEqualTo(2);
        }
    }

    @Test
    void registrationHasSeparateLimitAndLogoutStillWorks() throws Exception {
        limiter.registration("127.0.0.1");
        limiter.registration("127.0.0.1");
        mvc.perform(post("/api/auth/register").with(csrf()).contentType("application/json")
                .content("{\"displayName\":\"Test\",\"email\":\"limited@example.test\",\"password\":\"Long test password!\"}"))
                .andExpect(status().isTooManyRequests());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM app_users WHERE email='limited@example.test'", Integer.class)).isZero();
        login("still-login@example.test", "ignored").andExpect(status().isUnauthorized());
        mvc.perform(post("/api/auth/logout").with(csrf())).andExpect(status().isNoContent());
    }

    @Test
    @org.springframework.transaction.annotation.Transactional
    void successfulLoginAlsoConsumesAllowanceWithoutInvalidatingExistingSessions() throws Exception {
        com.Bitemap.Backend.TestAccounts.operator(jdbc, "Rate Test", "known-limit@example.test", encoder.encode("Known private password"));
        var request = "{\"email\":\"known-limit@example.test\",\"password\":\"Known private password\"}";
        var first = mvc.perform(post("/api/auth/login").with(csrf()).contentType("application/json").content(request))
                .andExpect(status().isOk()).andReturn();
        mvc.perform(post("/api/auth/login").with(csrf()).contentType("application/json").content(request))
                .andExpect(status().isOk());
        mvc.perform(post("/api/auth/login").with(csrf()).contentType("application/json").content(request))
                .andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.code").value("AUTH_RATE_LIMITED"));
        var session = (org.springframework.mock.web.MockHttpSession) first.getRequest().getSession(false);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/auth/me").session(session))
                .andExpect(status().isOk());
        mvc.perform(post("/api/auth/logout").session(session).with(csrf())).andExpect(status().isNoContent());
    }

    @Test
    @org.springframework.transaction.annotation.Transactional
    void duplicateRegistrationsStillConsumeAllowance() throws Exception {
        com.Bitemap.Backend.TestAccounts.operator(jdbc, "Existing", "duplicate-limit@example.test", encoder.encode("Known private password"));
        var body = "{\"displayName\":\"Existing\",\"email\":\"duplicate-limit@example.test\",\"password\":\"Known private password\"}";
        for (int i = 0; i < 2; i++)
            mvc.perform(post("/api/auth/register").with(csrf()).contentType("application/json").content(body))
                    .andExpect(status().isConflict());
        mvc.perform(post("/api/auth/register").with(csrf()).contentType("application/json").content(body))
                .andExpect(status().isTooManyRequests());
    }

    @Test
    void lockTimeoutFailsClosedAndDoesNotPartiallyConsumeOtherBuckets() throws Exception {
        limiter.login("blocked-ip", "blocked@example.test");
        var before = jdbc.queryForList("SELECT * FROM auth_rate_limits ORDER BY scope");
        try (var connection = jdbc.getDataSource().getConnection()) {
            connection.setAutoCommit(false);
            try (var statement = connection.createStatement()) {
                statement.executeQuery("SELECT subject_key FROM auth_rate_limits WHERE scope='login-account' FOR UPDATE").close();
                assertThatThrownBy(() -> limiter.login("blocked-ip", "blocked@example.test"))
                        .isInstanceOf(AuthLimitUnavailableException.class)
                        .hasMessage("Authentication is temporarily unavailable. Please try again later.");
            } finally { connection.rollback(); }
        }
        assertThat(jdbc.queryForList("SELECT * FROM auth_rate_limits ORDER BY scope")).isEqualTo(before);
    }

    @Test
    void cleanupRemovesOnlyExpiredBucketsInBoundedBatches() {
        limiter.registration("active-ip");
        jdbc.update("""
                INSERT INTO auth_rate_limits(scope,subject_key,tokens,updated_at,expires_at)
                SELECT 'registration-ip',lpad(n::text,64,'0'),2,now()-interval '2 days',now()-interval '1 day'
                FROM generate_series(1,510) n
                """);
        assertThat(repository.cleanup()).isEqualTo(500);
        assertThat(repository.cleanup()).isEqualTo(10);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM auth_rate_limits", Integer.class)).isOne();
    }

    private org.springframework.test.web.servlet.ResultActions login(String email, String forwarded) throws Exception {
        return mvc.perform(post("/api/auth/login").with(csrf()).header("X-Forwarded-For", forwarded)
                .contentType("application/json").content("{\"email\":\"" + email + "\",\"password\":\"Wrong password here\"}"));
    }
}
