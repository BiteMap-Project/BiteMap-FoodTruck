package com.Bitemap.Backend.order;

import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class CustomerOrderApiTests {
    static final String EMAIL = "ordering-customer@example.com";
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    long customer;
    long vendor;
    long taco;
    long drink;

    @BeforeEach
    void seed() {
        customer = jdbc.queryForObject("""
                INSERT INTO app_users(display_name,email,password_hash) VALUES ('Customer',?,'unused') RETURNING id
                """, Long.class, EMAIL);
        jdbc.update("INSERT INTO app_user_roles(user_id,role) VALUES (?, 'CUSTOMER')", customer);
        vendor = jdbc.queryForObject("INSERT INTO vendors(name,category,location) VALUES ('Taco Truck','Tacos','CSUN') RETURNING id", Long.class);
        taco = item(vendor, "Taco", "4.50", "ACTIVE");
        drink = item(vendor, "Drink", "2.25", "ACTIVE");
    }

    @Test
    void createsPriceSnapshotsAndTreatsARepeatedKeyAsTheSameOrder() throws Exception {
        var key = UUID.randomUUID();
        var body = body(key, new Object[][] {{taco, 2}, {drink, 1}});
        var first = mvc.perform(post("/api/customer/orders")
                .with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("CUSTOMER")).with(csrf())
                .contentType("application/json").content(body))
                .andExpect(status().isCreated()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.vendorId").value(vendor)).andExpect(jsonPath("$.vendorName").value("Taco Truck"))
                .andExpect(jsonPath("$.status").value("PLACED")).andExpect(jsonPath("$.total").value(11.25))
                .andExpect(jsonPath("$.items", hasSize(2))).andExpect(jsonPath("$.items[0].name").value("Taco"))
                .andExpect(jsonPath("$.items[0].unitPrice").value(4.50)).andExpect(jsonPath("$.items[0].quantity").value(2))
                .andReturn();
        long id = json.readTree(first.getResponse().getContentAsString()).get("id").asLong();

        mvc.perform(get("/api/customer/orders/" + id)
                .with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("CUSTOMER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(id))
                .andExpect(header().string("Cache-Control", "no-store"));

        jdbc.update("UPDATE vendor_menu_items SET name='Changed',price=99 WHERE id=?", taco);
        mvc.perform(post("/api/customer/orders")
                .with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("CUSTOMER")).with(csrf())
                .contentType("application/json").content(body))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(id))
                .andExpect(jsonPath("$.total").value(11.25)).andExpect(jsonPath("$.items[0].name").value("Taco"));

        assertThat(jdbc.queryForObject("SELECT count(*) FROM customer_orders WHERE customer_user_id=?", Integer.class, customer)).isEqualTo(1);
        assertThat(jdbc.queryForList("SELECT name_snapshot FROM customer_order_items ORDER BY id", String.class))
                .containsExactly("Taco", "Drink");
    }

    @Test
    void hidesAnotherCustomersOrder() throws Exception {
        String body = body(UUID.randomUUID(), new Object[][] {{taco, 1}});
        var created = mvc.perform(post("/api/customer/orders")
                .with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("CUSTOMER")).with(csrf())
                .contentType("application/json").content(body)).andReturn();
        long id = json.readTree(created.getResponse().getContentAsString()).get("id").asLong();
        long other = jdbc.queryForObject("INSERT INTO app_users(display_name,email,password_hash) VALUES ('Other','other-order@example.com','unused') RETURNING id", Long.class);
        jdbc.update("INSERT INTO app_user_roles(user_id,role) VALUES (?, 'CUSTOMER')", other);

        mvc.perform(get("/api/customer/orders/" + id)
                .with(com.Bitemap.Backend.TestAccounts.user("other-order@example.com").roles("CUSTOMER")))
                .andExpect(status().isNotFound());
    }

    @Test
    void rejectsUnavailableForeignAndMixedTruckItemsWithoutSavingAnything() throws Exception {
        long otherVendor = jdbc.queryForObject("INSERT INTO vendors(name,category,location) VALUES ('Other','Food','CSUN') RETURNING id", Long.class);
        long otherItem = item(otherVendor, "Other item", "3.00", "ACTIVE");
        jdbc.update("UPDATE vendor_menu_items SET availability_status='SOLD_OUT' WHERE id=?", taco);

        for (String body : new String[] {
                body(UUID.randomUUID(), new Object[][] {{taco, 1}}),
                body(UUID.randomUUID(), new Object[][] {{otherItem, 1}}),
                body(UUID.randomUUID(), new Object[][] {{drink, 1}, {otherItem, 1}})
        }) {
            mvc.perform(post("/api/customer/orders")
                    .with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("CUSTOMER")).with(csrf())
                    .contentType("application/json").content(body))
                    .andExpect(status().isConflict());
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM customer_orders WHERE customer_user_id=?", Integer.class, customer)).isZero();
    }

    @Test
    void validatesAuthenticationCsrfQuantitiesAndDuplicateItems() throws Exception {
        String valid = body(UUID.randomUUID(), new Object[][] {{taco, 1}});
        mvc.perform(post("/api/customer/orders").with(csrf()).contentType("application/json").content(valid))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/customer/orders")
                .with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("CUSTOMER"))
                .contentType("application/json").content(valid)).andExpect(status().isForbidden());

        for (String invalid : new String[] {
                "{}",
                json.writeValueAsString(Map.of("vendorId", vendor, "idempotencyKey", UUID.randomUUID(), "items", new Object[] {})),
                body(UUID.randomUUID(), new Object[][] {{taco, 0}}),
                body(UUID.randomUUID(), new Object[][] {{taco, 11}}),
                body(UUID.randomUUID(), new Object[][] {{taco, 1}, {taco, 2}})
        }) {
            mvc.perform(post("/api/customer/orders")
                    .with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("CUSTOMER")).with(csrf())
                    .contentType("application/json").content(invalid)).andExpect(status().isBadRequest());
        }
        assertThat(jdbc.queryForObject("SELECT count(*) FROM customer_orders WHERE customer_user_id=?", Integer.class, customer)).isZero();
    }

    private long item(long vendorId, String name, String price, String status) {
        return jdbc.queryForObject("""
                INSERT INTO vendor_menu_items(vendor_id,name,price,availability_status)
                VALUES (?,?,?::numeric,?) RETURNING id
                """, Long.class, vendorId, name, price, status);
    }

    private String body(UUID key, Object[][] items) throws Exception {
        var lines = java.util.Arrays.stream(items)
                .map(item -> Map.of("menuItemId", item[0], "quantity", item[1])).toList();
        return json.writeValueAsString(Map.of("vendorId", vendor, "idempotencyKey", key, "items", lines,
                "total", "0.01", "status", "COMPLETED", "customerUserId", -1));
    }
}
