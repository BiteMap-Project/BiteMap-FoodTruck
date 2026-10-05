package com.Bitemap.Backend.vendor;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;

import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class VendorProfileTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;

    @Test
    void returnsOnlyTheSelectedVendorsMenuIncludingUnavailableItems() throws Exception {
        long first = vendor("First Truck");
        long second = vendor("Second Truck");
        jdbc.update("INSERT INTO vendor_menu_items (vendor_id, name, description, price, availability_status) VALUES (?, 'Soup', 'Warm soup', 8.99, 'INACTIVE')", first);
        jdbc.update("INSERT INTO vendor_menu_items (vendor_id, name, price) VALUES (?, 'Other item', 4.50)", second);
        mvc.perform(get("/api/vendors/" + first))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.id").value(first))
            .andExpect(jsonPath("$.name").value("First Truck"))
            .andExpect(jsonPath("$.category").value("Soup"))
            .andExpect(jsonPath("$.location").value("CSUN"))
            .andExpect(jsonPath("$.menu.length()").value(1))
            .andExpect(jsonPath("$.menu[0].name").value("Soup"))
            .andExpect(jsonPath("$.menu[0].description").value("Warm soup"))
            .andExpect(jsonPath("$.menu[0].price").value(8.99))
            .andExpect(jsonPath("$.menu[0].available").value(false));
        mvc.perform(get("/api/vendors/" + second))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.menu[0].name").value("Other item"))
            .andExpect(jsonPath("$.menu[0].available").value(true));
    }

    @Test
    void existingVendorWithoutMenuIsNotNotFound() throws Exception {
        mvc.perform(get("/api/vendors/" + vendor("Empty Menu")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.menu").isEmpty());
        mvc.perform(get("/api/vendors/9223372036854775807"))
            .andExpect(status().isNotFound()).andExpect(jsonPath("$.status").value(404));
    }

    @Test
    void acceptsDevelopmentVendorIds() throws Exception {
        jdbc.update("INSERT INTO vendors (id, name, category, location) OVERRIDING SYSTEM VALUE VALUES (-100, 'Dev truck', 'Soup', 'CSUN')");
        mvc.perform(get("/api/vendors/-100")).andExpect(status().isOk())
            .andExpect(jsonPath("$.name").value("Dev truck"));
    }

    @ParameterizedTest
    @ValueSource(strings = {"abc", "1.5", "9223372036854775808"})
    void malformedIdsReturnBadRequest(String id) throws Exception {
        mvc.perform(get("/api/vendors/" + id)).andExpect(status().isBadRequest());
    }

    @Test
    void detailWritesAndNestedRoutesRemainProtected() throws Exception {
        mvc.perform(post("/api/vendors/1")).andExpect(status().isForbidden());
        mvc.perform(post("/api/vendors/1").with(csrf()).accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isUnauthorized());
        mvc.perform(get("/api/vendors/1/private").accept(MediaType.APPLICATION_JSON))
            .andExpect(status().isUnauthorized());
    }

    @ParameterizedTest
    @ValueSource(strings = {"-0.01", "NaN"})
    void rejectsInvalidPrices(String price) {
        long id = vendor("Prices");
        assertThatThrownBy(() -> jdbc.update("INSERT INTO vendor_menu_items (vendor_id, name, price) VALUES (?, 'Item', CAST(? AS numeric))", id, price))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void rejectsOrphanMenuItems() {
        assertThatThrownBy(() -> jdbc.update("INSERT INTO vendor_menu_items (vendor_id, name, price) VALUES (9223372036854775807, 'Item', 1)"))
            .isInstanceOf(DataIntegrityViolationException.class);
    }

    private long vendor(String name) {
        return jdbc.queryForObject("INSERT INTO vendors (name, category, location) VALUES (?, 'Soup', 'CSUN') RETURNING id", Long.class, name);
    }
}
