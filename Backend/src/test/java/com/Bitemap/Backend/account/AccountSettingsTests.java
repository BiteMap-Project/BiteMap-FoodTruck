package com.Bitemap.Backend.account;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import com.Bitemap.Backend.TestAccounts;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** SCRUM-79: customers can change their own display name and nothing else. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AccountSettingsTests {
	static final String EMAIL = "settings-customer@example.com";
	static final String OTHER = "settings-other@example.com";
	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;
	long customer;
	long other;

	@BeforeEach
	void seed() {
		customer = customer("Casey Customer", EMAIL);
		other = customer("Other Person", OTHER);
	}

	long customer(String name, String email) {
		long id = jdbc.queryForObject(
				"INSERT INTO app_users(display_name,email,password_hash) VALUES (?,?,'unused') RETURNING id",
				Long.class, name, email);
		jdbc.update("INSERT INTO app_user_roles(user_id,role) VALUES (?, 'CUSTOMER')", id);
		return id;
	}

	String name(long id) {
		return jdbc.queryForObject("SELECT display_name FROM app_users WHERE id=?", String.class, id);
	}

	@Test
	void updatesOnlyTheSignedInAccountsTrimmedDisplayName() throws Exception {
		mvc.perform(patch("/api/account/profile").with(TestAccounts.user(EMAIL).roles("CUSTOMER")).with(csrf())
				.contentType("application/json").content("{\"displayName\":\"  Casey C.  \"}"))
				.andExpect(status().isOk())
				.andExpect(header().string("Cache-Control", "no-store"))
				.andExpect(jsonPath("$.id").value(customer))
				.andExpect(jsonPath("$.displayName").value("Casey C."))
				.andExpect(jsonPath("$.email").value(EMAIL))
				.andExpect(jsonPath("$.roles", contains("ROLE_CUSTOMER")));
		assertThat(name(customer)).isEqualTo("Casey C.");
		assertThat(name(other)).isEqualTo("Other Person");
		mvc.perform(get("/api/auth/me").with(TestAccounts.user(EMAIL).roles("CUSTOMER")))
				.andExpect(status().isOk()).andExpect(jsonPath("$.displayName").value("Casey C."));
	}

	@Test
	void ignoresIdEmailAndRolesSentInTheForm() throws Exception {
		mvc.perform(patch("/api/account/profile").with(TestAccounts.user(EMAIL).roles("CUSTOMER")).with(csrf())
				.contentType("application/json").content("""
						{"displayName":"New Name","id":%d,"userId":%d,"email":"stolen@example.com",
						 "roles":["ROLE_ADMIN","ROLE_OPERATOR"]}
						""".formatted(other, other)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(customer))
				.andExpect(jsonPath("$.email").value(EMAIL))
				.andExpect(jsonPath("$.roles", contains("ROLE_CUSTOMER")));
		assertThat(name(customer)).isEqualTo("New Name");
		assertThat(name(other)).isEqualTo("Other Person");
		assertThat(jdbc.queryForObject("SELECT email FROM app_users WHERE id=?", String.class, customer)).isEqualTo(EMAIL);
		assertThat(jdbc.queryForList("SELECT role FROM app_user_roles WHERE user_id=?", String.class, customer))
				.containsExactly("CUSTOMER");
	}

	@Test
	void rejectsBlankTooLongAndControlCharacterNamesWithoutSaving() throws Exception {
		for (String body : new String[] {
				"{\"displayName\":\"   \"}",
				"{}",
				"{\"displayName\":\"" + "x".repeat(121) + "\"}",
				"{\"displayName\":\"Line\\nBreak\"}" }) {
			mvc.perform(patch("/api/account/profile").with(TestAccounts.user(EMAIL).roles("CUSTOMER")).with(csrf())
					.contentType("application/json").content(body))
					.andExpect(status().isBadRequest())
					.andExpect(jsonPath("$.errors.displayName").exists());
		}
		mvc.perform(patch("/api/account/profile").with(TestAccounts.user(EMAIL).roles("CUSTOMER")).with(csrf())
				.contentType("application/json").content("not json"))
				.andExpect(status().isBadRequest());
		assertThat(name(customer)).isEqualTo("Casey Customer");
	}

	@Test
	void acceptsExactly120Characters() throws Exception {
		String longest = "y".repeat(120);
		mvc.perform(patch("/api/account/profile").with(TestAccounts.user(EMAIL).roles("CUSTOMER")).with(csrf())
				.contentType("application/json").content("{\"displayName\":\"" + longest + "\"}"))
				.andExpect(status().isOk());
		assertThat(name(customer)).isEqualTo(longest);
	}

	@Test
	void requiresSignInAndCsrf() throws Exception {
		mvc.perform(patch("/api/account/profile").with(csrf())
				.contentType("application/json").content("{\"displayName\":\"Anon\"}"))
				.andExpect(status().isUnauthorized());
		mvc.perform(patch("/api/account/profile").with(TestAccounts.user(EMAIL).roles("CUSTOMER"))
				.contentType("application/json").content("{\"displayName\":\"No Token\"}"))
				.andExpect(status().isForbidden());
		assertThat(name(customer)).isEqualTo("Casey Customer");
	}

	@Test
	void operatorsCanRenameTheirAccountToo() throws Exception {
		long operator = TestAccounts.operator(jdbc, "Owner", "settings-owner@example.com", "unused");
		mvc.perform(patch("/api/account/profile").with(TestAccounts.user("settings-owner@example.com").roles("CUSTOMER", "OPERATOR"))
				.with(csrf()).contentType("application/json").content("{\"displayName\":\"Taco Owner\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.displayName").value("Taco Owner"))
				.andExpect(jsonPath("$.roles", contains("ROLE_CUSTOMER", "ROLE_OPERATOR")));
		long user = jdbc.queryForObject("SELECT user_id FROM operators WHERE id=?", Long.class, operator);
		assertThat(name(user)).isEqualTo("Taco Owner");
	}
}
