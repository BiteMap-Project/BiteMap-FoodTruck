package com.Bitemap.Backend;

import java.util.UUID;

import javax.sql.DataSource;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
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
		assertThat(flyway.migrate().migrationsExecuted).isEqualTo(1);
		assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
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
		assertThat(flyway.migrate().migrationsExecuted).isEqualTo(2);
		assertThat(vendorCount()).isEqualTo(3);
		jdbc.update("UPDATE " + schema + ".vendors SET name = 'Edited locally' WHERE id = -1");

		assertThat(flyway.migrate().migrationsExecuted).isZero();
		assertThat(vendorCount()).isEqualTo(3);
		assertThat(jdbc.queryForObject("SELECT name FROM " + schema + ".vendors WHERE id = -1",
				String.class)).isEqualTo("Edited locally");
		assertThat(flyway.validateWithResult().validationSuccessful).isTrue();
	}

	@Test
	void developmentFixturesCanBeAddedWithoutLosingExistingVendors() {
		migrations(false).migrate();
		Long existingId = jdbc.queryForObject("INSERT INTO " + schema
				+ ".vendors (name, category, location) VALUES ('Existing Vendor', 'Coffee', 'CSUN') RETURNING id",
				Long.class);

		assertThat(migrations(true).migrate().migrationsExecuted).isEqualTo(1);
		assertThat(vendorCount()).isEqualTo(4);
		assertThat(jdbc.queryForObject("SELECT name FROM " + schema + ".vendors WHERE id = ?",
				String.class, existingId)).isEqualTo("Existing Vendor");
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
