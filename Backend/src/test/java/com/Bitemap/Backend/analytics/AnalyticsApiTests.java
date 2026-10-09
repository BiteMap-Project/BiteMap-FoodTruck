package com.Bitemap.Backend.analytics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AnalyticsApiTests {
	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;
	private long owner;

	@BeforeEach
	void requireEmptyTestDatabase() {
		assertThat(jdbc.queryForObject("SELECT count(*) FROM vendors", Integer.class)).isZero();
        owner = com.Bitemap.Backend.TestAccounts.operator(jdbc, "Test", "owner@example.com", "unused");
	}

	@Test
	void returnsPerTruckMetricsAndTotalsWithoutOperatorData() throws Exception {
		Long vendor = insertVendor("Analytics Tacos", "Tacos", "Northridge");
		insertMenu(vendor, "One", new BigDecimal("10.00"), "ACTIVE");
		insertMenu(vendor, "Two", new BigDecimal("10.00"), "INACTIVE");
		insertStop(vendor, Instant.now().plusSeconds(3600), Instant.now().plusSeconds(7200));

		mvc.perform(get("/api/operator/analytics/trucks").with(com.Bitemap.Backend.TestAccounts.user("owner@example.com").roles("OPERATOR")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.totalTrucks").value(1))
				.andExpect(jsonPath("$.totalMenuItems").value(2))
				.andExpect(jsonPath("$.availableMenuItems").value(1))
				.andExpect(jsonPath("$.upcomingStops").value(1))
				.andExpect(jsonPath("$.trucks[0].name").value("Analytics Tacos"))
				.andExpect(jsonPath("$.trucks[0].averageMenuPrice").value(10.0))
				.andExpect(jsonPath("$.trucks[0].nextStopAt").exists())
				.andExpect(jsonPath("$.trucks[0].email").doesNotExist())
				.andExpect(jsonPath("$.trucks[0].passwordHash").doesNotExist());
	}

	@Test
	void includesTrucksWithoutMenuItemsOrStops() throws Exception {
		insertVendor("Empty Truck", "Snacks", "CSUN");
		mvc.perform(get("/api/operator/analytics/trucks").with(com.Bitemap.Backend.TestAccounts.user("owner@example.com").roles("OPERATOR")))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.trucks[0].menuItemCount").value(0))
				.andExpect(jsonPath("$.trucks[0].averageMenuPrice").doesNotExist())
				.andExpect(jsonPath("$.trucks[0].totalStopCount").value(0))
				.andExpect(jsonPath("$.trucks[0].nextStopAt").doesNotExist());
	}

    @Test
    void excludesOtherOwnersAndUnownedDemoDataEvenWithForgedOwnerParameter() throws Exception {
        Long mine = insertVendor("Mine", "Food", "CSUN");
        insertMenu(mine, "A", new BigDecimal("10"), "ACTIVE");
        insertMenu(mine, "B", new BigDecimal("10"), "ACTIVE");
        insertMenu(mine, "C", new BigDecimal("4"), "SOLD_OUT");
        insertStop(mine, Instant.now().plusSeconds(100), Instant.now().plusSeconds(1000));
        insertStop(mine, Instant.now().plusSeconds(200), Instant.now().plusSeconds(2000));
        long other = com.Bitemap.Backend.TestAccounts.operator(jdbc, "Other", "other@example.com", "unused");
        long foreign = jdbc.queryForObject("INSERT INTO vendors(name,category,location,operator_id) VALUES ('Other truck','Food','CSUN',?) RETURNING id", Long.class, other);
        insertMenu(foreign, "Private item", new BigDecimal("99"), "ACTIVE");
        jdbc.update("INSERT INTO vendors(name,category,location) VALUES ('Unowned','Food','CSUN')");
        mvc.perform(get("/api/operator/analytics/trucks").with(com.Bitemap.Backend.TestAccounts.user("owner@example.com").roles("OPERATOR"))
                .param("operatorId", String.valueOf(other))).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.totalTrucks").value(1)).andExpect(jsonPath("$.totalMenuItems").value(3))
                .andExpect(jsonPath("$.availableMenuItems").value(2)).andExpect(jsonPath("$.upcomingStops").value(2))
                .andExpect(jsonPath("$.trucks[0].name").value("Mine"))
                .andExpect(jsonPath("$.trucks[0].averageMenuPrice").value(8.0));
        mvc.perform(get("/api/operator/analytics/trucks").with(com.Bitemap.Backend.TestAccounts.user("other@example.com").roles("OPERATOR")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.trucks[0].name").value("Other truck"))
                .andExpect(jsonPath("$.totalTrucks").value(1));
    }

    @Test
    void requiresActiveOperatorAndDoesNotKeepOldPublicEndpoint() throws Exception {
        mvc.perform(get("/api/operator/analytics/trucks")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/analytics/trucks")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/analytics/trucks").with(com.Bitemap.Backend.TestAccounts.user("owner@example.com").roles("OPERATOR")))
                .andExpect(status().isNotFound());
        mvc.perform(get("/api/operator/analytics/trucks").with(com.Bitemap.Backend.TestAccounts.user("owner@example.com").roles("CUSTOMER")))
                .andExpect(status().isForbidden());
        jdbc.update("UPDATE operators SET enabled = FALSE WHERE id = ?", owner);
        mvc.perform(get("/api/operator/analytics/trucks").with(com.Bitemap.Backend.TestAccounts.user("owner@example.com").roles("OPERATOR")))
                .andExpect(status().isForbidden());
        mvc.perform(get("/api/operator/analytics/trucks").with(com.Bitemap.Backend.TestAccounts.user("missing@example.com").roles("OPERATOR")))
                .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/vendors")).andExpect(status().isOk());
    }

    @Test
    void newAccountHasNoBorrowedDemoMetrics() throws Exception {
        jdbc.update("INSERT INTO vendors(name,category,location) VALUES ('Demo','Food','CSUN')");
        mvc.perform(get("/api/operator/analytics/trucks").with(com.Bitemap.Backend.TestAccounts.user("owner@example.com").roles("OPERATOR")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalTrucks").value(0))
                .andExpect(jsonPath("$.totalMenuItems").value(0)).andExpect(jsonPath("$.trucks").isEmpty());
    }

	private Long insertVendor(String name, String category, String location) {
		return jdbc.queryForObject("INSERT INTO vendors (name, category, location, operator_id) VALUES (?, ?, ?, ?) RETURNING id",
				Long.class, name, category, location, owner);
	}

	private void insertMenu(long vendor, String name, BigDecimal price, String status) {
		jdbc.update("INSERT INTO vendor_menu_items (vendor_id, name, price, availability_status) VALUES (?, ?, ?, ?)",
				vendor, name, price, status);
	}

	private void insertStop(long vendor, Instant startsAt, Instant endsAt) {
		jdbc.update("""
				INSERT INTO vendor_stops
				(vendor_id, venue_name, address, latitude, longitude, starts_at, ends_at, time_zone, status)
				VALUES (?, 'CSUN', '18111 Nordhoff St', 34.24, -118.53, ?, ?, 'America/Los_Angeles', 'scheduled')
				""", vendor, Timestamp.from(startsAt), Timestamp.from(endsAt));
	}
}
