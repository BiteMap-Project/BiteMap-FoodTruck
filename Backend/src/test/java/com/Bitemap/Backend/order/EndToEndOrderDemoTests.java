package com.Bitemap.Backend.order;

import com.Bitemap.Backend.TestAccounts;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Verifies the customer-to-operator workflow used in the classroom demonstration. */
@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class EndToEndOrderDemoTests {
    private static final String CUSTOMER = "demo-customer@example.com";
    private static final String OPERATOR = "demo-operator@example.com";

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;

    @Test
    void customerPlacesOrderOperatorCompletesItAndCustomerSeesTheResult() throws Exception {
        long customerId = jdbc.queryForObject("""
                INSERT INTO app_users(display_name,email,password_hash)
                VALUES ('Demo Customer',?,'unused') RETURNING id
                """, Long.class, CUSTOMER);
        jdbc.update("INSERT INTO app_user_roles(user_id,role) VALUES (?,'CUSTOMER')", customerId);

        long operatorId = TestAccounts.operator(jdbc, "Demo Operator", OPERATOR, "unused");
        long vendorId = jdbc.queryForObject("""
                INSERT INTO vendors(name,category,location,operator_id)
                VALUES ('Professor Tacos','Tacos','CSUN',?) RETURNING id
                """, Long.class, operatorId);
        long menuItemId = jdbc.queryForObject("""
                INSERT INTO vendor_menu_items(vendor_id,name,price,availability_status)
                VALUES (?,'Campus Taco',4.50,'ACTIVE') RETURNING id
                """, Long.class, vendorId);

        mvc.perform(get("/api/vendors/" + vendorId))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.name").value("Professor Tacos"))
                .andExpect(jsonPath("$.menu[0].name").value("Campus Taco"));

        String orderRequest = json.writeValueAsString(Map.of(
                "vendorId", vendorId,
                "idempotencyKey", UUID.randomUUID(),
                "items", java.util.List.of(Map.of("menuItemId", menuItemId, "quantity", 2))));
        var placed = mvc.perform(post("/api/customer/orders")
                        .with(TestAccounts.user(CUSTOMER).roles("CUSTOMER")).with(csrf())
                        .contentType("application/json").content(orderRequest))
                .andExpect(status().isCreated())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.status").value("PLACED"))
                .andExpect(jsonPath("$.total").value(9.00))
                .andReturn();
        long orderId = json.readTree(placed.getResponse().getContentAsString()).get("id").asLong();

        String ordersPath = "/api/operator/vendors/" + vendorId + "/orders";
        mvc.perform(get(ordersPath).with(TestAccounts.user(OPERATOR).roles("OPERATOR")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].id").value(orderId))
                .andExpect(jsonPath("$.items[0].status").value("PLACED"));

        changeStatus(ordersPath, orderId, "ACCEPTED", 0);
        changeStatus(ordersPath, orderId, "READY", 1);
        changeStatus(ordersPath, orderId, "COMPLETED", 2);

        mvc.perform(get("/api/customer/orders/" + orderId)
                        .with(TestAccounts.user(CUSTOMER).roles("CUSTOMER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("COMPLETED"))
                .andExpect(jsonPath("$.vendorName").value("Professor Tacos"))
                .andExpect(jsonPath("$.items[0].name").value("Campus Taco"));
        mvc.perform(get("/api/customer/orders")
                        .with(TestAccounts.user(CUSTOMER).roles("CUSTOMER")))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].status").value("COMPLETED"));
    }

    private void changeStatus(String ordersPath, long orderId, String statusName, long version) throws Exception {
        String request = json.writeValueAsString(Map.of(
                "status", statusName,
                "version", version,
                "cancellationReason", ""));
        mvc.perform(patch(ordersPath + "/" + orderId + "/status")
                        .with(TestAccounts.user(OPERATOR).roles("OPERATOR")).with(csrf())
                        .contentType("application/json").content(request))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value(statusName))
                .andExpect(jsonPath("$.version").value(version + 1));
    }
}
