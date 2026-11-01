package com.Bitemap.Backend.order;

import java.util.Map;
import java.util.UUID;
import java.util.List;
import java.util.LinkedHashMap;
import java.math.BigDecimal;
import java.math.BigInteger;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.Arguments;
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
    long stop;

    @BeforeEach
    void seed() {
        customer = jdbc.queryForObject("""
                INSERT INTO app_users(display_name,email,password_hash) VALUES ('Customer',?,'unused') RETURNING id
                """, Long.class, EMAIL);
        jdbc.update("INSERT INTO app_user_roles(user_id,role) VALUES (?, 'CUSTOMER')", customer);
        vendor = jdbc.queryForObject("INSERT INTO vendors(name,category,location) VALUES ('Taco Truck','Tacos','CSUN') RETURNING id", Long.class);
        taco = item(vendor, "Taco", "4.50", "ACTIVE");
        drink = item(vendor, "Drink", "2.25", "ACTIVE");
        stop = PickupOrderApiTests.activeStop(jdbc, vendor);
    }

    @Test
    void historyIsPrivatePaginatedAndNeverCached() throws Exception {
        long otherCustomer = jdbc.queryForObject("INSERT INTO app_users(display_name,email,password_hash) VALUES ('Other','someone-else@example.com','unused') RETURNING id", Long.class);
        jdbc.update("INSERT INTO app_user_roles(user_id,role) VALUES (?, 'CUSTOMER')", otherCustomer);
        mvc.perform(post("/api/customer/orders")
                .with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("CUSTOMER")).with(csrf())
                .contentType("application/json").content(body(UUID.randomUUID(), new Object[][] {{taco, 1}})))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/customer/orders?size=1")
                .with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("CUSTOMER")))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.items", hasSize(1)))
                .andExpect(jsonPath("$.items[0].vendorName").value("Taco Truck"));
        mvc.perform(get("/api/customer/orders?page=1&size=1")
                .with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("CUSTOMER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items", hasSize(0)));
        mvc.perform(get("/api/customer/orders")
                .with(com.Bitemap.Backend.TestAccounts.user("someone-else@example.com").roles("CUSTOMER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items", hasSize(0)));
        mvc.perform(get("/api/customer/orders")).andExpect(status().isUnauthorized());
        jdbc.update("UPDATE app_users SET enabled=false WHERE id=?", otherCustomer);
        mvc.perform(get("/api/customer/orders")
                .with(com.Bitemap.Backend.TestAccounts.user("someone-else@example.com").roles("CUSTOMER")))
                .andExpect(status().isUnauthorized());
        for (String query : new String[] {"size=0", "size=101", "page=-1", "page=10001"}) {
            mvc.perform(get("/api/customer/orders?" + query)
                    .with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("CUSTOMER")))
                    .andExpect(status().isBadRequest());
        }
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
    void validatesAuthenticationAndCsrfWithAnOtherwiseValidRequest() throws Exception {
        String valid = body(UUID.randomUUID(), new Object[][] {{taco, 1}});
        mvc.perform(post("/api/customer/orders").with(csrf()).contentType("application/json").content(valid))
                .andExpect(status().isUnauthorized());
        mvc.perform(post("/api/customer/orders")
                .with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("CUSTOMER"))
                .contentType("application/json").content(valid)).andExpect(status().isForbidden());

        assertNoOrderWrites();
        submit(valid).andExpect(status().isCreated());
    }

    @Test
    void acceptsSeedIdsAndIgnoresAllClientMoneyAndIdentityFields() throws Exception {
        jdbc.update("INSERT INTO vendors(id,name,category,location) OVERRIDING SYSTEM VALUE VALUES (-1,'Seed Truck','Food','CSUN')");
        jdbc.update("INSERT INTO vendor_menu_items(id,vendor_id,name,price,availability_status) OVERRIDING SYSTEM VALUE VALUES (-5,-1,'Seed Taco',4.25,'ACTIVE')");
        jdbc.update("""
                INSERT INTO vendor_stops(id,vendor_id,venue_name,address,latitude,longitude,starts_at,ends_at,time_zone)
                OVERRIDING SYSTEM VALUE VALUES (-9,-1,'Seed pickup','18111 Nordhoff St',34.24,-118.53,
                    clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour','America/Los_Angeles')
                """);
        var request = Map.of("vendorId", -1, "pickupStopId", -9, "idempotencyKey", UUID.randomUUID(), "total", "0.01", "customerUserId", -999,
                "status", "COMPLETED", "items", java.util.List.of(Map.of("menuItemId", -5, "quantity", 2, "price", "0.01", "unitPrice", "0.01", "lineTotal", "0.01")));
        mvc.perform(post("/api/customer/orders").with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("CUSTOMER")).with(csrf())
                .contentType("application/json").content(json.writeValueAsString(request)))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.vendorId").value(-1)).andExpect(jsonPath("$.total").value(8.50))
                .andExpect(jsonPath("$.items[0].unitPrice").value(4.25)).andExpect(jsonPath("$.pickup.stopId").value(-9))
                .andExpect(jsonPath("$.status").value("PLACED"));
        assertThat(jdbc.queryForObject("SELECT customer_user_id FROM customer_orders",Long.class)).isEqualTo(customer);
    }

    @Test
    void rejectsReusingAKeyWithDifferentQuantities() throws Exception {
        var key=UUID.randomUUID();
        mvc.perform(post("/api/customer/orders").with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("CUSTOMER")).with(csrf())
                .contentType("application/json").content(body(key,new Object[][]{{taco,1}}))).andExpect(status().isCreated());
        mvc.perform(post("/api/customer/orders").with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("CUSTOMER")).with(csrf())
                .contentType("application/json").content(body(key,new Object[][]{{taco,2}}))).andExpect(status().isConflict())
                .andExpect(jsonPath("$.detail").value("This idempotency key was already used for a different cart. Use a new key for a new order."));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM customer_orders",Integer.class)).isEqualTo(1);
    }

    @Test
    void givesAnActionableSoldOutErrorWithoutSavingAnOrder() throws Exception {
        jdbc.update("UPDATE vendor_menu_items SET availability_status='SOLD_OUT' WHERE id=?",taco);
        mvc.perform(post("/api/customer/orders").with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("CUSTOMER")).with(csrf())
                .contentType("application/json").content(body(UUID.randomUUID(),new Object[][]{{taco,1}})))
                .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("Item " + taco + " is currently sold out."));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM customer_orders",Integer.class)).isZero();
    }

    @Test
    void nullLineIsAnInputErrorNotAServerFailure() throws Exception {
        var request = validRequest();
        request.put("items", java.util.Collections.singletonList(null));
        assertFieldRejection(request, "items[0]", "Menu item must not be null");
    }

    @ParameterizedTest(name = "{0} rejects {1}")
    @MethodSource("invalidNumbers")
    void rejectsOnlyTheTargetedNumericField(String field, Object value, boolean malformed) throws Exception {
        var request = validRequest();
        replaceField(request, field, value);
        String path = field.equals("menuItemId") || field.equals("quantity") ? "items[0]." + field : field;
        if (!malformed) {
            assertFieldRejection(request, path, field.equals("quantity")
                    ? "Quantity must be between 1 and 10" : "must be a nonzero integer ID");
            return;
        }
        var result = submit(json.writeValueAsString(request))
                .andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.detail").value("Malformed order request. IDs and quantities must be JSON integers within range; idempotencyKey must be a valid UUID."))
                .andExpect(jsonPath("$.errors").doesNotExist())
                .andExpect(jsonPath("$.trace").doesNotExist()).andReturn();
        // Parsing failures precede Bean Validation. Check the internal parser path without
        // exposing Jackson internals in the public error response.
        assertThat(result.getResolvedException())
                .isInstanceOf(org.springframework.http.converter.HttpMessageNotReadableException.class);
        assertThat(result.getResolvedException().getCause())
                .isInstanceOf(value instanceof BigInteger ? tools.jackson.core.exc.InputCoercionException.class
                        : tools.jackson.databind.exc.MismatchedInputException.class)
                .hasMessageContaining("[\"" + field + "\"]");
        assertNoOrderWrites();
        assertRepairedRequestSucceeds(request);
    }

    static Stream<Arguments> invalidNumbers() {
        return Stream.of("vendorId", "pickupStopId", "menuItemId", "quantity").flatMap(field -> {
            String max = field.equals("quantity") ? "2147483648" : "9223372036854775808";
            String min = field.equals("quantity") ? "-2147483649" : "-9223372036854775809";
            var cases = new java.util.ArrayList<Arguments>();
            cases.add(Arguments.of(field, 0, false));
            cases.add(Arguments.of(field, new BigDecimal("1.5"), true));
            cases.add(Arguments.of(field, new BigDecimal("1.0"), true));
            cases.add(Arguments.of(field, "1", true));
            cases.add(Arguments.of(field, new BigInteger(max), true));
            cases.add(Arguments.of(field, new BigInteger(min), true));
            if (field.equals("quantity")) {
                cases.add(Arguments.of(field, -1, false));
                cases.add(Arguments.of(field, 11, false));
            }
            return cases.stream();
        });
    }

    @ParameterizedTest(name = "{0}: missing={1}")
    @MethodSource("requiredFields")
    void identifiesTheSingleMissingOrNullField(String field, boolean missing) throws Exception {
        var request = validRequest();
        if (missing) fieldMap(request, field).remove(field);
        else replaceField(request, field, null);
        String path = field.equals("menuItemId") || field.equals("quantity") ? "items[0]." + field : field;
        assertFieldRejection(request, path, field + " is required");
    }

    static Stream<Arguments> requiredFields() {
        return Stream.of("vendorId", "pickupStopId", "menuItemId", "quantity", "idempotencyKey")
                .flatMap(field -> Stream.of(Arguments.of(field, true), Arguments.of(field, false)));
    }

    @Test
    void emptyItemsReportsOnlyTheItemsError() throws Exception {
        var request = validRequest();
        request.put("items", List.of());
        assertFieldRejection(request, "items", "Provide at least one menu item");
    }

    @Test
    void duplicateItemsReportTheBusinessRuleAndWriteNothing() throws Exception {
        var request = validRequest();
        request.put("items", List.of(Map.of("menuItemId", taco, "quantity", 1), Map.of("menuItemId", taco, "quantity", 1)));
        submit(json.writeValueAsString(request)).andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.detail").value("Each menu item may appear only once. Combine duplicate items into one quantity."))
                .andExpect(jsonPath("$.trace").doesNotExist());
        assertNoOrderWrites();
        assertRepairedRequestSucceeds(request);
    }

    private Map<String, Object> validRequest() {
        return new LinkedHashMap<>(Map.of("vendorId", vendor, "pickupStopId", stop,
                "idempotencyKey", UUID.randomUUID(), "items", List.of(new LinkedHashMap<String, Object>(Map.of("menuItemId", taco, "quantity", 1)))));
    }

    @SuppressWarnings("unchecked")
    private Map<String, Object> fieldMap(Map<String, Object> request, String field) {
        return field.equals("menuItemId") || field.equals("quantity")
                ? ((List<Map<String, Object>>) request.get("items")).getFirst() : request;
    }

    private void replaceField(Map<String, Object> request, String field, Object value) {
        fieldMap(request, field).put(field, value);
    }

    private org.springframework.test.web.servlet.ResultActions submit(String request) throws Exception {
        return mvc.perform(post("/api/customer/orders").with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("CUSTOMER"))
                .with(csrf()).contentType("application/json").content(request));
    }

    private void assertFieldRejection(Map<String, Object> request, String field, String message) throws Exception {
        var result = submit(json.writeValueAsString(request)).andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.detail").value(field + ": " + message))
                .andExpect(jsonPath("$.trace").doesNotExist()).andReturn();
        assertThat(json.readTree(result.getResponse().getContentAsString()).get("errors"))
                .isEqualTo(json.valueToTree(Map.of(field, message)));
        assertNoOrderWrites();
        assertRepairedRequestSucceeds(request);
    }

    private void assertRepairedRequestSucceeds(Map<String, Object> rejected) throws Exception {
        var repaired = validRequest();
        if (rejected.get("idempotencyKey") != null) repaired.put("idempotencyKey", rejected.get("idempotencyKey"));
        submit(json.writeValueAsString(repaired)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.vendorId").value(vendor))
                .andExpect(jsonPath("$.items[0].menuItemId").value(taco))
                .andExpect(jsonPath("$.total").value(4.50));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM customer_orders WHERE customer_user_id=?", Integer.class, customer)).isEqualTo(1);
    }

    private void assertNoOrderWrites() {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM customer_orders", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM customer_order_items", Integer.class)).isZero();
    }

    @Test
    void acceptsOperatorCreatedItemsAndReorderedReplay() throws Exception {
        long operator = com.Bitemap.Backend.TestAccounts.operator(jdbc, "Owner", "checkout-owner@example.com", "unused");
        jdbc.update("UPDATE vendors SET operator_id=? WHERE id=?", operator, vendor);
        var createdItem = mvc.perform(post("/api/operator/vendors/" + vendor + "/menu-items")
                .with(com.Bitemap.Backend.TestAccounts.user("checkout-owner@example.com").roles("OPERATOR")).with(csrf())
                .contentType("application/json")
                .content(json.writeValueAsString(Map.of("name", "Owner-created taco", "price", new BigDecimal("4.50"), "status", "ACTIVE"))))
                .andExpect(status().isCreated()).andReturn();
        taco = json.readTree(createdItem.getResponse().getContentAsString()).get("id").asLong();
        assertThat(taco).isPositive();
        assertThat(vendor).isPositive();
        assertThat(stop).isPositive();
        var key = UUID.randomUUID();
        var first = mvc.perform(post("/api/customer/orders").with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("CUSTOMER")).with(csrf())
                .contentType("application/json").content(body(key, new Object[][]{{taco,10},{drink,1}})))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.total").value(47.25)).andReturn();
        long id = json.readTree(first.getResponse().getContentAsString()).get("id").asLong();
        jdbc.update("UPDATE vendor_menu_items SET availability_status='SOLD_OUT' WHERE id=?", taco);
        mvc.perform(post("/api/customer/orders").with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("CUSTOMER")).with(csrf())
                .contentType("application/json").content(body(key, new Object[][]{{drink,1},{taco,10}})))
                .andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(id));
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
        return json.writeValueAsString(Map.of("vendorId", vendor, "pickupStopId", stop, "idempotencyKey", key, "items", lines));
    }
}
