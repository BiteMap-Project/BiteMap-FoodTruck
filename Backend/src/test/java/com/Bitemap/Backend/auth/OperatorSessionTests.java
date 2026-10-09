package com.Bitemap.Backend.auth;

import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.core.userdetails.UserDetails;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class OperatorSessionTests {
	private static final String PASSWORD = "  Keep my password spaces!  ";
	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;
	@Autowired PasswordEncoder encoder;
	@Autowired ObjectMapper json;

	@BeforeEach
	void createOperator() {
		assertThat(jdbc.queryForObject("SELECT count(*) FROM operators", Integer.class))
				.as("Use the isolated test database without development fixtures").isZero();
		com.Bitemap.Backend.TestAccounts.operator(jdbc,
				"Test Operator", "owner@example.com", encoder.encode(PASSWORD));
	}

	@Test
	void browserSessionLoginRotatesIdAndCsrfThenLogoutInvalidatesSession() throws Exception {
		var tokenResult = mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk()).andReturn();
		var session = (MockHttpSession) tokenResult.getRequest().getSession(false);
		var token = json.readTree(tokenResult.getResponse().getContentAsString()).get("token").asText();
		String oldId = session.getId();
		mvc.perform(login(" OWNER@EXAMPLE.COM ", PASSWORD).session(session).header("X-CSRF-TOKEN", token))
				.andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
				.andExpect(jsonPath("$.email").value("owner@example.com"))
				.andExpect(jsonPath("$.displayName").value("Test Operator"))
				.andExpect(jsonPath("$.id").isNumber())
				.andExpect(jsonPath("$.password").doesNotExist())
				.andExpect(jsonPath("$.passwordHash").doesNotExist());
		assertThat(session.getId()).isNotEqualTo(oldId);
		var context = (SecurityContext) session.getAttribute("SPRING_SECURITY_CONTEXT");
		assertThat(context.getAuthentication().getCredentials()).isNull();
		assertThat(((UserDetails) context.getAuthentication().getPrincipal()).getPassword()).isNull();
		mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk())
				.andExpect(jsonPath("$.email").value("owner@example.com"))
				.andExpect(header().string("Cache-Control", "no-store"));
		mvc.perform(post("/api/auth/logout").session(session).header("X-CSRF-TOKEN", token))
				.andExpect(status().isForbidden());
		var refreshed = mvc.perform(get("/api/auth/csrf").session(session)).andReturn();
		String newToken = json.readTree(refreshed.getResponse().getContentAsString()).get("token").asText();
		mvc.perform(post("/api/auth/logout").session(session).header("X-CSRF-TOKEN", newToken))
				.andExpect(status().isNoContent()).andExpect(cookie().maxAge("JSESSIONID", 0));
		assertThat(session.isInvalid()).isTrue();
		mvc.perform(get("/api/auth/me").cookie(new jakarta.servlet.http.Cookie("JSESSIONID", oldId)))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void badPasswordUnknownEmailAndDisabledAccountHaveSameError() throws Exception {
		String wrong = mvc.perform(login("owner@example.com", "wrong password").with(csrf()))
				.andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
		String unknown = mvc.perform(login("unknown@example.com", PASSWORD).with(csrf()))
				.andExpect(status().isUnauthorized()).andReturn().getResponse().getContentAsString();
		jdbc.update("UPDATE app_users SET enabled = FALSE");
		var disabled = mvc.perform(login("owner@example.com", PASSWORD).with(csrf()))
				.andExpect(status().isUnauthorized()).andReturn();
		assertThat(disabled.getResponse().getContentAsString()).isEqualTo(wrong).isEqualTo(unknown)
				.doesNotContain(PASSWORD, "disabled", "unknown@example.com");
		var session = disabled.getRequest().getSession(false);
		if (session != null) assertThat(session.getAttribute("SPRING_SECURITY_CONTEXT")).isNull();
	}

	@Test
	void passwordSpacesAreNotTrimmed() throws Exception {
		mvc.perform(login("owner@example.com", PASSWORD.strip()).with(csrf())).andExpect(status().isUnauthorized());
	}

	@Test
	void loginAndLogoutRequireCsrf() throws Exception {
		mvc.perform(login("owner@example.com", PASSWORD)).andExpect(status().isForbidden());
		mvc.perform(login("owner@example.com", PASSWORD).with(csrf().useInvalidToken())).andExpect(status().isForbidden());
		var result = mvc.perform(login("owner@example.com", PASSWORD).with(csrf())).andReturn();
		var session = (MockHttpSession) result.getRequest().getSession(false);
		mvc.perform(post("/api/auth/logout").session(session)).andExpect(status().isForbidden());
		mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isOk());
	}

	@Test
	void anonymousAndExpiredSessionsCannotReadMeOrUseBasicLogin() throws Exception {
		mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized())
				.andExpect(content().contentTypeCompatibleWith("application/problem+json"));
		mvc.perform(get("/api/auth/me").with(httpBasic("owner@example.com", PASSWORD)))
				.andExpect(status().isUnauthorized());
		mvc.perform(get("/login")).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/auth/me").cookie(new jakarta.servlet.http.Cookie("JSESSIONID", "expired-id")))
				.andExpect(status().isUnauthorized());
	}

	@Test
	void logoutIsIdempotentWithFreshCsrf() throws Exception {
		mvc.perform(post("/api/auth/logout").with(csrf())).andExpect(status().isNoContent());
		mvc.perform(post("/api/auth/logout").with(csrf())).andExpect(status().isNoContent());
	}

	@ParameterizedTest
	@ValueSource(strings = {"{}", "null", "{", "{\"email\":\"bad\",\"password\":\"secret\"}",
			"{\"email\":\"owner@example.com\",\"password\":\"\"}", "{\"password\":{\"secret\":\"DO_NOT_ECHO\"}}"})
	void invalidJsonAndFieldsReturnSafeErrors(String body) throws Exception {
		mvc.perform(post("/api/auth/login").with(csrf()).contentType("application/json").content(body))
				.andExpect(status().isBadRequest()).andExpect(content().string(not(containsString("DO_NOT_ECHO"))));
	}

	@Test
	void oversizedCredentialsRejectedAndToStringRedacted() throws Exception {
		mvc.perform(login("x".repeat(321) + "@example.com", PASSWORD).with(csrf())).andExpect(status().isBadRequest());
		mvc.perform(login("owner@example.com", "x".repeat(129)).with(csrf())).andExpect(status().isBadRequest());
		assertThat(new LoginRequest("owner@example.com", PASSWORD).toString()).doesNotContain(PASSWORD, "owner@example.com");
	}

	@Test
	void disabledAccountCannotReadMe() throws Exception {
		var result = mvc.perform(login("owner@example.com", PASSWORD).with(csrf())).andReturn();
		var session = (MockHttpSession) result.getRequest().getSession(false);
		jdbc.update("UPDATE app_users SET enabled = FALSE");
		mvc.perform(get("/api/auth/me").session(session)).andExpect(status().isUnauthorized());
	}

	private MockHttpServletRequestBuilder login(String email, String password) {
		return post("/api/auth/login").contentType("application/json")
				.content(json.writeValueAsString(Map.of("email", email, "password", password)));
	}
}
