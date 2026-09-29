package com.Bitemap.Backend.vendor;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class VendorApiTests {

	@Autowired
	private MockMvc mvc;

	@Autowired
	private JdbcTemplate jdbc;

	@BeforeEach
	void requireEmptyTestDatabase() {
		// Do not delete existing rows to make tests pass; use a dedicated test database.
		assertThat(jdbc.queryForObject("SELECT count(*) FROM vendors", Integer.class))
				.as("Run API tests against an empty test database without the dev profile")
				.isZero();
	}

	@Test
	void listsPublicVendorSummariesWithDefaultPagination() throws Exception {
		insertFixtures();
		mvc.perform(get("/api/vendors"))
				.andExpect(status().isOk())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_JSON))
				.andExpect(jsonPath("$.items.length()").value(4))
				.andExpect(jsonPath("$.items[0].name").value("Coffee Cart"))
				.andExpect(jsonPath("$.items[0].category").value("Coffee"))
				.andExpect(jsonPath("$.items[0].location").value("Reseda"))
				.andExpect(jsonPath("$.items[0].id").isNumber())
				.andExpect(jsonPath("$.items[0].createdAt").doesNotExist())
				.andExpect(jsonPath("$.page").value(0))
				.andExpect(jsonPath("$.size").value(20))
				.andExpect(jsonPath("$.totalElements").value(4))
				.andExpect(jsonPath("$.totalPages").value(1));
	}

	@ParameterizedTest
	@CsvSource({ "sOuP,Soup Stop", "tAcOs,Taco Mobile", "rEsEdA,Coffee Cart" })
	void searchesNameCategoryAndLocationIgnoringCase(String query, String expected) throws Exception {
		insertFixtures();
		mvc.perform(get("/api/vendors").param("q", query))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.totalElements").value(1))
				.andExpect(jsonPath("$.items[0].name").value(expected));
	}

	@Test
	void trimsSearchAndTreatsBlankSearchAsUnfiltered() throws Exception {
		insertFixtures();
		mvc.perform(get("/api/vendors").param("q", " \tTACO\n "))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items[0].name").value("Taco Mobile"))
				.andExpect(jsonPath("$.totalElements").value(1));
		mvc.perform(get("/api/vendors").param("q", " \t\n"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.totalElements").value(4));
	}

	@Test
	void paginatesResultsInStableNameAndIdOrder() throws Exception {
		insertFixtures();
		mvc.perform(get("/api/vendors").param("page", "1").param("size", "2"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items.length()").value(2))
				.andExpect(jsonPath("$.items[0].name").value("Taco Mobile"))
				.andExpect(jsonPath("$.items[1].name").value("Tea Time"))
				.andExpect(jsonPath("$.page").value(1))
				.andExpect(jsonPath("$.size").value(2))
				.andExpect(jsonPath("$.totalElements").value(4))
				.andExpect(jsonPath("$.totalPages").value(2));
		mvc.perform(get("/api/vendors").param("q", "CSUN").param("size", "1"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.totalElements").value(2))
				.andExpect(jsonPath("$.totalPages").value(2));
	}

	@Test
	void usesIdToBreakEqualNameTies() throws Exception {
		Long first = insert("Twin Truck", "Coffee", "CSUN");
		Long second = insert("Twin Truck", "Coffee", "Reseda");
		mvc.perform(get("/api/vendors").param("size", "1"))
				.andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(first));
		mvc.perform(get("/api/vendors").param("size", "1").param("page", "1"))
				.andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(second));
	}

	@ParameterizedTest
	@ValueSource(strings = { "%", "_", "!", "\\" })
	void treatsSqlPatternCharactersAsLiteralText(String query) throws Exception {
		insertFixtures();
		insert("100% Tacos", "Tacos", "CSUN");
		insert("A_B Snacks", "Snacks", "CSUN");
		insert("Bang! Cart", "Coffee", "CSUN");
		insert("Back\\Slash", "Coffee", "CSUN");
		mvc.perform(get("/api/vendors").param("q", query))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.totalElements").value(1))
				.andExpect(jsonPath("$.items[0].name", containsString(query)));
	}

	@Test
	void returnsEmptyPageForAnEmptyDatabase() throws Exception {
		mvc.perform(get("/api/vendors"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items").isEmpty())
				.andExpect(jsonPath("$.totalElements").value(0))
				.andExpect(jsonPath("$.totalPages").value(0));
	}

	@ParameterizedTest
	@ValueSource(strings = { "no-such-vendor", "' OR 1=1 --" })
	void returnsEmptyPageForNoMatchWithoutInterpretingSql(String query) throws Exception {
		insertFixtures();
		mvc.perform(get("/api/vendors").param("q", query))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items").isEmpty())
				.andExpect(jsonPath("$.totalElements").value(0));
	}

	@Test
	void returnsEmptyItemsBeyondLastPageWhileKeepingTotal() throws Exception {
		insertFixtures();
		mvc.perform(get("/api/vendors").param("page", "10000"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.items").isEmpty())
				.andExpect(jsonPath("$.page").value(10000))
				.andExpect(jsonPath("$.totalElements").value(4));
	}

	@ParameterizedTest
	@CsvSource({ "page,-1", "page,10001", "page,nope", "page,2147483648",
			"size,0", "size,-1", "size,101", "size,nope" })
	void rejectsInvalidPagination(String parameter, String value) throws Exception {
		mvc.perform(get("/api/vendors").param(parameter, value))
				.andExpect(status().isBadRequest())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.status").value(400));
	}

	@Test
	void enforcesSearchLengthAndAcceptsUpperBounds() throws Exception {
		mvc.perform(get("/api/vendors").param("q", "a".repeat(201)))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.status").value(400));
		mvc.perform(get("/api/vendors").param("q", "a".repeat(200)).param("size", "100"))
				.andExpect(status().isOk()).andExpect(jsonPath("$.size").value(100));
	}

	@Test
	void leavesHealthPublicButOtherRoutesAndWritesProtected() throws Exception {
		mvc.perform(get("/actuator/health")).andExpect(status().isOk());
		mvc.perform(get("/api/private").accept(MediaType.APPLICATION_JSON)).andExpect(status().isUnauthorized());
		mvc.perform(get("/actuator/env").accept(MediaType.APPLICATION_JSON)).andExpect(status().isUnauthorized());
		mvc.perform(post("/api/vendors")).andExpect(status().isForbidden());
		mvc.perform(post("/api/vendors").with(csrf()).accept(MediaType.APPLICATION_JSON))
				.andExpect(status().isUnauthorized());
	}

	private void insertFixtures() {
		insert("Soup Stop", "Soup", "CSUN");
		insert("Taco Mobile", "Tacos", "Northridge");
		insert("Coffee Cart", "Coffee", "Reseda");
		insert("Tea Time", "Tea", "CSUN");
	}

	private Long insert(String name, String category, String location) {
		return jdbc.queryForObject("INSERT INTO vendors (name, category, location) VALUES (?, ?, ?) RETURNING id",
				Long.class, name, category, location);
	}
}
