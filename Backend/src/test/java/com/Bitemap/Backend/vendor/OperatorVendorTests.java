package com.Bitemap.Backend.vendor;

import java.util.LinkedHashMap;
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
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
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
class OperatorVendorTests {
	private static final String ROOT = "/api/operator/vendors";
	private static final String ALPHA = "alpha@example.com";
	private static final String BETA = "beta@example.com";
	private static final String BODY = "{\"name\":\" Taco Mobile \",\"category\":\" Tacos \",\"location\":\" Northridge \"}";
	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;
	@Autowired ObjectMapper json;
	@Autowired PasswordEncoder encoder;
	private long alpha;
	private long beta;

	@BeforeEach
	void seedIsolatedAccounts() {
		assertThat(jdbc.queryForObject("SELECT count(*) FROM operators", Integer.class))
				.as("Use an isolated test database without dev fixtures").isZero();
		alpha = account(ALPHA);
		beta = account(BETA);
	}

	@Test
	void createUsesSessionOwnerAndReturnsPublicLocationWithoutPrivateFields() throws Exception {
		var result = mvc.perform(post(ROOT).with(com.Bitemap.Backend.TestAccounts.user(ALPHA).roles("OPERATOR")).with(csrf())
				.contentType("application/json").content(BODY)).andExpect(status().isCreated())
				.andExpect(header().string("Cache-Control", "no-store"))
				.andExpect(jsonPath("$.name").value("Taco Mobile"))
				.andExpect(jsonPath("$.category").value("Tacos"))
				.andExpect(jsonPath("$.location").value("Northridge"))
				.andExpect(jsonPath("$.operatorId").doesNotExist()).andReturn();
		long id = json.readTree(result.getResponse().getContentAsString()).get("id").asLong();
		assertThat(result.getResponse().getHeader("Location")).isEqualTo("/api/vendors/" + id);
		assertThat(jdbc.queryForObject("SELECT operator_id FROM vendors WHERE id = ?", Long.class, id)).isEqualTo(alpha);
		mvc.perform(get("/api/vendors/" + id)).andExpect(status().isOk()).andExpect(jsonPath("$.name").value("Taco Mobile"));
		mvc.perform(get("/api/vendors").param("q", "Taco Mobile")).andExpect(status().isOk())
				.andExpect(jsonPath("$.totalElements").value(1));
	}

	@Test
	void suppliedIdsAndOwnershipFieldsCannotAssignOrTransferOwnership() throws Exception {
		String spoof = "{\"id\":-9000,\"operatorId\":" + beta + ",\"operator_id\":" + beta
				+ ",\"name\":\"Safe\",\"category\":\"Soup\",\"location\":\"CSUN\"}";
		var created = mvc.perform(post(ROOT).with(com.Bitemap.Backend.TestAccounts.user(ALPHA).roles("OPERATOR")).with(csrf())
				.contentType("application/json").content(spoof)).andExpect(status().isCreated()).andReturn();
		long id = json.readTree(created.getResponse().getContentAsString()).get("id").asLong();
		assertThat(id).isNotEqualTo(-9000);
		mvc.perform(put(ROOT + "/" + id).with(com.Bitemap.Backend.TestAccounts.user(ALPHA).roles("OPERATOR")).with(csrf())
				.contentType("application/json").content(spoof)).andExpect(status().isOk());
		assertThat(jdbc.queryForObject("SELECT operator_id FROM vendors WHERE id = ?", Long.class, id)).isEqualTo(alpha);
	}

	@Test
	void listIsOwnerScopedPaginatedAndStable() throws Exception {
		long first = vendor(alpha, "Same");
		long second = vendor(alpha, "Same");
		vendor(beta, "Other operator");
		vendor(null, "Unowned");
		mvc.perform(get(ROOT).with(com.Bitemap.Backend.TestAccounts.user(ALPHA).roles("OPERATOR")).param("size", "1"))
				.andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(2))
				.andExpect(jsonPath("$.totalPages").value(2)).andExpect(jsonPath("$.items.length()").value(1))
				.andExpect(jsonPath("$.items[0].id").value(first)).andExpect(header().string("Cache-Control", "no-store"));
		mvc.perform(get(ROOT).with(com.Bitemap.Backend.TestAccounts.user(ALPHA).roles("OPERATOR")).param("page", "1").param("size", "1"))
				.andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(second));
		mvc.perform(get(ROOT).with(com.Bitemap.Backend.TestAccounts.user(ALPHA).roles("OPERATOR")).param("page", "10000"))
				.andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty()).andExpect(jsonPath("$.totalElements").value(2));
		mvc.perform(get(ROOT).with(com.Bitemap.Backend.TestAccounts.user(BETA).roles("OPERATOR"))).andExpect(status().isOk())
				.andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.items[0].name").value("Other operator"));
	}

	@Test
	void newOperatorHasEmptyListNotPublicFixtures() throws Exception {
		vendor(null, "Demo");
		mvc.perform(get(ROOT).with(com.Bitemap.Backend.TestAccounts.user(ALPHA).roles("OPERATOR"))).andExpect(status().isOk())
				.andExpect(jsonPath("$.items").isEmpty()).andExpect(jsonPath("$.totalElements").value(0))
				.andExpect(jsonPath("$.totalPages").value(0));
	}

	@Test
	void updatePreservesOwnerCreatedAtMenuAndSchedule() throws Exception {
		long id = vendor(alpha, "Before");
		var before = jdbc.queryForMap("SELECT operator_id, created_at FROM vendors WHERE id = ?", id);
		jdbc.update("INSERT INTO vendor_menu_items(vendor_id,name,price) VALUES (?, 'Soup', 5.00)", id);
		jdbc.update("""
				INSERT INTO vendor_stops(vendor_id,venue_name,address,latitude,longitude,starts_at,ends_at,time_zone)
				VALUES (?, 'Campus', 'Test address', 34.2, -118.5, '2030-01-01T12:00:00Z', '2030-01-01T13:00:00Z', 'UTC')
				""", id);
		var scheduleBefore = jdbc.queryForList("SELECT * FROM vendor_stops WHERE vendor_id = ?", id);
		mvc.perform(put(ROOT + "/" + id).with(com.Bitemap.Backend.TestAccounts.user(ALPHA).roles("OPERATOR")).with(csrf())
				.contentType("application/json").content(BODY)).andExpect(status().isOk())
				.andExpect(jsonPath("$.id").value(id)).andExpect(jsonPath("$.name").value("Taco Mobile"));
		assertThat(jdbc.queryForMap("SELECT operator_id, created_at FROM vendors WHERE id = ?", id)).isEqualTo(before);
		assertThat(jdbc.queryForList("SELECT * FROM vendor_stops WHERE vendor_id = ?", id)).isEqualTo(scheduleBefore);
		mvc.perform(get("/api/vendors/" + id)).andExpect(status().isOk())
				.andExpect(jsonPath("$.name").value("Taco Mobile")).andExpect(jsonPath("$.menu[0].name").value("Soup"));
	}

	@Test
	void foreignUnownedAndMissingVendorsAllReturn404AndRemainUnchanged() throws Exception {
		long foreign = vendor(beta, "Other owner");
		long unowned = vendor(null, "Unowned");
		var before = jdbc.queryForList("SELECT * FROM vendors ORDER BY id");
		for (long id : new long[] {foreign, unowned, Long.MAX_VALUE}) {
			mvc.perform(put(ROOT + "/" + id).with(com.Bitemap.Backend.TestAccounts.user(ALPHA).roles("OPERATOR")).with(csrf())
					.contentType("application/json").content(BODY)).andExpect(status().isNotFound())
					.andExpect(jsonPath("$.detail").value("Vendor not found."));
		}
		assertThat(jdbc.queryForList("SELECT * FROM vendors ORDER BY id")).isEqualTo(before);
	}

	@Test
	void anonymousAndWrongRoleCannotUseManagementEndpoints() throws Exception {
		mvc.perform(get(ROOT)).andExpect(status().isUnauthorized());
		mvc.perform(post(ROOT).with(csrf()).contentType("application/json").content(BODY)).andExpect(status().isUnauthorized());
		mvc.perform(put(ROOT + "/1").with(csrf()).contentType("application/json").content(BODY)).andExpect(status().isUnauthorized());
		mvc.perform(get(ROOT).with(com.Bitemap.Backend.TestAccounts.user(ALPHA).roles("CUSTOMER"))).andExpect(status().isForbidden());
		mvc.perform(post(ROOT).with(com.Bitemap.Backend.TestAccounts.user(ALPHA).roles("CUSTOMER")).with(csrf()).contentType("application/json").content(BODY))
				.andExpect(status().isForbidden());
	}

	@Test
	void csrfRequiredForCreateAndUpdate() throws Exception {
		long id = vendor(alpha, "Before");
		mvc.perform(post(ROOT).with(com.Bitemap.Backend.TestAccounts.user(ALPHA).roles("OPERATOR")).contentType("application/json").content(BODY))
				.andExpect(status().isForbidden());
		mvc.perform(put(ROOT + "/" + id).with(com.Bitemap.Backend.TestAccounts.user(ALPHA).roles("OPERATOR")).with(csrf().useInvalidToken())
				.contentType("application/json").content(BODY)).andExpect(status().isForbidden());
		assertThat(jdbc.queryForObject("SELECT name FROM vendors WHERE id = ?", String.class, id)).isEqualTo("Before");
	}

	@Test
	void disabledOrDeletedAccountIsRejectedEvenWithOperatorPrincipal() throws Exception {
		long id = vendor(alpha, "Before");
		jdbc.update("UPDATE operators SET enabled = FALSE WHERE id = ?", alpha);
		mvc.perform(get(ROOT).with(com.Bitemap.Backend.TestAccounts.user(ALPHA).roles("OPERATOR"))).andExpect(status().isForbidden());
		mvc.perform(post(ROOT).with(com.Bitemap.Backend.TestAccounts.user(ALPHA).roles("OPERATOR")).with(csrf()).contentType("application/json").content(BODY))
				.andExpect(status().isForbidden());
		mvc.perform(put(ROOT + "/" + id).with(com.Bitemap.Backend.TestAccounts.user(ALPHA).roles("OPERATOR")).with(csrf()).contentType("application/json").content(BODY))
				.andExpect(status().isForbidden());
		jdbc.update("DELETE FROM operators WHERE id = ?", beta);
		mvc.perform(get(ROOT).with(com.Bitemap.Backend.TestAccounts.user(BETA).roles("OPERATOR"))).andExpect(status().isForbidden());
		assertThat(jdbc.queryForObject("SELECT name FROM vendors WHERE id = ?", String.class, id)).isEqualTo("Before");
	}

	@Test
	void actualLoginSessionCanCreateThenIsBlockedWhenAccountDisabled() throws Exception {
		jdbc.update("UPDATE app_users SET password_hash = ? WHERE id = (SELECT user_id FROM operators WHERE id = ?)", encoder.encode("A long test passphrase!"), alpha);
		var result = mvc.perform(post("/api/auth/login").with(csrf()).contentType("application/json")
				.content("{\"email\":\"alpha@example.com\",\"password\":\"A long test passphrase!\"}"))
				.andExpect(status().isOk()).andReturn();
		var session = (MockHttpSession) result.getRequest().getSession(false);
		mvc.perform(post(ROOT).session(session).with(csrf()).contentType("application/json").content(BODY))
				.andExpect(status().isCreated());
		jdbc.update("UPDATE operators SET enabled = FALSE WHERE id = ?", alpha);
		mvc.perform(get(ROOT).session(session)).andExpect(status().isForbidden());
	}

	@ParameterizedTest
	@ValueSource(strings = {"{}", "null", "{", "{\"name\":{\"secret\":\"DO_NOT_ECHO\"}}"})
	void malformedBodyDoesNotLeakInput(String body) throws Exception {
		mvc.perform(post(ROOT).with(com.Bitemap.Backend.TestAccounts.user(ALPHA).roles("OPERATOR")).with(csrf()).contentType("application/json").content(body))
				.andExpect(status().isBadRequest()).andExpect(content().string(not(containsString("DO_NOT_ECHO"))));
	}

	@ParameterizedTest
	@ValueSource(strings = {"name", "category", "location"})
	void validatesRequiredFieldsAndLengthOnBothWrites(String field) throws Exception {
		long id = vendor(alpha, "Unchanged");
		int max = Map.of("name", 120, "category", 80, "location", 200).get(field);
		for (String value : new String[] {null, "", " \t\n ", "x".repeat(max + 1)}) {
			var body = new LinkedHashMap<String, String>(Map.of("name", "Name", "category", "Food", "location", "CSUN"));
			body.put(field, value);
			for (var request : java.util.List.of(post(ROOT), put(ROOT + "/" + id))) {
				mvc.perform(request.with(com.Bitemap.Backend.TestAccounts.user(ALPHA).roles("OPERATOR")).with(csrf()).contentType("application/json")
						.content(json.writeValueAsString(body))).andExpect(status().isBadRequest());
			}
		}
		assertThat(jdbc.queryForObject("SELECT name FROM vendors WHERE id = ?", String.class, id)).isEqualTo("Unchanged");
	}

	@Test
	void acceptsLengthBoundariesAndTreatsSqlTextAsData() throws Exception {
		var body = Map.of("name", "x".repeat(120), "category", "x".repeat(80), "location", "x".repeat(200));
		mvc.perform(post(ROOT).with(com.Bitemap.Backend.TestAccounts.user(ALPHA).roles("OPERATOR")).with(csrf()).contentType("application/json")
				.content(json.writeValueAsString(body))).andExpect(status().isCreated());
		mvc.perform(post(ROOT).with(com.Bitemap.Backend.TestAccounts.user(ALPHA).roles("OPERATOR")).with(csrf()).contentType("application/json")
				.content("{\"name\":\"'; DROP TABLE vendors; --\",\"category\":\"Food\",\"location\":\"CSUN\"}"))
				.andExpect(status().isCreated());
		assertThat(jdbc.queryForObject("SELECT count(*) FROM vendors WHERE operator_id = ?", Integer.class, alpha)).isEqualTo(2);
	}

	@ParameterizedTest
	@ValueSource(strings = {"page=-1", "page=10001", "page=nope", "size=0", "size=101", "size=nope"})
	void rejectsBadPagination(String parameter) throws Exception {
		mvc.perform(get(ROOT + "?" + parameter).with(com.Bitemap.Backend.TestAccounts.user(ALPHA).roles("OPERATOR"))).andExpect(status().isBadRequest());
	}

	@ParameterizedTest
	@ValueSource(strings = {"abc", "1.5", "9223372036854775808"})
	void rejectsBadVendorId(String id) throws Exception {
		mvc.perform(put(ROOT + "/" + id).with(com.Bitemap.Backend.TestAccounts.user(ALPHA).roles("OPERATOR")).with(csrf())
				.contentType("application/json").content(BODY)).andExpect(status().isBadRequest());
	}

	private long account(String email) {
		return com.Bitemap.Backend.TestAccounts.operator(jdbc, "Test", email, "not-used");
	}

	private long vendor(Long owner, String name) {
		return jdbc.queryForObject("INSERT INTO vendors(name,category,location,operator_id) VALUES (?, 'Food', 'CSUN', ?) RETURNING id", Long.class, name, owner);
	}
}
