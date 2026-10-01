package com.Bitemap.Backend.auth;

import java.util.LinkedHashMap;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class OperatorRegistrationTests {
	private static final String PASSWORD = "A long test passphrase!";
	@Autowired private MockMvc mvc;
	@Autowired private JdbcTemplate jdbc;
	@Autowired private ObjectMapper json;
	@Autowired private PasswordEncoder encoder;

	@BeforeEach
	void emptyDatabase() {
		assertThat(jdbc.queryForObject("SELECT count(*) FROM operators", Integer.class))
				.as("Use a dedicated test database without the dev profile").isZero();
	}

	@Test
	void createsNormalizedAccountWithSaltedHashAndNoVendorOwnership() throws Exception {
		jdbc.update("INSERT INTO vendors(name, category, location) VALUES ('Existing truck', 'Tacos', 'CSUN')");
		mvc.perform(request("  Operator Name  ", " OWNER@Example.com ", PASSWORD).with(csrf()))
				.andExpect(status().isCreated())
				.andExpect(header().string("Cache-Control", "no-store"))
				.andExpect(jsonPath("$.id").isNumber())
				.andExpect(jsonPath("$.displayName").value("Operator Name"))
				.andExpect(jsonPath("$.email").value("owner@example.com"))
				.andExpect(jsonPath("$.password").doesNotExist())
				.andExpect(jsonPath("$.passwordHash").doesNotExist())
				.andExpect(jsonPath("$.token").doesNotExist())
				.andExpect(content().string(not(containsString(PASSWORD))));
		String hash = jdbc.queryForObject("SELECT password_hash FROM operators", String.class);
		assertThat(hash).startsWith("{pbkdf2-sha256-600k}").isNotEqualTo(PASSWORD);
		assertThat(encoder.matches(PASSWORD, hash)).isTrue();
		assertThat(encoder.matches("Incorrect password", hash)).isFalse();
		assertThat(jdbc.queryForObject("SELECT count(*) FROM vendors WHERE operator_id IS NOT NULL", Integer.class)).isZero();
		assertThat(jdbc.queryForObject("SELECT enabled FROM operators", Boolean.class)).isTrue();
	}

	@Test
	void equalPasswordsReceiveDifferentSaltsAndSpacesArePreserved() throws Exception {
		String password = "  keep these spaces  ";
		mvc.perform(request("One", "one@example.com", password).with(csrf())).andExpect(status().isCreated());
		mvc.perform(request("Two", "two@example.com", password).with(csrf())).andExpect(status().isCreated());
		var hashes = jdbc.queryForList("SELECT password_hash FROM operators ORDER BY id", String.class);
		assertThat(hashes.get(0)).isNotEqualTo(hashes.get(1));
		assertThat(encoder.matches(password, hashes.getFirst())).isTrue();
		assertThat(encoder.matches(password.strip(), hashes.getFirst())).isFalse();
	}

	@Test
	void duplicateEmailCannotOverwriteAccount() throws Exception {
		mvc.perform(request("Original", "owner@example.com", PASSWORD).with(csrf())).andExpect(status().isCreated());
		var before = jdbc.queryForMap("SELECT * FROM operators");
		mvc.perform(request("Replacement", " OWNER@EXAMPLE.COM ", "Another password value").with(csrf()))
				.andExpect(status().isConflict())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON));
		assertThat(jdbc.queryForMap("SELECT * FROM operators")).isEqualTo(before);
	}

	@ParameterizedTest
	@NullAndEmptySource
	@ValueSource(strings = {"short", "              "})
	void rejectsInvalidPasswordWithoutEchoingIt(String password) throws Exception {
		mvc.perform(request("Owner", "owner@example.com", password).with(csrf()))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.errors.password").isString())
				.andExpect(jsonPath("$.rejectedValue").doesNotExist());
		assertThat(jdbc.queryForObject("SELECT count(*) FROM operators", Integer.class)).isZero();
	}

	@ParameterizedTest
	@ValueSource(ints = {14, 129})
	void rejectsPasswordOutsideLengthLimits(int length) throws Exception {
		String secret = "x".repeat(length);
		mvc.perform(request("Owner", "owner@example.com", secret).with(csrf()))
				.andExpect(status().isBadRequest()).andExpect(content().string(not(containsString(secret))));
	}

	@ParameterizedTest
	@ValueSource(ints = {15, 64, 128})
	void acceptsPasswordLengthBoundaries(int length) throws Exception {
		String secret = "x".repeat(length);
		mvc.perform(request("Owner", "owner@example.com", secret).with(csrf())).andExpect(status().isCreated());
		assertThat(encoder.matches(secret, jdbc.queryForObject("SELECT password_hash FROM operators", String.class))).isTrue();
	}

	@ParameterizedTest
	@NullAndEmptySource
	@ValueSource(strings = {"   ", "not-an-email", "a@", "a b@example.com"})
	void rejectsInvalidEmail(String email) throws Exception {
		mvc.perform(request("Owner", email, PASSWORD).with(csrf()))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.email").isString());
	}

	@ParameterizedTest
	@NullAndEmptySource
	@ValueSource(strings = {"   ", "\t\n"})
	void rejectsBlankName(String name) throws Exception {
		mvc.perform(request(name, "owner@example.com", PASSWORD).with(csrf()))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.errors.displayName").isString());
	}

	@Test
	void rejectsOverlongFieldsAndAcceptsNameLimit() throws Exception {
		mvc.perform(request("x".repeat(121), "owner@example.com", PASSWORD).with(csrf()))
				.andExpect(status().isBadRequest());
		mvc.perform(request("Owner", "a".repeat(321) + "@example.com", PASSWORD).with(csrf()))
				.andExpect(status().isBadRequest());
		mvc.perform(request("x".repeat(120), "owner@example.com", PASSWORD).with(csrf()))
				.andExpect(status().isCreated());
	}

	@Test
	void csrfIsRequiredAndInvalidTokensAreRejected() throws Exception {
		mvc.perform(request("Owner", "owner@example.com", PASSWORD)).andExpect(status().isForbidden());
		mvc.perform(request("Owner", "owner@example.com", PASSWORD).with(csrf().useInvalidToken()))
				.andExpect(status().isForbidden());
		assertThat(jdbc.queryForObject("SELECT count(*) FROM operators", Integer.class)).isZero();
	}

	@Test
	void browserCanObtainTokenAndRegisterButIsNotLoggedIn() throws Exception {
		var result = mvc.perform(get("/api/auth/csrf")).andExpect(status().isOk())
				.andExpect(header().string("Cache-Control", "no-store")).andReturn();
		var body = json.readTree(result.getResponse().getContentAsString());
		var session = (MockHttpSession) result.getRequest().getSession(false);
		assertThat(session).isNotNull();
		mvc.perform(request("Owner", "owner@example.com", PASSWORD).session(session)
				.header(body.get("headerName").asText(), body.get("token").asText()))
				.andExpect(status().isCreated());
		mvc.perform(get("/api/private").session(session).accept(MediaType.APPLICATION_JSON))
				.andExpect(status().isUnauthorized());
	}

	@ParameterizedTest
	@ValueSource(strings = {"{}", "null", "{\"password\":", "{\"password\":{\"secret\":\"DO_NOT_ECHO\"}}"})
	void malformedRequestsHaveSafeErrors(String body) throws Exception {
		mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isBadRequest()).andExpect(content().string(not(containsString("DO_NOT_ECHO"))));
	}

	@Test
	void requestToStringDoesNotExposeCredentials() {
		assertThat(new RegisterOperatorRequest("Owner", "owner@example.com", PASSWORD).toString())
				.doesNotContain(PASSWORD, "owner@example.com");
	}

	private MockHttpServletRequestBuilder request(String name, String email, String password) {
		Map<String, Object> body = new LinkedHashMap<>();
		body.put("displayName", name);
		body.put("email", email);
		body.put("password", password);
		return post("/api/auth/register").contentType(MediaType.APPLICATION_JSON)
				.content(json.writeValueAsString(body));
	}
}
