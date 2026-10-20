package com.Bitemap.Backend.order;

import java.util.Map;
import java.util.List;
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
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class PickupOrderApiTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    long vendor, item, stop;
    static final String EMAIL = "pickup-customer@example.com";

    @BeforeEach void seed() {
        long user = jdbc.queryForObject("INSERT INTO app_users(display_name,email,password_hash) VALUES ('Pickup',?,'unused') RETURNING id", Long.class, EMAIL);
        jdbc.update("INSERT INTO app_user_roles(user_id,role) VALUES (?,'CUSTOMER')", user);
        vendor = jdbc.queryForObject("INSERT INTO vendors(name,category,location) VALUES ('Pickup truck','Food','CSUN') RETURNING id", Long.class);
        item = jdbc.queryForObject("INSERT INTO vendor_menu_items(vendor_id,name,price,availability_status) VALUES (?,'Taco',5,'ACTIVE') RETURNING id", Long.class,vendor);
        stop = activeStop(jdbc, vendor);
    }

    static long activeStop(JdbcTemplate jdbc, long vendor) {
        return jdbc.queryForObject("""
                INSERT INTO vendor_stops(vendor_id,venue_name,address,latitude,longitude,starts_at,ends_at,time_zone)
                VALUES (?,'Orange Grove entrance','18111 Nordhoff St',34.24,-118.53,
                    clock_timestamp()-interval '1 hour',clock_timestamp()+interval '1 hour','America/Los_Angeles') RETURNING id
                """,Long.class,vendor);
    }

    @Test void offersOnlyTheCurrentlyActiveStopWithoutCaching() throws Exception {
        mvc.perform(get("/api/vendors/"+vendor+"/pickup-stop"))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(jsonPath("$.stopId").value(stop)).andExpect(jsonPath("$.address").value("18111 Nordhoff St"));
        jdbc.update("UPDATE vendor_stops SET starts_at=clock_timestamp()+interval '1 hour',ends_at=clock_timestamp()+interval '2 hours' WHERE id=?",stop);
        mvc.perform(get("/api/vendors/"+vendor+"/pickup-stop")).andExpect(status().isNoContent());
    }

    @Test void rejectsMissingForeignCancelledEndedAndFutureStops() throws Exception {
        String body = body(UUID.randomUUID(), stop);
        mvc.perform(post("/api/customer/orders").with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("CUSTOMER")).with(csrf())
            .contentType("application/json").content(body.replace("\"pickupStopId\":"+stop+",", "")))
            .andExpect(status().isBadRequest());
        for (String state : List.of("cancelled","ended")) {
            jdbc.update("UPDATE vendor_stops SET status=? WHERE id=?",state,stop);
            submit(body).andExpect(status().isConflict());
        }
        jdbc.update("UPDATE vendor_stops SET status='scheduled',starts_at=clock_timestamp()+interval '1 hour',ends_at=clock_timestamp()+interval '2 hours' WHERE id=?",stop);
        submit(body).andExpect(status().isConflict());
        jdbc.update("UPDATE vendor_stops SET starts_at=clock_timestamp()-interval '2 hours',ends_at=clock_timestamp()-interval '1 hour' WHERE id=?",stop);
        submit(body).andExpect(status().isConflict());
        long other = jdbc.queryForObject("INSERT INTO vendors(name,category,location) VALUES ('Other','Food','LA') RETURNING id",Long.class);
        submit(body(UUID.randomUUID(),activeStop(jdbc,other))).andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM customer_orders",Integer.class)).isZero();
    }

    @Test void snapshotsPickupAndReplaysAfterStopClosesButRejectsChangedStop() throws Exception {
        UUID key = UUID.randomUUID();
        String body = body(key,stop);
        var first = submit(body).andExpect(status().isCreated())
            .andExpect(jsonPath("$.pickup.stopId").value(stop))
            .andExpect(jsonPath("$.pickup.address").value("18111 Nordhoff St"))
            .andExpect(jsonPath("$.pickup.venueName").value("Orange Grove entrance"))
            .andReturn();
        long id=json.readTree(first.getResponse().getContentAsString()).get("id").asLong();
        jdbc.update("UPDATE vendor_stops SET address='Changed address',status='ended' WHERE id=?",stop);
        submit(body).andExpect(status().isCreated()).andExpect(jsonPath("$.id").value(id))
            .andExpect(jsonPath("$.pickup.address").value("18111 Nordhoff St"));
        mvc.perform(get("/api/customer/orders/"+id).with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("CUSTOMER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.pickup.address").value("18111 Nordhoff St"));
        submit(body(key,activeStop(jdbc,vendor))).andExpect(status().isConflict());
    }

    @Test void ambiguousLegacyOverlapsFailClosed() throws Exception {
        activeStop(jdbc,vendor);
        submit(body(UUID.randomUUID(),stop)).andExpect(status().isConflict());
    }

    @Test void activeWindowIncludesStartButExcludesEnd() {
        var start=java.time.Instant.parse("2030-01-01T18:00:00Z");
        var end=start.plusSeconds(3600);
        jdbc.update("UPDATE vendor_stops SET starts_at=?,ends_at=? WHERE id=?",java.sql.Timestamp.from(start),java.sql.Timestamp.from(end),stop);
        assertThat(new PickupService(jdbc,java.time.Clock.fixed(start,java.time.ZoneOffset.UTC)).current(vendor).stopId()).isEqualTo(stop);
        assertThat(new PickupService(jdbc,java.time.Clock.fixed(start.minusMillis(1),java.time.ZoneOffset.UTC)).current(vendor)).isNull();
        assertThat(new PickupService(jdbc,java.time.Clock.fixed(end,java.time.ZoneOffset.UTC)).current(vendor)).isNull();
    }

    @Test void ownerSeesSameSnapshotAndCannotCancelStopWithOpenOrders() throws Exception {
        long operator=com.Bitemap.Backend.TestAccounts.operator(jdbc,"Owner","pickup-owner@example.com","unused");
        jdbc.update("UPDATE vendors SET operator_id=? WHERE id=?",operator,vendor);
        var created=submit(body(UUID.randomUUID(),stop)).andExpect(status().isCreated()).andReturn();
        long order=json.readTree(created.getResponse().getContentAsString()).get("id").asLong();
        mvc.perform(get("/api/operator/vendors/"+vendor+"/orders/"+order)
            .with(com.Bitemap.Backend.TestAccounts.user("pickup-owner@example.com").roles("OPERATOR")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.pickup.stopId").value(stop));
        mvc.perform(post("/api/operator/vendors/"+vendor+"/stops/"+stop+"/cancel")
            .with(com.Bitemap.Backend.TestAccounts.user("pickup-owner@example.com").roles("OPERATOR")).with(csrf())
            .contentType("application/json").content("{\"version\":0}"))
            .andExpect(status().isConflict());
        // Once the owner's cancellation workflow resolves the order, the stop can close.
        jdbc.update("UPDATE customer_orders SET status='CANCELLED' WHERE id=?",order);
        mvc.perform(post("/api/operator/vendors/"+vendor+"/stops/"+stop+"/cancel")
            .with(com.Bitemap.Backend.TestAccounts.user("pickup-owner@example.com").roles("OPERATOR")).with(csrf())
            .contentType("application/json").content("{\"version\":0}"))
            .andExpect(status().isOk());
    }

    @Test void legacyOrdersRemainReadableWithoutInventedPickup() throws Exception {
        long user=jdbc.queryForObject("SELECT id FROM app_users WHERE email=?",Long.class,EMAIL);
        long order=jdbc.queryForObject("INSERT INTO customer_orders(customer_user_id,vendor_id,idempotency_key,total) VALUES (?,?,?,0) RETURNING id",Long.class,user,vendor,UUID.randomUUID());
        mvc.perform(get("/api/customer/orders/"+order).with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("CUSTOMER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.pickup").isEmpty());
    }

    private String body(UUID key,long selectedStop) throws Exception {
        return "{\"pickupStopId\":"+selectedStop+","+json.writeValueAsString(Map.of("vendorId",vendor,"idempotencyKey",key,
            "items",List.of(Map.of("menuItemId",item,"quantity",1)),"pickup",Map.of("address","Forged address"))).substring(1);
    }
    private org.springframework.test.web.servlet.ResultActions submit(String body) throws Exception {
        return mvc.perform(post("/api/customer/orders").with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("CUSTOMER")).with(csrf()).contentType("application/json").content(body));
    }
}
