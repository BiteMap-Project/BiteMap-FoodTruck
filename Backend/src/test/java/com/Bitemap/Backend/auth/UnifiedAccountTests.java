package com.Bitemap.Backend.auth;

import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;
import static org.hamcrest.Matchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class UnifiedAccountTests {
    static final String EMAIL = "customer@example.com";
    static final String PASSWORD = "A new customer passphrase!";
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;

    MockHttpSession registerAndLogin() throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(Map.of("displayName","Customer","email",EMAIL,"password",PASSWORD,
                        "roles",new String[]{"OPERATOR","ADMIN"},"operatorId",123))))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.roles", contains("ROLE_CUSTOMER")));
        var result = mvc.perform(post("/api/auth/login").with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(Map.of("email",EMAIL,"password",PASSWORD))))
                .andExpect(status().isOk()).andExpect(jsonPath("$.roles", contains("ROLE_CUSTOMER"))).andReturn();
        return (MockHttpSession) result.getRequest().getSession(false);
    }

    @Test void registrationCannotGrantOperatorOrCreateAProfile() throws Exception {
        var session = registerAndLogin();
        mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.roles", contains("ROLE_CUSTOMER")));
        mvc.perform(get("/api/operator/vendors").session(session)).andExpect(status().isForbidden());
        mvc.perform(post("/api/operator/vendors").session(session).with(csrf()).contentType("application/json")
                .content("{\"name\":\"X\",\"category\":\"Food\",\"location\":\"CSUN\"}")).andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM operators", Integer.class)).isZero();
    }

    @Test void upgradeRotatesSessionAndCsrfAndNeverClaimsExistingTrucks() throws Exception {
        long other = com.Bitemap.Backend.TestAccounts.operator(jdbc, "Other", "other@example.com", "unused");
        jdbc.update("INSERT INTO vendors(name,category,location,operator_id) VALUES ('Other','Food','CSUN',?), ('Unclaimed','Food','CSUN',NULL)", other);
        var before = jdbc.queryForList("SELECT * FROM vendors ORDER BY id");
        var session = registerAndLogin();
        String oldId = session.getId();
        var tokenResult = mvc.perform(get("/api/auth/csrf").session(session)).andReturn();
        String token = json.readTree(tokenResult.getResponse().getContentAsString()).get("token").asText();
        mvc.perform(post("/api/auth/become-operator").session(session).header("X-CSRF-TOKEN",token)
                .contentType("application/json").content("{\"roles\":[\"ADMIN\"],\"vendorId\":1,\"operatorId\":1}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.roles", contains("ROLE_CUSTOMER","ROLE_OPERATOR")))
                .andExpect(header().string("Cache-Control","no-store"));
        assertThat(session.getId()).isNotEqualTo(oldId);
        mvc.perform(post("/api/auth/become-operator").session(session).header("X-CSRF-TOKEN",token))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/auth/me").session(session)).andExpect(jsonPath("$.roles", contains("ROLE_CUSTOMER","ROLE_OPERATOR")));
        mvc.perform(get("/api/operator/vendors").session(session)).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
        mvc.perform(post("/api/auth/become-operator").session(session).with(csrf())).andExpect(status().isOk());
        assertThat(jdbc.queryForList("SELECT * FROM vendors ORDER BY id")).isEqualTo(before);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM operators o JOIN app_users u ON u.id=o.user_id WHERE u.email=?", Integer.class,EMAIL)).isEqualTo(1);
        mvc.perform(post("/api/operator/vendors").session(session).with(csrf()).contentType("application/json")
                .content("{\"name\":\"My new truck\",\"category\":\"Food\",\"location\":\"CSUN\",\"operatorId\":1}"))
                .andExpect(status().isCreated());
        assertThat(jdbc.queryForObject("SELECT u.email FROM vendors v JOIN operators o ON o.id=v.operator_id JOIN app_users u ON u.id=o.user_id WHERE v.name='My new truck'", String.class)).isEqualTo(EMAIL);
    }

    @Test void onboardingRequiresAuthenticationAndCsrf() throws Exception {
        mvc.perform(post("/api/auth/become-operator").with(csrf())).andExpect(status().isUnauthorized());
        var session = registerAndLogin();
        mvc.perform(post("/api/auth/become-operator").session(session)).andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM operators", Integer.class)).isZero();
    }

    @Test void revokedOperatorKeepsCustomerAccessButCannotSelfReactivate() throws Exception {
        var session = registerAndLogin();
        mvc.perform(post("/api/auth/become-operator").session(session).with(csrf())).andExpect(status().isOk());
        jdbc.update("UPDATE operators SET enabled=FALSE");
        mvc.perform(get("/api/operator/vendors").session(session)).andExpect(status().isForbidden());
        mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.roles", contains("ROLE_CUSTOMER")));
        mvc.perform(post("/api/auth/become-operator").session(session).with(csrf())).andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("SELECT enabled FROM operators", Boolean.class)).isFalse();
    }

    @Test void deletedOperatorRoleCannotBeRegrantedByOnboarding() throws Exception {
        var session = registerAndLogin();
        mvc.perform(post("/api/auth/become-operator").session(session).with(csrf())).andExpect(status().isOk());
        jdbc.update("DELETE FROM app_user_roles WHERE role='OPERATOR'");
        mvc.perform(get("/api/operator/vendors").session(session)).andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/become-operator").session(session).with(csrf())).andExpect(status().isForbidden());
        assertThat(jdbc.queryForList("SELECT role FROM app_user_roles", String.class)).containsExactly("CUSTOMER");
    }

    @Test void disabledGlobalAccountLosesSessionAndCannotOnboard() throws Exception {
        var session = registerAndLogin();
        jdbc.update("UPDATE app_users SET enabled=FALSE");
        mvc.perform(post("/api/auth/become-operator").session(session).with(csrf())).andExpect(status().isUnauthorized());
        assertThat(session.isInvalid()).isTrue();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM operators", Integer.class)).isZero();
    }

    @Test void sessionIdentityCannotFollowReusedEmail() throws Exception {
        var session = registerAndLogin();
        jdbc.update("DELETE FROM app_users WHERE email=?", EMAIL);
        com.Bitemap.Backend.TestAccounts.operator(jdbc, "Replacement", EMAIL, "unused");
        mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isUnauthorized());
        assertThat(session.isInvalid()).isTrue();
    }

    @Test void secondSessionDoesNotAcquirePrivilegesUntilExplicitUpgradeOrLogin() throws Exception {
        var first = registerAndLogin();
        var result = mvc.perform(post("/api/auth/login").with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(Map.of("email",EMAIL,"password",PASSWORD)))).andExpect(status().isOk()).andReturn();
        var second = (MockHttpSession) result.getRequest().getSession(false);
        mvc.perform(post("/api/auth/become-operator").session(first).with(csrf())).andExpect(status().isOk());
        mvc.perform(get("/api/auth/me").session(second)).andExpect(jsonPath("$.roles", contains("ROLE_CUSTOMER")));
        mvc.perform(get("/api/operator/vendors").session(second)).andExpect(status().isForbidden());
        mvc.perform(post("/api/auth/become-operator").session(second).with(csrf())).andExpect(status().isOk());
        mvc.perform(get("/api/operator/vendors").session(second)).andExpect(status().isOk());
    }
}
