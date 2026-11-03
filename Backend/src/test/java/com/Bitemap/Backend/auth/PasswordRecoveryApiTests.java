package com.Bitemap.Backend.auth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = {"bitemap.recovery.enabled=true", "bitemap.recovery.worker-enabled=false",
        "bitemap.recovery.reset-url=http://localhost:5173/reset-password", "bitemap.recovery.allow-local-http=true"})
@AutoConfigureMockMvc
@Transactional
class PasswordRecoveryApiTests {
    @Autowired MockMvc mvc;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired org.springframework.security.crypto.password.PasswordEncoder encoder;
    @Autowired org.springframework.transaction.PlatformTransactionManager transactions;
    @Autowired com.Bitemap.Backend.auth.recovery.RecoveryMailDelivery delivery;
    @org.springframework.test.context.bean.override.mockito.MockitoBean org.springframework.mail.javamail.JavaMailSender mail;
    @org.springframework.test.context.bean.override.mockito.MockitoSpyBean com.Bitemap.Backend.auth.recovery.PasswordRecoveryService recovery;
    private static final String OLD = "Old password with spaces!";
    private static final String NEW = "  New password with spaces!  ";
    private long user;

    @org.junit.jupiter.api.BeforeEach void setup() {
        var tx = new org.springframework.transaction.support.TransactionTemplate(transactions);
        tx.setPropagationBehavior(org.springframework.transaction.TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        tx.executeWithoutResult(s -> jdbc.update("DELETE FROM auth_rate_limits WHERE scope LIKE 'recovery-%'"));
        user = jdbc.queryForObject("INSERT INTO app_users(display_name,email,password_hash) VALUES ('Recovery','recover@example.test',?) RETURNING id", Long.class, encoder.encode(OLD));
        jdbc.update("INSERT INTO app_user_roles(user_id,role) VALUES (?,'CUSTOMER')", user);
    }
    private String seedToken(String value, String expiry) throws Exception {
        String token = value.repeat(43);
        String hash = java.util.HexFormat.of().formatHex(java.security.MessageDigest.getInstance("SHA-256").digest(token.getBytes(java.nio.charset.StandardCharsets.US_ASCII)));
        jdbc.update("INSERT INTO password_reset_tokens VALUES (?,?,0,clock_timestamp() + ?::interval)", hash, user, expiry);
        return token;
    }
    private org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder reset(String token, String password) {
        return post("/api/auth/reset-password").contentType("application/json")
                .content("{\"token\":\"" + token + "\",\"password\":\"" + password + "\"}");
    }
    private org.springframework.mock.web.MockHttpSession login(String password) throws Exception {
        return (org.springframework.mock.web.MockHttpSession) mvc.perform(post("/api/auth/login").with(csrf()).contentType("application/json")
                .content("{\"email\":\"recover@example.test\",\"password\":\"" + password + "\"}"))
                .andExpect(status().isOk()).andReturn().getRequest().getSession();
    }

    @Test void unknownEmailGetsGenericAcceptedResponse() throws Exception {
        mvc.perform(post("/api/auth/forgot-password").with(csrf()).contentType("application/json")
                .content("{\"email\":\"missing@example.test\"}"))
                .andExpect(status().isAccepted()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.message").value("If an eligible account exists, a password reset link will be emailed. Check your inbox and spam folder."));
    }
    @Test void invalidTokenIsControlledBadRequest() throws Exception {
        mvc.perform(post("/api/auth/reset-password").with(csrf()).contentType("application/json")
                .content("{\"token\":\"" + "a".repeat(43) + "\",\"password\":\"A new secure password!\"}"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.detail").value("This reset link is invalid or expired. Request a new link."));
    }
    @Test void resetRejectsShortPassword() throws Exception {
        mvc.perform(post("/api/auth/reset-password").with(csrf()).contentType("application/json")
                .content("{\"token\":\"" + "a".repeat(43) + "\",\"password\":\"short\"}"))
                .andExpect(status().isBadRequest());
    }
    @Test void knownUnknownAndDisabledAccountsHaveIdenticalResponseAndNoSynchronousEmail() throws Exception {
        String known = mvc.perform(post("/api/auth/forgot-password").with(csrf()).contentType("application/json")
                .content("{\"email\":\" RECOVER@EXAMPLE.TEST \"}"))
                .andExpect(status().isAccepted()).andReturn().getResponse().getContentAsString();
        String unknown = mvc.perform(post("/api/auth/forgot-password").with(csrf()).contentType("application/json")
                .content("{\"email\":\"unknown@example.test\"}"))
                .andExpect(status().isAccepted()).andReturn().getResponse().getContentAsString();
        jdbc.update("UPDATE app_users SET enabled=false WHERE id=?", user);
        String disabled = mvc.perform(post("/api/auth/forgot-password").with(csrf()).contentType("application/json")
                .content("{\"email\":\"recover@example.test\"}"))
                .andExpect(status().isAccepted()).andReturn().getResponse().getContentAsString();
        org.assertj.core.api.Assertions.assertThat(known).isEqualTo(unknown).isEqualTo(disabled);
        org.mockito.Mockito.verifyNoInteractions(mail);
    }
    @Test void resetRevokesEveryOldSessionAndTokenWithoutChangingRolesOrAutoLogin() throws Exception {
        var first = login(OLD); var second = login(OLD);
        String token = seedToken("b", "15 minutes");
        String other = seedToken("c", "15 minutes");
        mvc.perform(reset(token, NEW).with(csrf())).andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"));
        for (var session : java.util.List.of(first, second)) {
            mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/auth/me").session(session)).andExpect(status().isUnauthorized());
            org.assertj.core.api.Assertions.assertThat(session.isInvalid()).isTrue();
        }
        mvc.perform(reset(token, NEW).with(csrf())).andExpect(status().isBadRequest());
        mvc.perform(reset(other, NEW).with(csrf())).andExpect(status().isBadRequest());
        mvc.perform(post("/api/auth/login").with(csrf()).contentType("application/json")
                .content("{\"email\":\"recover@example.test\",\"password\":\"" + OLD + "\"}"))
                .andExpect(status().isUnauthorized());
        var fresh = login(NEW);
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get("/api/auth/me").session(fresh))
                .andExpect(status().isOk()).andExpect(jsonPath("$.roles[0]").value("ROLE_CUSTOMER"));
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("SELECT count(*) FROM password_reset_tokens WHERE user_id=?", Integer.class,user)).isZero();
    }
    @Test void expiredDisabledAndMissingCsrfCannotChangePassword() throws Exception {
        mvc.perform(reset(seedToken("d", "-1 second"), NEW).with(csrf())).andExpect(status().isBadRequest());
        String valid = seedToken("e", "15 minutes");
        mvc.perform(reset(valid, NEW)).andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/forgot-password").contentType("application/json").content("{\"email\":\"recover@example.test\"}"))
                .andExpect(status().isForbidden());
        jdbc.update("UPDATE app_users SET enabled=false WHERE id=?", user);
        mvc.perform(reset(valid, NEW).with(csrf())).andExpect(status().isBadRequest());
        org.assertj.core.api.Assertions.assertThat(encoder.matches(OLD, jdbc.queryForObject("SELECT password_hash FROM app_users WHERE id=?",String.class,user))).isTrue();
    }
    @Test void deliveryStoresOnlyHashAndUsesConfiguredUrlNotRequestHost() throws Exception {
        mvc.perform(post("/api/auth/forgot-password").with(csrf()).header("Host","attacker.invalid").contentType("application/json")
                .content("{\"email\":\"recover@example.test\"}")).andExpect(status().isAccepted());
        delivery.deliverOne();
        var sent = org.mockito.ArgumentCaptor.forClass(org.springframework.mail.SimpleMailMessage.class);
        org.mockito.Mockito.verify(mail).send(sent.capture());
        String text = sent.getValue().getText();
        org.assertj.core.api.Assertions.assertThat(text).contains("http://localhost:5173/reset-password#token=").doesNotContain("attacker.invalid",OLD);
        var match = java.util.regex.Pattern.compile("#token=([A-Za-z0-9_-]{43})").matcher(text);
        org.assertj.core.api.Assertions.assertThat(match.find()).isTrue();
        String token = match.group(1);
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("SELECT token_hash FROM password_reset_tokens WHERE user_id=?",String.class,user)).hasSize(64).isNotEqualTo(token);
        mvc.perform(reset(token, NEW).with(csrf())).andExpect(status().isOk());
    }
    @Test void smtpFailureIsBoundedAndNeverLeavesUsableToken() throws Exception {
        org.mockito.Mockito.doThrow(new org.springframework.mail.MailSendException("private SMTP detail")).when(mail).send(org.mockito.ArgumentMatchers.any(org.springframework.mail.SimpleMailMessage.class));
        mvc.perform(post("/api/auth/forgot-password").with(csrf()).contentType("application/json")
                .content("{\"email\":\"recover@example.test\"}")).andExpect(status().isAccepted());
        for(int i=0;i<3;i++) {
            jdbc.update("UPDATE password_recovery_mail SET available_at=clock_timestamp()");
            delivery.deliverOne();
        }
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("SELECT count(*) FROM password_reset_tokens",Integer.class)).isZero();
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("SELECT count(*) FROM password_recovery_mail",Integer.class)).isZero();
        org.mockito.Mockito.verify(mail,org.mockito.Mockito.times(3)).send(org.mockito.ArgumentMatchers.any(org.springframework.mail.SimpleMailMessage.class));
    }
    @Test void fourthRequestIsRateLimitedForUnknownAccountsToo() throws Exception {
        for (int i=0;i<3;i++) mvc.perform(post("/api/auth/forgot-password").with(csrf()).contentType("application/json")
                .content("{\"email\":\"absent@example.test\"}")).andExpect(status().isAccepted());
        mvc.perform(post("/api/auth/forgot-password").with(csrf()).contentType("application/json")
                .content("{\"email\":\"absent@example.test\"}"))
                .andExpect(status().isTooManyRequests()).andExpect(header().exists("Retry-After"));
    }
    @Test void oldQueuedRequestCannotMintTokenAfterSuccessfulResetAndNoticeHasNoSecrets() throws Exception {
        mvc.perform(post("/api/auth/forgot-password").with(csrf()).contentType("application/json")
                .content("{\"email\":\"recover@example.test\"}")).andExpect(status().isAccepted());
        mvc.perform(reset(seedToken("h", "15 minutes"), NEW).with(csrf())).andExpect(status().isOk());
        delivery.deliverOne(); // Drops the older queued request.
        org.mockito.Mockito.verifyNoInteractions(mail);
        delivery.deliverOne(); // Sends the reset notification.
        var sent=org.mockito.ArgumentCaptor.forClass(org.springframework.mail.SimpleMailMessage.class);
        org.mockito.Mockito.verify(mail).send(sent.capture());
        org.assertj.core.api.Assertions.assertThat(sent.getValue().getText()).doesNotContain(OLD,NEW,"#token=");
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("SELECT count(*) FROM password_reset_tokens",Integer.class)).isZero();
    }
    @Test void staleQueuedRequestsAreDroppedWithoutMail() throws Exception {
        mvc.perform(post("/api/auth/forgot-password").with(csrf()).contentType("application/json")
                .content("{\"email\":\"recover@example.test\"}")).andExpect(status().isAccepted());
        jdbc.update("UPDATE password_recovery_mail SET created_at=clock_timestamp()-interval '16 minutes'");
        delivery.deliverOne();
        org.mockito.Mockito.verifyNoInteractions(mail);
        org.assertj.core.api.Assertions.assertThat(jdbc.queryForObject("SELECT count(*) FROM password_recovery_mail",Integer.class)).isZero();
    }
    @Test void databaseFailureDoesNotExposeSqlOrSecrets() throws Exception {
        org.mockito.Mockito.doThrow(new org.springframework.dao.DataAccessResourceFailureException("SQL private secret"))
                .when(recovery).request(org.mockito.ArgumentMatchers.anyString());
        mvc.perform(post("/api/auth/forgot-password").with(csrf()).contentType("application/json")
                .content("{\"email\":\"recover@example.test\"}"))
                .andExpect(status().isServiceUnavailable()).andExpect(header().string("Cache-Control","no-store"))
                .andExpect(jsonPath("$.detail").value("Password recovery is temporarily unavailable. Please try again later."));
    }
}
