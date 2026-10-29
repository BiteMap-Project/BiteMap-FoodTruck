package com.Bitemap.Backend.order;

import com.Bitemap.Backend.TestAccounts;
import java.util.Map;
import java.util.UUID;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.stream.Stream;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class OperatorOrderApiTests {
    static final String OWNER = "order-owner@example.com";
    static final String OTHER = "order-other@example.com";
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    long owner, vendor, otherVendor, order, customer;

    @BeforeEach
    void seed() {
        owner = TestAccounts.operator(jdbc, "Owner", OWNER, "unused");
        long other = TestAccounts.operator(jdbc, "Other", OTHER, "unused");
        customer = jdbc.queryForObject("SELECT user_id FROM operators WHERE id=?", Long.class, owner);
        vendor = truck(owner);
        otherVendor = truck(other);
        order = order(vendor, "PLACED");
    }

    long truck(long operator) {
        return jdbc.queryForObject("INSERT INTO vendors(name,category,location,operator_id) VALUES ('Truck','Food','CSUN',?) RETURNING id", Long.class, operator);
    }

    long order(long truck, String status) {
        long item = jdbc.queryForObject("INSERT INTO vendor_menu_items(vendor_id,name,price,availability_status) VALUES (?,'Taco',4.25,'ACTIVE') RETURNING id", Long.class, truck);
        long id = jdbc.queryForObject("INSERT INTO customer_orders(customer_user_id,vendor_id,idempotency_key,status,total) VALUES (?,?,?,?,8.50) RETURNING id",
                Long.class, customer, truck, UUID.randomUUID(), status);
        jdbc.update("INSERT INTO customer_order_items(order_id,menu_item_id,name_snapshot,unit_price,quantity,line_total) VALUES (?,?,'Original Taco',4.25,2,8.50)", id, item);
        return id;
    }

    String path(long truck) { return "/api/operator/vendors/" + truck + "/orders"; }
    String update(String status, long version, String reason) throws Exception {
        return json.writeValueAsString(Map.of("status", status, "version", version, "cancellationReason", reason));
    }

    String estimate(Instant readyAt, long version) throws Exception {
        return json.writeValueAsString(Map.of("estimatedReadyAt", readyAt, "version", version));
    }

    @Test
    void listsOnlySelectedOwnedTruckWithStablePaginationAndFilter() throws Exception {
        long newest = order(vendor, "ACCEPTED");
        order(otherVendor, "PLACED");
        order(truck(owner), "PLACED");
        mvc.perform(get(path(vendor)).param("size","1").with(TestAccounts.user(OWNER).roles("OPERATOR")))
                .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
                .andExpect(jsonPath("$.totalElements").value(2)).andExpect(jsonPath("$.totalPages").value(2))
                .andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.items[0].id").value(newest));
        mvc.perform(get(path(vendor)).param("status","PLACED").with(TestAccounts.user(OWNER).roles("OPERATOR")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1)).andExpect(jsonPath("$.items[0].id").value(order));
        mvc.perform(get(path(vendor)).param("page","1").param("size","1").with(TestAccounts.user(OWNER).roles("OPERATOR")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].id").value(order));
    }

    @Test
    void detailsUseSavedPricesAndDoNotExposeCustomerCredentials() throws Exception {
        jdbc.update("UPDATE vendor_menu_items SET name='Changed',price=99 WHERE vendor_id=?", vendor);
        mvc.perform(get(path(vendor)+"/"+order).with(TestAccounts.user(OWNER).roles("OPERATOR")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("PLACED"))
                .andExpect(jsonPath("$.version").value(0)).andExpect(jsonPath("$.total").value(8.50))
                .andExpect(jsonPath("$.items[0].name").value("Original Taco"))
                .andExpect(jsonPath("$.items[0].unitPrice").value(4.25))
                .andExpect(jsonPath("$.passwordHash").doesNotExist()).andExpect(jsonPath("$.email").doesNotExist());
    }

    @Test
    void missingAndForeignResourcesAreHiddenForEveryOperation() throws Exception {
        for (long truck : new long[]{otherVendor, Long.MAX_VALUE}) {
            mvc.perform(get(path(truck)).with(TestAccounts.user(OWNER).roles("OPERATOR"))).andExpect(status().isNotFound());
            mvc.perform(get(path(truck)+"/"+order).with(TestAccounts.user(OWNER).roles("OPERATOR"))).andExpect(status().isNotFound());
            mvc.perform(patch(path(truck)+"/"+order+"/status").with(TestAccounts.user(OWNER).roles("OPERATOR")).with(csrf())
                    .contentType("application/json").content(update("ACCEPTED",0,""))).andExpect(status().isNotFound());
        }
        long foreignOrder = order(otherVendor,"PLACED");
        mvc.perform(get(path(vendor)+"/"+foreignOrder).with(TestAccounts.user(OWNER).roles("OPERATOR"))).andExpect(status().isNotFound());
        mvc.perform(patch(path(vendor)+"/"+foreignOrder+"/status").with(TestAccounts.user(OWNER).roles("OPERATOR")).with(csrf())
                .contentType("application/json").content(update("ACCEPTED",0,""))).andExpect(status().isNotFound());
    }

    static Stream<Arguments> transitions() {
        var states = java.util.List.of("PLACED","ACCEPTED","READY","COMPLETED","CANCELLED");
        return states.stream().flatMap(from -> states.stream().map(to -> Arguments.of(from,to,
                (from.equals("PLACED") && (to.equals("ACCEPTED") || to.equals("CANCELLED")))
                || (from.equals("ACCEPTED") && (to.equals("READY") || to.equals("CANCELLED")))
                || (from.equals("READY") && to.equals("COMPLETED")))));
    }

    @ParameterizedTest
    @MethodSource("transitions")
    void enforcesEveryStatusTransition(String from, String to, boolean allowed) throws Exception {
        jdbc.update("UPDATE customer_orders SET status=? WHERE id=?", from, order);
        mvc.perform(patch(path(vendor)+"/"+order+"/status").with(TestAccounts.user(OWNER).roles("OPERATOR")).with(csrf())
                .contentType("application/json").content(update(to,0,to.equals("CANCELLED")?" Kitchen closed ":"")))
                .andExpect(status().is(allowed?200:409));
        assertThat(jdbc.queryForObject("SELECT status FROM customer_orders WHERE id=?",String.class,order)).isEqualTo(allowed?to:from);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM customer_order_status_history WHERE order_id=?",Integer.class,order)).isEqualTo(allowed?1:0);
        if (allowed) {
            assertThat(jdbc.queryForObject("SELECT changed_by_user_id FROM customer_order_status_history WHERE order_id=?",Long.class,order)).isEqualTo(customer);
            mvc.perform(get("/api/customer/orders/"+order).with(TestAccounts.user(OWNER).roles("CUSTOMER")))
                    .andExpect(status().isOk()).andExpect(jsonPath("$.status").value(to));
        }
    }

    @Test
    void staleVersionCannotOverwriteAndCancellationReasonIsSaved() throws Exception {
        mvc.perform(patch(path(vendor)+"/"+order+"/status").with(TestAccounts.user(OWNER).roles("OPERATOR")).with(csrf())
                .contentType("application/json").content(update("ACCEPTED",0,"")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        mvc.perform(patch(path(vendor)+"/"+order+"/status").with(TestAccounts.user(OWNER).roles("OPERATOR")).with(csrf())
                .contentType("application/json").content(update("CANCELLED",0,"Closed"))).andExpect(status().isConflict());
        mvc.perform(patch(path(vendor)+"/"+order+"/status").with(TestAccounts.user(OWNER).roles("OPERATOR")).with(csrf())
                .contentType("application/json").content(update("CANCELLED",1," Kitchen closed ")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2))
                .andExpect(jsonPath("$.cancellationReason").value("Kitchen closed"));
        mvc.perform(get("/api/customer/orders/"+order).with(TestAccounts.user(OWNER).roles("CUSTOMER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.cancellationReason").value("Kitchen closed"));
    }

    @Test
    void ownerSetsAndUpdatesEstimateVisibleToCustomer() throws Exception {
        Instant first = Instant.now().truncatedTo(ChronoUnit.MILLIS).plus(20, ChronoUnit.MINUTES);
        mvc.perform(patch(path(vendor)+"/"+order+"/estimate")
                .with(TestAccounts.user(OWNER).roles("OPERATOR")).with(csrf())
                .contentType("application/json").content(estimate(first, 0)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1))
                .andExpect(jsonPath("$.estimatedReadyAt").exists());
        mvc.perform(get("/api/customer/orders/"+order).with(TestAccounts.user(OWNER).roles("CUSTOMER")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.estimatedReadyAt").exists());

        Instant second = first.plus(10, ChronoUnit.MINUTES);
        mvc.perform(patch(path(vendor)+"/"+order+"/estimate")
                .with(TestAccounts.user(OWNER).roles("OPERATOR")).with(csrf())
                .contentType("application/json").content(estimate(second, 1)))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2));
        assertThat(jdbc.queryForObject("SELECT estimated_ready_at FROM customer_orders WHERE id=?",
                java.sql.Timestamp.class, order).toInstant()).isEqualTo(second);
    }

    @Test
    void estimateRequiresCurrentVersionFutureWindowAndEditableStatus() throws Exception {
        Instant valid = Instant.now().truncatedTo(ChronoUnit.MILLIS).plus(20, ChronoUnit.MINUTES);
        mvc.perform(patch(path(vendor)+"/"+order+"/estimate")
                .with(TestAccounts.user(OWNER).roles("OPERATOR")).with(csrf())
                .contentType("application/json").content(estimate(valid, 1)))
                .andExpect(status().isConflict());
        mvc.perform(patch(path(vendor)+"/"+order+"/estimate")
                .with(TestAccounts.user(OWNER).roles("OPERATOR")).with(csrf())
                .contentType("application/json").content(estimate(Instant.now(), 0)))
                .andExpect(status().isBadRequest());
        jdbc.update("UPDATE customer_orders SET status='READY' WHERE id=?", order);
        mvc.perform(patch(path(vendor)+"/"+order+"/estimate")
                .with(TestAccounts.user(OWNER).roles("OPERATOR")).with(csrf())
                .contentType("application/json").content(estimate(valid, 0)))
                .andExpect(status().isConflict());
    }

    @Test
    void rejectsInvalidInputsWithoutWritingHistory() throws Exception {
        for (String body : java.util.List.of("{}", "{\"status\":\"INVALID\",\"version\":0}",
                "{\"status\":\"ACCEPTED\",\"version\":-1}", "{\"status\":\"ACCEPTED\",\"version\":0.5}",
                "{\"status\":1,\"version\":0}", "{\"status\":\"1\",\"version\":0}",
                update("CANCELLED",0,"  "), update("CANCELLED",0,"x".repeat(501)), update("ACCEPTED",0,"unrelated reason"))) {
            mvc.perform(patch(path(vendor)+"/"+order+"/status").with(TestAccounts.user(OWNER).roles("OPERATOR")).with(csrf())
                    .contentType("application/json").content(body)).andExpect(status().isBadRequest());
        }
        for (String query : java.util.List.of("?size=0","?size=101","?page=-1","?status=BOGUS","?page=abc")) {
            mvc.perform(get(path(vendor)+query).with(TestAccounts.user(OWNER).roles("OPERATOR"))).andExpect(status().isBadRequest());
        }
        assertThat(jdbc.queryForObject("SELECT status FROM customer_orders WHERE id=?",String.class,order)).isEqualTo("PLACED");
    }

    @Test
    void requiresAuthenticationOperatorRoleAndCsrf() throws Exception {
        mvc.perform(get(path(vendor))).andExpect(status().isUnauthorized());
        long customerOnly = jdbc.queryForObject("INSERT INTO app_users(display_name,email,password_hash) VALUES ('Customer','customer-only-orders@example.com','unused') RETURNING id",Long.class);
        jdbc.update("INSERT INTO app_user_roles(user_id,role) VALUES (?,'CUSTOMER')",customerOnly);
        mvc.perform(get(path(vendor)).with(TestAccounts.user("customer-only-orders@example.com").roles("CUSTOMER"))).andExpect(status().isForbidden());
        mvc.perform(patch(path(vendor)+"/"+order+"/status").with(TestAccounts.user(OWNER).roles("OPERATOR"))
                .contentType("application/json").content(update("ACCEPTED",0,""))).andExpect(status().isForbidden());
        jdbc.update("UPDATE operators SET enabled=false WHERE id=?",owner);
        mvc.perform(get(path(vendor)).with(TestAccounts.user(OWNER).roles("OPERATOR"))).andExpect(status().isForbidden());
    }
}
