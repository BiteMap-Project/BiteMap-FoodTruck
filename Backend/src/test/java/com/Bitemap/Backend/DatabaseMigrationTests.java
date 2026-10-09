package com.Bitemap.Backend;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import javax.sql.DataSource;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.FlywayException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.NullAndEmptySource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringBootTest
class DatabaseMigrationTests {

	@Autowired
	private DataSource dataSource;

	@Autowired
	private Flyway applicationFlyway;

	private JdbcTemplate jdbc;
	private String schema;

	@BeforeEach
	void createIsolatedSchema() {
		jdbc = new JdbcTemplate(dataSource);
		schema = "migration_test_" + UUID.randomUUID().toString().replace("-", "");
		jdbc.execute("CREATE SCHEMA " + schema);
	}

	@AfterEach
	void removeIsolatedSchema() {
		// Only drop the unique test schema, never public or the configured database.
		if (schema != null && schema.matches("migration_test_[a-f0-9]{32}")) {
			jdbc.execute("DROP SCHEMA " + schema + " CASCADE");
		}
	}

	@Test
	void defaultConfigurationExcludesDevelopmentFixtures() {
		assertThat(applicationFlyway.getConfiguration().getLocations())
				.extracting(location -> location.getDescriptor())
				.containsExactly("classpath:db/migration");
	}

	@Test
	void freshDatabaseHasValidSchemaWithoutSampleData() {
		Flyway flyway = migrations(false);
		migrateAndValidate(flyway);
		assertThat(vendorCount()).isZero();
		assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema
				+ ".vendor_stops", Integer.class)).isZero();
		assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema
				+ ".operators", Integer.class)).isZero();
		assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema
				+ ".vendor_menu_items", Integer.class)).isZero();
		assertThat(jdbc.queryForObject("INSERT INTO " + schema
				+ ".vendors (name, category, location) VALUES ('Test Vendor', 'Soup', 'CSUN') RETURNING id",
				Long.class)).isPositive();
		assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema
				+ ".vendors WHERE created_at IS NOT NULL", Integer.class)).isEqualTo(1);
		assertThatThrownBy(() -> jdbc.update("INSERT INTO " + schema
				+ ".vendors (name, category, location) VALUES (' ', 'Soup', 'CSUN')"))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void operatorsOwnMultipleVendorsAndEmailsAreCaseInsensitive() {
		Flyway.configure().configuration(migrations(false).getConfiguration()).target("7").load().migrate();
		Long operatorId = jdbc.queryForObject("INSERT INTO " + schema
				+ ".operators (display_name, email, password_hash) "
				+ "VALUES ('Test Operator', 'owner@example.com', '$2a$10$example') RETURNING id",
				Long.class);

		jdbc.update("INSERT INTO " + schema
				+ ".vendors (operator_id, name, category, location) VALUES (?, 'Truck One', 'Tacos', 'CSUN')",
				operatorId);
		jdbc.update("INSERT INTO " + schema
				+ ".vendors (operator_id, name, category, location) VALUES (?, 'Truck Two', 'Coffee', 'Northridge')",
				operatorId);

		assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema
				+ ".vendors WHERE operator_id = ?", Integer.class, operatorId)).isEqualTo(2);
		assertThatThrownBy(() -> jdbc.update("INSERT INTO " + schema
				+ ".operators (display_name, email, password_hash) "
				+ "VALUES ('Duplicate', 'OWNER@EXAMPLE.COM', '$2a$10$other')"))
				.isInstanceOf(DataIntegrityViolationException.class);
		assertThatThrownBy(() -> jdbc.update("INSERT INTO " + schema
				+ ".vendors (operator_id, name, category, location) "
				+ "VALUES (999999, 'Orphan Truck', 'Soup', 'CSUN')"))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void operatorMigrationPreservesExistingUnassignedVendors() {
		Flyway.configure().configuration(migrations(false).getConfiguration())
				.target("4").load().migrate();
		Long vendorId = jdbc.queryForObject("INSERT INTO " + schema
				+ ".vendors (name, category, location) "
				+ "VALUES ('Existing Vendor', 'Soup', 'CSUN') RETURNING id", Long.class);

		migrateAndValidate(migrations(false));

		assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema
				+ ".vendors WHERE id = ? AND operator_id IS NULL", Integer.class, vendorId)).isEqualTo(1);
	}

	@Test
	void developmentFixturesDoNotDuplicateOrOverwriteDataOnRestart() {
		Flyway flyway = migrations(true);
		migrateAndValidate(flyway);
		assertThat(jdbc.queryForList("SELECT id FROM " + schema + ".vendors", Long.class))
				.contains(-1L, -2L, -3L, -4L, -5L, -6L, -7L, -8L);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema
				+ ".vendor_menu_items", Integer.class)).isEqualTo(24);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema
				+ ".vendor_menu_items WHERE description IS NOT NULL", Integer.class)).isGreaterThanOrEqualTo(20);
		jdbc.update("UPDATE " + schema + ".vendors SET name = 'Edited locally' WHERE id = -1");
		jdbc.update("UPDATE " + schema + ".vendor_menu_items SET name = 'Edited item' WHERE id = -101");
		var vendorsBeforeRestart = jdbc.queryForList("SELECT * FROM " + schema + ".vendors ORDER BY id");
		var menuBeforeRestart = jdbc.queryForList("SELECT * FROM " + schema + ".vendor_menu_items ORDER BY id");

		assertThat(flyway.migrate().migrationsExecuted).isZero();
		assertThat(jdbc.queryForList("SELECT * FROM " + schema + ".vendors ORDER BY id"))
				.isEqualTo(vendorsBeforeRestart);
		assertThat(jdbc.queryForList("SELECT * FROM " + schema + ".vendor_menu_items ORDER BY id"))
				.isEqualTo(menuBeforeRestart);
		assertThat(jdbc.queryForObject("SELECT name FROM " + schema + ".vendors WHERE id = -1",
				String.class)).isEqualTo("Edited locally");
		assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
	}

	@Test
	void developmentFixturesCanBeAddedWithoutLosingExistingVendors() {
		migrateAndValidate(migrations(false));
		Long existingId = jdbc.queryForObject("INSERT INTO " + schema
				+ ".vendors (name, category, location) VALUES ('Existing Vendor', 'Coffee', 'CSUN') RETURNING id",
				Long.class);

		migrateAndValidate(migrations(true));
		assertThat(jdbc.queryForList("SELECT id FROM " + schema + ".vendors", Long.class))
				.contains(existingId, -1L, -2L, -3L, -4L, -5L, -6L, -7L, -8L);
		assertThat(jdbc.queryForObject("SELECT name FROM " + schema + ".vendors WHERE id = ?",
				String.class, existingId)).isEqualTo("Existing Vendor");
		assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema
				+ ".vendor_menu_items", Integer.class)).isEqualTo(24);
	}

	@ParameterizedTest
	@NullAndEmptySource
	@ValueSource(strings = { " ", "\t", "\n", "\r", "\f", "\u000B", " \t\r\n" })
	void requiredFieldsRejectBlankValuesOnInsertAndUpdate(String blank) {
		migrateAndValidate(migrations(false));
		Long id = jdbc.queryForObject("INSERT INTO " + schema
				+ ".vendors (name, category, location) VALUES ('Valid Vendor', 'Coffee', 'CSUN') RETURNING id",
				Long.class);
		for (String column : new String[] { "name", "category", "location" }) {
			Object name = column.equals("name") ? blank : "Valid Vendor";
			Object category = column.equals("category") ? blank : "Coffee";
			Object location = column.equals("location") ? blank : "CSUN";
			assertThatThrownBy(() -> jdbc.update("INSERT INTO " + schema
					+ ".vendors (name, category, location) VALUES (?, ?, ?)", name, category, location))
					.as("insert rejects blank %s", column)
					.isInstanceOf(DataIntegrityViolationException.class);
			// Column identifiers come only from the fixed list above, never user input.
			assertThatThrownBy(() -> jdbc.update("UPDATE " + schema + ".vendors SET " + column
					+ " = ? WHERE id = ?", blank, id))
					.as("update rejects blank %s", column)
					.isInstanceOf(DataIntegrityViolationException.class);
		}
		assertThat(vendorCount()).isEqualTo(1);
		assertThat(jdbc.queryForObject("SELECT name FROM " + schema + ".vendors WHERE id = ?",
				String.class, id)).isEqualTo("Valid Vendor");
	}

	@Test
	void upgradeFromV1PreservesExistingVendorData() {
		Flyway.configure().configuration(migrations(false).getConfiguration())
				.target("1").load().migrate();
		jdbc.update("INSERT INTO " + schema
				+ ".vendors (name, category, location) VALUES (?, ?, ?)",
				"Café on Wheels", "Coffee & Tea", "CSUN Student Union");
		var vendorsBeforeUpgrade = vendorBusinessRows();

		migrateAndValidate(migrations(false));
		assertThat(vendorBusinessRows()).isEqualTo(vendorsBeforeUpgrade);
		assertThatThrownBy(() -> jdbc.update("UPDATE " + schema + ".vendors SET name = ?", "\t"))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

	@Test
	void upgradeRejectsInvalidExistingDataWithoutChangingItAndCanBeRetried() {
		Flyway.configure().configuration(migrations(false).getConfiguration())
				.target("1").load().migrate();
		Long id = jdbc.queryForObject("INSERT INTO " + schema
				+ ".vendors (name, category, location) VALUES (?, 'Coffee', 'CSUN') RETURNING id",
				Long.class, "\t");
		Flyway flyway = migrations(false);

		assertThatThrownBy(flyway::migrate).isInstanceOf(FlywayException.class);
		assertThat(flyway.info().current().getVersion().getVersion()).isEqualTo("1");
		assertThat(jdbc.queryForObject("SELECT name FROM " + schema + ".vendors WHERE id = ?",
				String.class, id)).isEqualTo("\t");

		jdbc.update("UPDATE " + schema + ".vendors SET name = ? WHERE id = ?", "Corrected Vendor", id);
		migrateAndValidate(flyway);
		assertThat(vendorCount()).isEqualTo(1);
	}

	private void migrateAndValidate(Flyway flyway) {
		assertThat(flyway.migrate().success).isTrue();
		assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
		assertThat(flyway.info().pending()).isEmpty();
	}

	@Test
	void upgradeFromV2PreservesVendorsAndCreatesEmptyStops() {
		Flyway.configure().configuration(migrations(false).getConfiguration())
				.target("2").load().migrate();
		jdbc.update("INSERT INTO " + schema
				+ ".vendors (name, category, location) VALUES ('Existing Vendor', 'Soup', 'Original location')");
		var before = vendorBusinessRows();
		migrateAndValidate(migrations(false));
		assertThat(vendorBusinessRows()).isEqualTo(before);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + ".vendor_stops", Integer.class)).isZero();
		assertThat(migrations(false).migrate().migrationsExecuted).isZero();
	}

	@Test
	void menuMigrationPreservesVendorsAndStops() {
		Flyway.configure().configuration(migrations(false).getConfiguration())
				.target("3").load().migrate();
		Long id = jdbc.queryForObject("INSERT INTO " + schema
				+ ".vendors (name, category, location) VALUES ('Existing Vendor', 'Soup', 'CSUN') RETURNING id", Long.class);
		jdbc.update("INSERT INTO " + schema + ".vendor_stops (vendor_id, venue_name, address, latitude, longitude, starts_at, ends_at, time_zone) "
				+ "VALUES (?, 'Test venue', 'Test address', 34, -118, '2026-09-28T10:00:00Z', '2026-09-28T12:00:00Z', 'UTC')", id);
		var vendors = vendorBusinessRows();
		var stops = jdbc.queryForList("SELECT * FROM " + schema + ".vendor_stops ORDER BY id");
		// V7 adds only a zero-initialized version; all pre-existing stop fields must remain identical.
		stops.forEach(stop -> stop.put("version", 0L));
		migrateAndValidate(migrations(false));
		assertThat(vendorBusinessRows()).isEqualTo(vendors);
		assertThat(jdbc.queryForList("SELECT * FROM " + schema + ".vendor_stops ORDER BY id")).isEqualTo(stops);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + ".vendor_menu_items", Integer.class)).isZero();
		assertThat(migrations(false).migrate().migrationsExecuted).isZero();
	}

	@Test
	void developmentSchedulesRefreshOnlyReservedRows() {
		Flyway flyway = migrations(true);
		migrateAndValidate(flyway);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema
				+ ".vendor_stops", Integer.class)).isEqualTo(6);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema
				+ ".vendor_stops WHERE status = 'serving' AND starts_at < CURRENT_TIMESTAMP"
				+ " AND ends_at > CURRENT_TIMESTAMP AND last_confirmed_at IS NOT NULL", Integer.class)).isEqualTo(1);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema
				+ ".vendor_stops WHERE status = 'scheduled' AND starts_at > CURRENT_TIMESTAMP", Integer.class)).isEqualTo(3);
		Long customId = jdbc.queryForObject("INSERT INTO " + schema
				+ ".vendor_stops (vendor_id, venue_name, address, latitude, longitude, starts_at, ends_at, time_zone)"
				+ " VALUES (-1, 'My custom stop', 'Custom address', 34, -118, CURRENT_TIMESTAMP,"
				+ " CURRENT_TIMESTAMP + INTERVAL '1 hour', 'UTC') RETURNING id", Long.class);
		var customBefore = jdbc.queryForMap("SELECT * FROM " + schema + ".vendor_stops WHERE id = ?", customId);
		jdbc.update("UPDATE " + schema + ".vendor_stops SET starts_at = starts_at - INTERVAL '30 days',"
				+ " ends_at = ends_at - INTERVAL '30 days', status = 'ended' WHERE id = -201");
		migrateAndValidate(migrations(true));
		assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + ".vendor_stops", Integer.class)).isEqualTo(7);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema
				+ ".vendor_stops WHERE id = -201 AND status = 'serving' AND ends_at > CURRENT_TIMESTAMP", Integer.class)).isEqualTo(1);
		assertThat(jdbc.queryForMap("SELECT * FROM " + schema + ".vendor_stops WHERE id = ?", customId)).isEqualTo(customBefore);
	}

	@Test
	void menuStateUpgradePreservesLegacyDataAndDerivesAvailability() {
		Flyway.configure().configuration(migrations(false).getConfiguration()).target("5").load().migrate();
		long vendor = jdbc.queryForObject("INSERT INTO " + schema + ".vendors(name,category,location) VALUES ('Test','Food','CSUN') RETURNING id", Long.class);
		jdbc.update("INSERT INTO " + schema + ".vendor_menu_items(vendor_id,name,description,price,available) VALUES (?, 'Old active','Keep me',5.25,TRUE), (?, 'Old unavailable',NULL,0,FALSE)", vendor, vendor);
		var before = jdbc.queryForList("SELECT id,vendor_id,name,description,price,available FROM " + schema + ".vendor_menu_items ORDER BY id");
		migrateAndValidate(migrations(false));
		assertThat(jdbc.queryForList("SELECT id,vendor_id,name,description,price,available FROM " + schema + ".vendor_menu_items ORDER BY id")).isEqualTo(before);
		assertThat(jdbc.queryForList("SELECT availability_status FROM " + schema + ".vendor_menu_items ORDER BY id", String.class)).containsExactly("ACTIVE", "INACTIVE");
		jdbc.update("UPDATE " + schema + ".vendor_menu_items SET availability_status = 'SOLD_OUT'");
		assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + ".vendor_menu_items WHERE available", Integer.class)).isZero();
		assertThatThrownBy(() -> jdbc.update("UPDATE " + schema + ".vendor_menu_items SET availability_status = 'INVALID'"))
				.isInstanceOf(DataIntegrityViolationException.class);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + ".vendor_menu_items WHERE version = 0", Integer.class)).isEqualTo(2);
	}

	@Test
	void scheduleVersionUpgradePreservesEveryExistingField() {
		Flyway.configure().configuration(migrations(false).getConfiguration()).target("6").load().migrate();
		long vendor = jdbc.queryForObject("INSERT INTO " + schema + ".vendors(name,category,location) VALUES ('Test','Food','CSUN') RETURNING id", Long.class);
		jdbc.update("INSERT INTO " + schema + ".vendor_stops(vendor_id,venue_name,address,latitude,longitude,starts_at,ends_at,time_zone,status)"
				+ " VALUES (?, 'Keep venue','Keep address',34,-118,'2030-01-02T00:00:00Z','2030-01-02T02:00:00Z','UTC','cancelled')", vendor);
		var before = jdbc.queryForMap("SELECT * FROM " + schema + ".vendor_stops");
		migrateAndValidate(migrations(false));
		var after = jdbc.queryForMap("SELECT * FROM " + schema + ".vendor_stops");
		assertThat(after.remove("version")).isEqualTo(0L);
		assertThat(after).isEqualTo(before);
		assertThatThrownBy(() -> jdbc.update("UPDATE " + schema + ".vendor_stops SET version=-1"))
				.isInstanceOf(DataIntegrityViolationException.class);
	}

    @Test
    void identityUpgradePreservesHashesIdsOwnershipAndDisabledState() {
        Flyway.configure().configuration(migrations(false).getConfiguration()).target("7").load().migrate();
        long owner = jdbc.queryForObject("INSERT INTO " + schema
                + ".operators(display_name,email,password_hash) VALUES ('Owner','owner@example.com','{pbkdf2-sha256-600k}unchanged') RETURNING id", Long.class);
        long disabled = jdbc.queryForObject("INSERT INTO " + schema
                + ".operators(display_name,email,password_hash,enabled) VALUES ('Disabled','disabled@example.com','unchanged-too',FALSE) RETURNING id", Long.class);
        jdbc.update("INSERT INTO " + schema + ".vendors(name,category,location,operator_id) VALUES ('Keep truck','Food','CSUN',?)", owner);
        var oldAccounts = jdbc.queryForList("SELECT id,display_name,email,password_hash,enabled,created_at,updated_at FROM " + schema + ".operators ORDER BY id");
        var oldVendors = jdbc.queryForList("SELECT * FROM " + schema + ".vendors");
        migrateAndValidate(migrations(false));
        assertThat(jdbc.queryForList("SELECT id,display_name,email,password_hash,enabled,created_at,updated_at FROM " + schema + ".app_users ORDER BY id")).isEqualTo(oldAccounts);
        assertThat(jdbc.queryForList("SELECT * FROM " + schema + ".vendors")).isEqualTo(oldVendors);
        assertThat(jdbc.queryForObject("SELECT user_id FROM " + schema + ".operators WHERE id=?", Long.class, owner)).isEqualTo(owner);
        assertThat(jdbc.queryForObject("SELECT enabled FROM " + schema + ".app_users WHERE id=?", Boolean.class, disabled)).isFalse();
        assertThat(jdbc.queryForList("SELECT role FROM " + schema + ".app_user_roles WHERE user_id=? ORDER BY role", String.class, owner))
                .containsExactly("CUSTOMER", "OPERATOR");
        long customer = jdbc.queryForObject("INSERT INTO " + schema + ".app_users(display_name,email,password_hash) VALUES ('New','new@example.com','new-hash') RETURNING id", Long.class);
        assertThat(customer).isGreaterThan(disabled);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO " + schema + ".app_users(display_name,email,password_hash) VALUES ('Dup','OWNER@EXAMPLE.COM','hash')"))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThatThrownBy(() -> jdbc.update("INSERT INTO " + schema + ".app_user_roles(user_id,role) VALUES (?, 'ADMIN')", customer))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(migrations(false).migrate().migrationsExecuted).isZero();
    }

	private Flyway migrations(boolean development) {
		String[] locations = development
				? new String[] { "classpath:db/migration", "classpath:db/dev" }
				: new String[] { "classpath:db/migration" };
		return Flyway.configure().dataSource(dataSource).schemas(schema).defaultSchema(schema)
				.locations(locations).cleanDisabled(true).validateMigrationNaming(true).load();
	}

	private int vendorCount() {
		return jdbc.queryForObject("SELECT count(*) FROM " + schema + ".vendors", Integer.class);
	}

	private List<Map<String, Object>> vendorBusinessRows() {
		return jdbc.queryForList("SELECT id, name, category, location, created_at FROM "
				+ schema + ".vendors ORDER BY id");
	}
}
