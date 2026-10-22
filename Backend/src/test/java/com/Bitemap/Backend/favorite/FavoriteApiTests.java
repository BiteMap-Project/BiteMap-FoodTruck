package com.Bitemap.Backend.favorite;

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
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** SCRUM-78: customers save trucks to their own account only. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class FavoriteApiTests {
	static final String EMAIL = "favorites-customer@example.com";
	static final String OTHER_EMAIL = "favorites-other@example.com";
	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;
	long customer;
	long other;
	long tacos;
	long soup;

	@BeforeEach
	void seed() {
		customer = customer("Fan", EMAIL);
		other = customer("Other", OTHER_EMAIL);
		tacos = vendor("Favorite Tacos", "Tacos");
		soup = vendor("Favorite Soup", "Soup");
	}

	long customer(String name, String email) {
		long id = jdbc.queryForObject("""
				INSERT INTO app_users(display_name,email,password_hash) VALUES (?,?,'unused') RETURNING id
				""", Long.class, name, email);
		jdbc.update("INSERT INTO app_user_roles(user_id,role) VALUES (?, 'CUSTOMER')", id);
		return id;
	}

	long vendor(String name, String category) {
		return jdbc.queryForObject("INSERT INTO vendors(name,category,location) VALUES (?,?,'CSUN') RETURNING id",
				Long.class, name, category);
	}

	int saved(long user) {
		return jdbc.queryForObject("SELECT count(*) FROM customer_favorites WHERE user_id=?", Integer.class, user);
	}

	TestAccounts.SessionUser me() {
		return TestAccounts.user(EMAIL).roles("CUSTOMER");
	}

	@Test
	void savesListsAndRemovesFavoritesNewestFirst() throws Exception {
		mvc.perform(put("/api/customer/favorites/" + tacos).with(me()).with(csrf()))
				.andExpect(status().isNoContent()).andExpect(header().string("Cache-Control", "no-store"));
		jdbc.update("UPDATE customer_favorites SET created_at = created_at - interval '1 minute' WHERE vendor_id=?", tacos);
		mvc.perform(put("/api/customer/favorites/" + soup).with(me()).with(csrf()))
				.andExpect(status().isNoContent());

		mvc.perform(get("/api/customer/favorites").with(me()))
				.andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
				.andExpect(jsonPath("$.totalElements").value(2))
				.andExpect(jsonPath("$.items", hasSize(2)))
				.andExpect(jsonPath("$.items[0].id").value(soup))
				.andExpect(jsonPath("$.items[0].name").value("Favorite Soup"))
				.andExpect(jsonPath("$.items[0].category").value("Soup"))
				.andExpect(jsonPath("$.items[0].savedAt").exists())
				.andExpect(jsonPath("$.items[1].id").value(tacos));
		mvc.perform(get("/api/customer/favorites/ids").with(me()))
				.andExpect(status().isOk()).andExpect(jsonPath("$.vendorIds", hasSize(2)))
				.andExpect(jsonPath("$.vendorIds[0]").value(soup));
		mvc.perform(get("/api/customer/favorites?size=1&page=1").with(me()))
				.andExpect(status().isOk()).andExpect(jsonPath("$.items", hasSize(1)))
				.andExpect(jsonPath("$.items[0].id").value(tacos)).andExpect(jsonPath("$.totalPages").value(2));

		mvc.perform(delete("/api/customer/favorites/" + tacos).with(me()).with(csrf()))
				.andExpect(status().isNoContent());
		mvc.perform(get("/api/customer/favorites").with(me()))
				.andExpect(jsonPath("$.items", hasSize(1))).andExpect(jsonPath("$.items[0].id").value(soup));
	}

	@Test
	void savingTwiceDoesNotDuplicateAndRemovingTwiceSucceeds() throws Exception {
		for (int i = 0; i < 2; i++) {
			mvc.perform(put("/api/customer/favorites/" + tacos).with(me()).with(csrf()))
					.andExpect(status().isNoContent());
		}
		assertThat(saved(customer)).isEqualTo(1);
		for (int i = 0; i < 2; i++) {
			mvc.perform(delete("/api/customer/favorites/" + tacos).with(me()).with(csrf()))
					.andExpect(status().isNoContent());
		}
		assertThat(saved(customer)).isZero();
		// Removing a truck that never existed is also safe.
		mvc.perform(delete("/api/customer/favorites/987654321").with(me()).with(csrf()))
				.andExpect(status().isNoContent());
	}

	@Test
	void customersOnlySeeAndChangeTheirOwnFavorites() throws Exception {
		jdbc.update("INSERT INTO customer_favorites(user_id,vendor_id) VALUES (?,?)", other, soup);
		mvc.perform(get("/api/customer/favorites").with(me()))
				.andExpect(status().isOk()).andExpect(jsonPath("$.items", hasSize(0)));
		mvc.perform(get("/api/customer/favorites/ids").with(me()))
				.andExpect(jsonPath("$.vendorIds", hasSize(0)));
		// Removing the same truck from "my" favorites leaves the other customer's row alone.
		mvc.perform(delete("/api/customer/favorites/" + soup).with(me()).with(csrf()))
				.andExpect(status().isNoContent());
		assertThat(saved(other)).isEqualTo(1);
		mvc.perform(put("/api/customer/favorites/" + tacos).with(me()).with(csrf()))
				.andExpect(status().isNoContent());
		assertThat(saved(other)).isEqualTo(1);
		assertThat(jdbc.queryForList("SELECT vendor_id FROM customer_favorites WHERE user_id=?", Long.class, customer))
				.containsExactly(tacos);
	}

	@Test
	void requiresSignedInCustomerAndCsrf() throws Exception {
		mvc.perform(get("/api/customer/favorites")).andExpect(status().isUnauthorized());
		mvc.perform(put("/api/customer/favorites/" + tacos).with(csrf())).andExpect(status().isUnauthorized());
		mvc.perform(put("/api/customer/favorites/" + tacos).with(me())).andExpect(status().isForbidden());
		mvc.perform(delete("/api/customer/favorites/" + tacos).with(me())).andExpect(status().isForbidden());
		assertThat(saved(customer)).isZero();

		jdbc.update("UPDATE app_users SET enabled=false WHERE id=?", customer);
		mvc.perform(get("/api/customer/favorites").with(me())).andExpect(status().isUnauthorized());
	}

	@Test
	void rejectsUnknownTrucksAndBadInput() throws Exception {
		mvc.perform(put("/api/customer/favorites/987654321").with(me()).with(csrf()))
				.andExpect(status().isNotFound());
		mvc.perform(put("/api/customer/favorites/not-a-number").with(me()).with(csrf()))
				.andExpect(status().isBadRequest());
		for (String query : new String[] {"size=0", "size=101", "page=-1", "page=10001"}) {
			mvc.perform(get("/api/customer/favorites?" + query).with(me())).andExpect(status().isBadRequest());
		}
		assertThat(saved(customer)).isZero();
	}

	@Test
	void favoritesDisappearWithTheTruck() throws Exception {
		mvc.perform(put("/api/customer/favorites/" + tacos).with(me()).with(csrf()))
				.andExpect(status().isNoContent());
		jdbc.update("DELETE FROM vendors WHERE id=?", tacos);
		assertThat(saved(customer)).isZero();
	}
}
