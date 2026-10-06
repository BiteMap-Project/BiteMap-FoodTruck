package com.Bitemap.Backend.analytics;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
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

	@BeforeEach
	void requireEmptyTestDatabase() {
		assertThat(jdbc.queryForObject("SELECT count(*) FROM vendors", Integer.class)).isZero();
	}

	@Test
	void returnsPerTruckMetricsAndTotalsWithoutOperatorData() throws Exception {
		Long vendor = insertVendor("Analytics Tacos", "Tacos", "Northridge");
		insertMenu(vendor, "One", new BigDecimal("10.00"), "ACTIVE");
		insertMenu(vendor, "Two", new BigDecimal("10.00"), "INACTIVE");
		insertStop(vendor, Instant.now().plusSeconds(3600), Instant.now().plusSeconds(7200));

		mvc.perform(get("/api/analytics/trucks"))
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
		mvc.perform(get("/api/analytics/trucks"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.trucks[0].menuItemCount").value(0))
				.andExpect(jsonPath("$.trucks[0].averageMenuPrice").doesNotExist())
				.andExpect(jsonPath("$.trucks[0].totalStopCount").value(0))
				.andExpect(jsonPath("$.trucks[0].nextStopAt").doesNotExist());
	}

	private Long insertVendor(String name, String category, String location) {
		return jdbc.queryForObject("INSERT INTO vendors (name, category, location) VALUES (?, ?, ?) RETURNING id",
				Long.class, name, category, location);
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
