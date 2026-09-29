package com.Bitemap.Backend;

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
	void developmentFixturesDoNotDuplicateOrOverwriteDataOnRestart() {
		Flyway flyway = migrations(true);
		migrateAndValidate(flyway);
		assertThat(jdbc.queryForList("SELECT id FROM " + schema + ".vendors", Long.class))
				.contains(-1L, -2L, -3L);
		jdbc.update("UPDATE " + schema + ".vendors SET name = 'Edited locally' WHERE id = -1");
		var vendorsBeforeRestart = jdbc.queryForList("SELECT * FROM " + schema + ".vendors ORDER BY id");

		assertThat(flyway.migrate().migrationsExecuted).isZero();
		assertThat(jdbc.queryForList("SELECT * FROM " + schema + ".vendors ORDER BY id"))
				.isEqualTo(vendorsBeforeRestart);
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
				.contains(existingId, -1L, -2L, -3L);
		assertThat(jdbc.queryForObject("SELECT name FROM " + schema + ".vendors WHERE id = ?",
				String.class, existingId)).isEqualTo("Existing Vendor");
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
		var vendorsBeforeUpgrade = jdbc.queryForList("SELECT * FROM " + schema + ".vendors ORDER BY id");

		migrateAndValidate(migrations(false));
		assertThat(jdbc.queryForList("SELECT * FROM " + schema + ".vendors ORDER BY id"))
				.isEqualTo(vendorsBeforeUpgrade);
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
		var before = jdbc.queryForList("SELECT * FROM " + schema + ".vendors ORDER BY id");
		migrateAndValidate(migrations(false));
		assertThat(jdbc.queryForList("SELECT * FROM " + schema + ".vendors ORDER BY id")).isEqualTo(before);
		assertThat(jdbc.queryForObject("SELECT count(*) FROM " + schema + ".vendor_stops", Integer.class)).isZero();
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
}
