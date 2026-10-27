package com.Bitemap.Backend.auth;

import com.Bitemap.Backend.auth.recovery.PasswordRecoveryService;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.concurrent.*;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(properties={"bitemap.recovery.enabled=true", "bitemap.recovery.reset-url=https://bitemap.example/reset-password"})
class PasswordRecoveryConcurrencyTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired PasswordRecoveryService service;
    @Autowired PasswordEncoder encoder;

    @ParameterizedTest
    @ValueSource(booleans={true,false})
    void concurrentConsumersHaveExactlyOneWinner(boolean sameToken) throws Exception {
        long user=jdbc.queryForObject("INSERT INTO app_users(display_name,email,password_hash) VALUES ('Race','reset-race@example.test','unused') RETURNING id",Long.class);
        String first="f".repeat(43), second="g".repeat(43);
        try {
            for (String token:java.util.List.of(first,second)) jdbc.update(
                    "INSERT INTO password_reset_tokens VALUES (?,?,0,clock_timestamp()+interval '15 minutes')",
                    HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.US_ASCII))),user);
            var gate=new CountDownLatch(1);
            try(var executor=Executors.newFixedThreadPool(2)) {
                var a=executor.submit(() -> attempt(gate,first,"First secure password!"));
                var b=executor.submit(() -> attempt(gate,sameToken ? first : second,"Second secure password!"));
                gate.countDown();
                int wins=a.get(10,TimeUnit.SECONDS)+b.get(10,TimeUnit.SECONDS);
                assertThat(wins).isEqualTo(1);
            }
            assertThat(jdbc.queryForObject("SELECT credential_version FROM app_users WHERE id=?",Long.class,user)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM password_reset_tokens WHERE user_id=?",Integer.class,user)).isZero();
            String hash=jdbc.queryForObject("SELECT password_hash FROM app_users WHERE id=?",String.class,user);
            assertThat(encoder.matches("First secure password!",hash) || encoder.matches("Second secure password!",hash)).isTrue();
        } finally { jdbc.update("DELETE FROM app_users WHERE id=?",user); }
    }
    private int attempt(CountDownLatch gate,String token,String password) throws Exception {
        gate.await(5,TimeUnit.SECONDS);
        try { service.reset(token,password); return 1; }
        catch(PasswordRecoveryService.InvalidResetToken expected) { return 0; }
    }
}
