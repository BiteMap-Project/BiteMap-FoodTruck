package com.Bitemap.Backend.order;

import com.Bitemap.Backend.TestAccounts;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @AutoConfigureMockMvc @Transactional
class OrderingPauseTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    long vendor, item, stop;
    String owner = "pause-owner@example.test", other = "pause-other@example.test";
    @BeforeEach void seed() {
        long operator = TestAccounts.operator(jdbc, "Owner", owner, "unused");
        TestAccounts.operator(jdbc, "Other", other, "unused");
        vendor = jdbc.queryForObject("INSERT INTO vendors(name,category,location,operator_id) VALUES ('Pause truck','Food','CSUN',?) RETURNING id", Long.class, operator);
        item = jdbc.queryForObject("INSERT INTO vendor_menu_items(vendor_id,name,price,availability_status) VALUES (?,'Taco',5,'ACTIVE') RETURNING id", Long.class, vendor);
        stop = PickupOrderApiTests.activeStop(jdbc, vendor);
    }
    String path() { return "/api/operator/vendors/" + vendor + "/ordering"; }
    void change(boolean accepting, long version) throws Exception {
        mvc.perform(put(path()).with(TestAccounts.user(owner).roles("OPERATOR")).with(csrf())
            .contentType("application/json").content("{\"acceptingOrders\":"+accepting+",\"version\":"+version+"}"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.acceptingOrders").value(accepting));
    }
    String command(UUID key) { return "{\"vendorId\":"+vendor+",\"pickupStopId\":"+stop+",\"idempotencyKey\":\""+key+"\",\"items\":[{\"menuItemId\":"+item+",\"quantity\":1}]}"; }
    org.springframework.test.web.servlet.ResultActions checkout(String body) throws Exception {
        return mvc.perform(post("/api/customer/orders").with(TestAccounts.user(owner).roles("CUSTOMER")).with(csrf()).contentType("application/json").content(body));
    }
    @Test void pauseBlocksNewOrdersButNotExistingRetriesAndResumeStillRequiresAStop() throws Exception {
        mvc.perform(get(path()).with(TestAccounts.user(owner).roles("OPERATOR"))).andExpect(status().isOk())
            .andExpect(jsonPath("$.acceptingOrders").value(true)).andExpect(jsonPath("$.version").value(0));
        String original = command(UUID.randomUUID());
        checkout(original).andExpect(status().isCreated());
        change(false, 0);
        checkout(command(UUID.randomUUID())).andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("Temporarily not accepting orders."));
        checkout(original).andExpect(status().isCreated());
        mvc.perform(get("/api/vendors/"+vendor+"/pickup-stop")).andExpect(status().isConflict());
        change(true, 1);
        jdbc.update("UPDATE vendor_stops SET status='ended' WHERE id=?", stop);
        checkout(command(UUID.randomUUID())).andExpect(status().isConflict());
    }
    @Test void ownershipCsrfAndStaleVersionsAreEnforced() throws Exception {
        mvc.perform(get(path())).andExpect(status().isUnauthorized());
        mvc.perform(get(path()).with(TestAccounts.user(owner).roles("CUSTOMER"))).andExpect(status().isForbidden());
        mvc.perform(get(path()).with(TestAccounts.user(other).roles("OPERATOR"))).andExpect(status().isNotFound());
        mvc.perform(put(path()).with(TestAccounts.user(other).roles("OPERATOR")).with(csrf()).contentType("application/json")
            .content("{\"acceptingOrders\":false,\"version\":0}")).andExpect(status().isNotFound());
        mvc.perform(put(path()).with(TestAccounts.user(owner).roles("OPERATOR")).contentType("application/json")
            .content("{\"acceptingOrders\":false,\"version\":0}")).andExpect(status().isForbidden());
        change(false, 0);
        mvc.perform(put(path()).with(TestAccounts.user(owner).roles("OPERATOR")).with(csrf()).contentType("application/json")
            .content("{\"acceptingOrders\":true,\"version\":0}")).andExpect(status().isConflict());
        mvc.perform(put(path()).with(TestAccounts.user(owner).roles("OPERATOR")).with(csrf()).contentType("application/json")
            .content("{\"version\":1}")).andExpect(status().isBadRequest());
    }
    @Test void malformedControlsAreRejectedAndAnotherTruckIsUnaffected() throws Exception {
        for (String body : java.util.List.of(
                "{\"acceptingOrders\":\"false\",\"version\":0}",
                "{\"acceptingOrders\":1,\"version\":0}",
                "{\"acceptingOrders\":false,\"version\":0.5}",
                "{\"acceptingOrders\":false,\"version\":-1}",
                "{\"acceptingOrders\":null,\"version\":0}")) {
            mvc.perform(put(path()).with(TestAccounts.user(owner).roles("OPERATOR")).with(csrf()).contentType("application/json")
                .content(body)).andExpect(status().isBadRequest());
        }
        long another = jdbc.queryForObject("INSERT INTO vendors(name,category,location) VALUES ('Other','Food','LA') RETURNING id",Long.class);
        long anotherStop = PickupOrderApiTests.activeStop(jdbc, another);
        change(false, 0);
        mvc.perform(get("/api/vendors/"+another+"/pickup-stop")).andExpect(status().isOk()).andExpect(jsonPath("$.stopId").value(anotherStop));
    }
}
