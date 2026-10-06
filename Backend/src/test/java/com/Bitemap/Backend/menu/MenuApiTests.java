package com.Bitemap.Backend.menu;

import java.math.BigDecimal;
import java.util.Map;
import jakarta.persistence.EntityManagerFactory;
import org.hibernate.SessionFactory;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest(properties = "spring.jpa.properties.hibernate.generate_statistics=true")
@AutoConfigureMockMvc
@Transactional
class MenuApiTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired MenuService service;
    @Autowired ObjectMapper json;
    @Autowired EntityManagerFactory emf;
    long owner, vendor, foreign, sibling;
    static final String EMAIL = "menu-owner@example.com";
    static final String CREATE = "{\"name\":\" Taco \",\"description\":\" Fresh \",\"price\":4.50,\"status\":\"ACTIVE\"}";

    @BeforeEach
    void seed() {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM operators", Integer.class)).as("Use isolated test DB").isZero();
        owner = account(EMAIL);
        vendor = vendor(owner);
        sibling = vendor(owner);
        foreign = vendor(account("other-menu-owner@example.com"));
    }

    @Test
    void createListReadEditAndStatusPreservePublicContract() throws Exception {
        var result = mvc.perform(post(root(vendor)).with(user(EMAIL).roles("OPERATOR")).with(csrf())
                .contentType("application/json").content(CREATE)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.name").value("Taco")).andExpect(jsonPath("$.description").value("Fresh"))
                .andExpect(jsonPath("$.version").value(0)).andExpect(header().string("Cache-Control", "no-store")).andReturn();
        long item = json.readTree(result.getResponse().getContentAsString()).get("id").asLong();
        assertThat(result.getResponse().getHeader("Location")).isEqualTo(root(vendor) + "/" + item);
        mvc.perform(get(root(vendor)).with(user(EMAIL).roles("OPERATOR"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(put(root(vendor) + "/" + item).with(user(EMAIL).roles("OPERATOR")).with(csrf())
                .contentType("application/json").content("{\"name\":\"Updated\",\"description\":null,\"price\":5.25,\"version\":0}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("ACTIVE")).andExpect(jsonPath("$.version").value(1));
        mvc.perform(patch(root(vendor) + "/" + item + "/availability").with(user(EMAIL).roles("OPERATOR")).with(csrf())
                .contentType("application/json").content("{\"status\":\"SOLD_OUT\",\"version\":1}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2)).andExpect(jsonPath("$.name").value("Updated"));
        mvc.perform(get(root(vendor) + "/" + item).with(user(EMAIL).roles("OPERATOR"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("SOLD_OUT"));
        mvc.perform(get("/api/vendors/" + vendor)).andExpect(status().isOk()).andExpect(jsonPath("$.menu[0].available").value(false));
    }

    @Test
    void foreignMissingUnownedAndDisabledVendorsDenyEveryOperation() throws Exception {
        long unowned = vendor(null);
        for (long target : new long[] {foreign, Long.MAX_VALUE, unowned}) assertDenied(target);
        jdbc.update("UPDATE operators SET enabled = FALSE WHERE id = ?", owner);
        assertDenied(vendor);
    }

    private void assertDenied(long target) throws Exception {
        for (var request : java.util.List.of(get(root(target)), get(root(target) + "/1"),
                post(root(target)).content(CREATE),
                put(root(target) + "/1").content("{\"name\":\"X\",\"price\":1,\"version\":0}"),
                patch(root(target) + "/1/availability").content("{\"status\":\"INACTIVE\",\"version\":0}"))) {
            mvc.perform(request.with(user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json"))
                    .andExpect(status().isNotFound()).andExpect(jsonPath("$.detail").value("Menu resource not found."));
        }
    }

    @Test
    void cannotSubstituteItemIdEvenBetweenTwoOwnedVendors() throws Exception {
        long otherItem = item(foreign);
        long siblingItem = item(sibling);
        for (long id : new long[] {otherItem, siblingItem, Long.MAX_VALUE}) {
            mvc.perform(get(root(vendor) + "/" + id).with(user(EMAIL).roles("OPERATOR"))).andExpect(status().isNotFound());
            mvc.perform(put(root(vendor) + "/" + id).with(user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json")
                    .content("{\"name\":\"Hacked\",\"price\":1,\"version\":0}")).andExpect(status().isNotFound());
            mvc.perform(patch(root(vendor) + "/" + id + "/availability").with(user(EMAIL).roles("OPERATOR")).with(csrf())
                    .contentType("application/json").content("{\"status\":\"INACTIVE\",\"version\":0}")).andExpect(status().isNotFound());
        }
        assertThat(jdbc.queryForList("SELECT name FROM vendor_menu_items", String.class)).containsOnly("Original");
    }

    @Test
    void forgedParentAndOwnerCannotReassignItem() throws Exception {
        var body = Map.of("name", "Safe", "price", 1, "status", "ACTIVE", "vendorId", foreign, "operatorId", -1, "id", -99);
        mvc.perform(post(root(vendor)).with(user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(body))).andExpect(status().isCreated());
        assertThat(jdbc.queryForList("SELECT vendor_id FROM vendor_menu_items", Long.class)).containsExactly(vendor);
    }

    @Test
    void anonymousWrongRoleAndMissingCsrfCannotManageMenu() throws Exception {
        mvc.perform(get(root(vendor))).andExpect(status().isUnauthorized());
        mvc.perform(post(root(vendor)).with(csrf()).contentType("application/json").content(CREATE)).andExpect(status().isUnauthorized());
        mvc.perform(get(root(vendor)).with(user(EMAIL).roles("CUSTOMER"))).andExpect(status().isForbidden());
        mvc.perform(post(root(vendor)).with(user(EMAIL).roles("OPERATOR")).contentType("application/json").content(CREATE))
                .andExpect(status().isForbidden());
        mvc.perform(patch(root(vendor) + "/1/availability").with(user(EMAIL).roles("OPERATOR")).with(csrf().useInvalidToken())
                .contentType("application/json").content("{\"status\":\"ACTIVE\",\"version\":0}")).andExpect(status().isForbidden());
    }

    @Test
    void staleVersionsRejectDetailsAndStatusWithoutOverwrite() throws Exception {
        long id = item(vendor);
        service.changeAvailability(EMAIL, vendor, id, new ChangeMenuAvailabilityRequest(MenuAvailability.INACTIVE, 0L));
        mvc.perform(put(root(vendor) + "/" + id).with(user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json")
                .content("{\"name\":\"Stale\",\"price\":1,\"version\":0}")).andExpect(status().isConflict());
        mvc.perform(patch(root(vendor) + "/" + id + "/availability").with(user(EMAIL).roles("OPERATOR")).with(csrf())
                .contentType("application/json").content("{\"status\":\"SOLD_OUT\",\"version\":0}")).andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("SELECT name FROM vendor_menu_items WHERE id = ?", String.class, id)).isEqualTo("Original");
    }

    @ParameterizedTest
    @ValueSource(strings = {"ACTIVE", "INACTIVE", "SOLD_OUT"})
    void allStatesHaveCorrectDerivedAvailability(String state) {
        var response = service.create(EMAIL, vendor, new CreateMenuItemRequest("Item", null, BigDecimal.ZERO, MenuAvailability.valueOf(state)));
        assertThat(jdbc.queryForObject("SELECT available FROM vendor_menu_items WHERE id = ?", Boolean.class, response.id()))
                .isEqualTo(state.equals("ACTIVE"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"{}", "null", "{", "{\"name\":\"\",\"price\":1,\"status\":\"ACTIVE\"}",
            "{\"name\":\"X\",\"price\":-1,\"status\":\"ACTIVE\"}",
            "{\"name\":\"X\",\"price\":1.001,\"status\":\"ACTIVE\"}",
            "{\"name\":\"X\",\"price\":100000000,\"status\":\"ACTIVE\"}",
            "{\"name\":\"X\",\"price\":1,\"status\":\"UNKNOWN\"}",
            "{\"name\":\"X\",\"price\":1,\"status\":0}"})
    void invalidCreateRejected(String body) throws Exception {
        mvc.perform(post(root(vendor)).with(user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json").content(body))
                .andExpect(status().isBadRequest());
    }

    @Test
    void textBoundariesAndMissingVersionValidated() throws Exception {
        for (var body : java.util.List.of(
                Map.of("name", "x".repeat(151), "price", 1, "status", "ACTIVE"),
                Map.of("name", "X", "description", "x".repeat(501), "price", 1, "status", "ACTIVE"))) {
            mvc.perform(post(root(vendor)).with(user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json")
                    .content(json.writeValueAsString(body))).andExpect(status().isBadRequest());
        }
        mvc.perform(put(root(vendor) + "/1").with(user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json")
                .content("{\"name\":\"X\",\"price\":1}")).andExpect(status().isBadRequest());
        mvc.perform(patch(root(vendor) + "/1/availability").with(user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json")
                .content("{\"status\":\"ACTIVE\",\"version\":-1}")).andExpect(status().isBadRequest());
        mvc.perform(post(root(vendor)).with(user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(Map.of("name", "x".repeat(150), "description", "x".repeat(500), "price", "99999999.99", "status", "ACTIVE"))))
                .andExpect(status().isCreated());
    }

    @Test
    void paginationIsBoundedAndHasConstantQueryCount() throws Exception {
        for (int i = 0; i < 21; i++) item(vendor);
        item(foreign);
        var statistics = emf.unwrap(SessionFactory.class).getStatistics();
        long before = statistics.getPrepareStatementCount();
        var page = service.list(EMAIL, vendor, 0, 20);
        assertThat(page.totalElements()).isEqualTo(21);
        assertThat(page.items()).hasSize(20);
        assertThat(statistics.getPrepareStatementCount() - before).isLessThanOrEqualTo(3);
        for (String query : new String[] {"size=0", "size=101", "page=-1", "page=10001", "page=nope"}) {
            mvc.perform(get(root(vendor) + "?" + query).with(user(EMAIL).roles("OPERATOR"))).andExpect(status().isBadRequest());
        }
        mvc.perform(get(root(sibling)).with(user(EMAIL).roles("OPERATOR"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty());
    }

    long account(String email) { return jdbc.queryForObject("INSERT INTO operators(display_name,email,password_hash) VALUES ('Test',?,'unused') RETURNING id", Long.class, email); }
    long vendor(Long owner) { return jdbc.queryForObject("INSERT INTO vendors(name,category,location,operator_id) VALUES ('Test','Food','CSUN',?) RETURNING id", Long.class, owner); }
    long item(long vendor) { return jdbc.queryForObject("INSERT INTO vendor_menu_items(vendor_id,name,price) VALUES (?,'Original',1) RETURNING id", Long.class, vendor); }
    String root(long vendor) { return "/api/operator/vendors/" + vendor + "/menu-items"; }
}
