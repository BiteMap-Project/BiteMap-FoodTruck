package com.Bitemap.Backend.menu;

import jakarta.persistence.EntityManager;
import jakarta.persistence.EntityManagerFactory;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import org.hibernate.SessionFactory;
import org.hibernate.resource.jdbc.spi.StatementInspector;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest(properties = {
        "spring.jpa.properties.hibernate.generate_statistics=true",
        "spring.jpa.properties.hibernate.session_factory.statement_inspector=com.Bitemap.Backend.menu.MenuReadTests$SqlCapture"
})
@Transactional
class MenuReadTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired MenuService service;
    @Autowired EntityManager em;
    @Autowired EntityManagerFactory emf;
    private long vendor;
    private static final String EMAIL = "metadata-owner@example.test";

    public static class SqlCapture implements StatementInspector {
        private static final ThreadLocal<List<String>> QUERIES = ThreadLocal.withInitial(ArrayList::new);
        @Override public String inspect(String sql) { QUERIES.get().add(sql); return sql; }
    }

    @BeforeEach void seed() {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM operators", Integer.class)).as("Use isolated PostgreSQL").isZero();
        long owner = com.Bitemap.Backend.TestAccounts.operator(jdbc, "Metadata Owner", EMAIL, "unused");
        vendor = jdbc.queryForObject("INSERT INTO vendors(name,category,location,operator_id) VALUES ('Metadata Truck','Food','CSUN',?) RETURNING id", Long.class, owner);
        resetMeasurements();
    }
    @AfterEach void clearCapture() { SqlCapture.QUERIES.remove(); }
    private void resetMeasurements() {
        em.clear();
        emf.unwrap(SessionFactory.class).getStatistics().clear();
        SqlCapture.QUERIES.get().clear();
    }
    private long item(String name, byte[] photo) {
        return jdbc.queryForObject("""
                INSERT INTO vendor_menu_items(vendor_id,name,description,price,image_data,image_media_type)
                VALUES (?,?,'Description',4.50,?,?) RETURNING id
                """, Long.class, vendor, name, photo, photo == null ? null : "image/jpeg");
    }
    private void assertMetadataOnly(int maximumQueries) {
        var queries = SqlCapture.QUERIES.get();
        assertThat(queries).isNotEmpty().hasSizeLessThanOrEqualTo(maximumQueries);
        // Null checks are allowed; selecting the bytea value or image MIME is not.
        for (String sql : queries) {
            String withoutPresenceCheck = sql.toLowerCase(java.util.Locale.ROOT)
                    .replaceAll("[a-z0-9_]+\\.image_data\\s+is\\s+not\\s+null", "has_photo");
            assertThat(withoutPresenceCheck).doesNotContain("image_data", "image_media_type");
        }
        assertThat(emf.unwrap(SessionFactory.class).getStatistics().getEntityLoadCount()).isZero();
    }

    @Test void listFetchesOnlyMetadataWithStablePaginationAndMixedPhotos() {
        long first = item("Same", new byte[] {1, 2});
        long second = item("Same", null);
        long third = item("Zed", null);
        var page = service.list(EMAIL, vendor, 0, 2);
        assertThat(page.totalElements()).isEqualTo(3);
        assertThat(page.totalPages()).isEqualTo(2);
        assertThat(page.items()).extracting(MenuItemResponse::id).containsExactly(first, second);
        assertThat(page.items()).extracting(MenuItemResponse::hasCustomImage).containsExactly(true, false);
        assertThat(page.items().getFirst().price()).isEqualByComparingTo("4.50");
        assertThat(page.items().getFirst().description()).isEqualTo("Description");
        assertThat(page.items().getFirst().imagePreset()).isEqualTo(MenuImagePreset.GENERIC);
        assertMetadataOnly(3);
        resetMeasurements();
        assertThat(service.list(EMAIL, vendor, 1, 2).items()).extracting(MenuItemResponse::id).containsExactly(third);
        assertMetadataOnly(3);
    }

    @Test void singleReadFetchesOnlyMetadataAndPreservesOwnershipBoundary() {
        long id = item("Photo", new byte[] {1, 2});
        assertThat(service.get(EMAIL, vendor, id).hasCustomImage()).isTrue();
        assertMetadataOnly(2);
        assertThatThrownBy(() -> service.get("unrelated@example.test", vendor, id)).isInstanceOf(MenuNotFoundException.class);
        assertThatThrownBy(() -> service.get(EMAIL, vendor, Long.MAX_VALUE)).isInstanceOf(MenuNotFoundException.class);
    }

    @Test void photoHeavyPageAvoidsMaterializingTheLegacyImagePayload() {
        byte[] photo = new byte[64 * 1024];
        new Random(42).nextBytes(photo); // Incompressible synthetic DB fixture, not an upload fixture.
        for (int i = 0; i < 101; i++) item("Dish %03d".formatted(i), photo);
        var legacy = em.createQuery("select m from MenuItem m where m.vendorId=:vendor order by m.name,m.id", MenuItem.class)
                .setParameter("vendor", vendor).setMaxResults(100).getResultList();
        long legacyBytes = legacy.stream().mapToLong(i -> i.getImageData().length).sum();
        assertThat(legacyBytes).isEqualTo(6_553_600);
        var expected = legacy.stream().map(MenuItemResponse::from).toList();
        resetMeasurements();
        var page = service.list(EMAIL, vendor, 0, 100);
        assertThat(page.items()).isEqualTo(expected);
        assertThat(page.totalElements()).isEqualTo(101);
        assertMetadataOnly(3);
        System.out.println("Photo-heavy menu: legacy image bytes materialized=" + legacyBytes
                + ", metadata-only image bytes materialized=0; identical 100-item response");
    }
}
