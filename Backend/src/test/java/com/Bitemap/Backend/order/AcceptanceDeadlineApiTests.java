package com.Bitemap.Backend.order;

import com.Bitemap.Backend.TestAccounts;
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
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class AcceptanceDeadlineApiTests {
    static final String EMAIL="acceptance-owner@example.test";
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @Autowired OrderService orders;
    @Autowired OperatorOrderService ownerOrders;
    @Autowired OrderExpirationService expiration;
    long vendor,stop,item;

    @BeforeEach void seed() {
        long operator=TestAccounts.operator(jdbc,"Timeout",EMAIL,"unused");
        vendor=jdbc.queryForObject("INSERT INTO vendors(name,category,location,operator_id) VALUES ('Timeout','Food','LA',?) RETURNING id",Long.class,operator);
        stop=PickupOrderApiTests.activeStop(jdbc,vendor);
        item=jdbc.queryForObject("INSERT INTO vendor_menu_items(vendor_id,name,price,availability_status) VALUES (?,'Taco',5,'ACTIVE') RETURNING id",Long.class,vendor);
    }

    @Test void defaultTimeoutIsExposedToOwnerAndAtCheckout() throws Exception {
        mvc.perform(get("/api/operator/vendors/"+vendor+"/ordering").with(TestAccounts.user(EMAIL).roles("OPERATOR")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.acceptanceMinutes").value(5));
        mvc.perform(get("/api/vendors/"+vendor+"/pickup-stop"))
            .andExpect(status().isOk()).andExpect(jsonPath("$.acceptanceMinutes").value(5));
    }

    @Test void checkoutSavesAnAcceptanceDeadline() throws Exception {
        mvc.perform(post("/api/customer/orders").with(TestAccounts.user(EMAIL).roles("CUSTOMER")).with(csrf())
            .contentType("application/json").content(json.writeValueAsString(Map.of("vendorId",vendor,"pickupStopId",stop,
                "idempotencyKey",UUID.randomUUID(),"items",java.util.List.of(Map.of("menuItemId",item,"quantity",1))))))
            .andExpect(status().isCreated()).andExpect(jsonPath("$.acceptanceMinutes").value(5))
            .andExpect(jsonPath("$.acceptanceDeadline").isString());
    }

    CreateOrderRequest command() { return new CreateOrderRequest(vendor,stop,UUID.randomUUID(),java.util.List.of(new CreateOrderRequest.Item(item,1))); }
    String settingsPath() { return "/api/operator/vendors/"+vendor+"/ordering"; }
    org.springframework.test.web.servlet.ResultActions settings(String body) throws Exception {
        return mvc.perform(put(settingsPath()).with(TestAccounts.user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json").content(body));
    }

    @Test void allowedSettingsAreVersionedStrictAndOwnerProtected() throws Exception {
        long version=0;
        for(int minutes:new int[]{3,5,10,15,20}) {
            settings("{\"acceptingOrders\":true,\"version\":"+version+",\"acceptanceMinutes\":"+minutes+"}")
                .andExpect(status().isOk()).andExpect(jsonPath("$.acceptanceMinutes").value(minutes)).andExpect(jsonPath("$.version").value(++version));
        }
        for(String value:new String[]{"0","2","4","21","-1","3.5","\"5\"","9223372036854775808"})
            settings("{\"acceptingOrders\":true,\"version\":5,\"acceptanceMinutes\":"+value+"}").andExpect(status().isBadRequest());
        String body="{\"acceptingOrders\":true,\"version\":5,\"acceptanceMinutes\":10}";
        settings(body.replace("\"version\":5","\"version\":0")).andExpect(status().isConflict());
        mvc.perform(put(settingsPath()).with(TestAccounts.user(EMAIL).roles("OPERATOR")).contentType("application/json").content(body)).andExpect(status().isForbidden());
        mvc.perform(put(settingsPath()).with(TestAccounts.user(EMAIL).roles("CUSTOMER")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isForbidden());
        TestAccounts.operator(jdbc,"Other","other-acceptance@example.test","unused");
        mvc.perform(put(settingsPath()).with(TestAccounts.user("other-acceptance@example.test").roles("OPERATOR")).with(csrf()).contentType("application/json").content(body)).andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("SELECT acceptance_minutes FROM vendors WHERE id=?",Integer.class,vendor)).isEqualTo(20);
    }

    @Test void newOrdersSnapshotSettingsAndRetriesNeverExtendTheDeadline() throws Exception {
        var command=command();
        var first=orders.create(EMAIL,command);
        assertThat(first.acceptanceMinutes()).isEqualTo(5);
        assertThat(first.acceptanceDeadline()).isBetween(java.time.Instant.now().plusSeconds(290),java.time.Instant.now().plusSeconds(305));
        settings("{\"acceptingOrders\":true,\"version\":0,\"acceptanceMinutes\":20}").andExpect(status().isOk());
        var repeated=orders.create(EMAIL,command);
        assertThat(repeated.id()).isEqualTo(first.id());
        assertThat(repeated.acceptanceDeadline()).isEqualTo(first.acceptanceDeadline());
        assertThat(repeated.acceptanceMinutes()).isEqualTo(5);
        var second=orders.create(EMAIL,command());
        assertThat(second.acceptanceMinutes()).isEqualTo(20);
        assertThat(second.acceptanceDeadline()).isBetween(java.time.Instant.now().plusSeconds(1190),java.time.Instant.now().plusSeconds(1205));
    }

    @Test void deadlineIsCappedBySavedPickupClosingTime() throws Exception {
        settings("{\"acceptingOrders\":true,\"version\":0,\"cutoffMinutes\":0,\"acceptanceMinutes\":20}").andExpect(status().isOk());
        jdbc.update("UPDATE vendor_stops SET ends_at=clock_timestamp()+interval '2 minutes' WHERE id=?",stop);
        var order=orders.create(EMAIL,command());
        assertThat(order.acceptanceMinutes()).isEqualTo(20);
        assertThat(order.acceptanceDeadline()).isEqualTo(order.pickup().endsAt());
    }

    @Test void expirationIsAuditedOnceAndIdempotentCheckoutStillRecoversCancelledOrder() {
        var command=command(); var order=orders.create(EMAIL,command);
        jdbc.update("UPDATE customer_orders SET acceptance_deadline=clock_timestamp()-interval '1 second' WHERE id=?",order.id());
        assertThat(expiration.expireOne()).isTrue(); assertThat(expiration.expireOne()).isFalse();
        jdbc.update("UPDATE vendors SET accepting_orders=false WHERE id=?",vendor);
        jdbc.update("UPDATE vendor_stops SET ends_at=clock_timestamp()-interval '1 second' WHERE id=?",stop);
        var replay=orders.create(EMAIL,command);
        assertThat(replay.id()).isEqualTo(order.id()); assertThat(replay.status()).isEqualTo("CANCELLED");
        assertThat(replay.version()).isEqualTo(1); assertThat(replay.pickupCode()).isNull();
        assertThat(replay.cancellationReason()).isEqualTo(OrderExpirationService.REASON);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM customer_order_status_history WHERE order_id=?",Integer.class,order.id())).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT actor_kind FROM customer_order_status_history WHERE order_id=?",String.class,order.id())).isEqualTo("SYSTEM");
        assertThat(jdbc.queryForObject("SELECT changed_by_user_id FROM customer_order_status_history WHERE order_id=?",Long.class,order.id())).isNull();
        assertThat(jdbc.queryForObject("SELECT placed_count FROM vendor_order_signals WHERE vendor_id=?",Long.class,vendor)).isZero();
    }

    @Test void workerLagCannotPermitLateAcceptanceOrAnEstimateThatExtendsTheWait() throws Exception {
        var order=orders.create(EMAIL,command());
        jdbc.update("UPDATE customer_orders SET acceptance_deadline=clock_timestamp()-interval '1 second' WHERE id=?",order.id());
        String path="/api/operator/vendors/"+vendor+"/orders/"+order.id();
        mvc.perform(patch(path+"/status").with(TestAccounts.user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json")
            .content("{\"status\":\"ACCEPTED\",\"version\":0}")).andExpect(status().isConflict())
            .andExpect(jsonPath("$.detail").value("The acceptance deadline has passed or this order changed. Refresh its details."));
        mvc.perform(patch(path+"/estimate").with(TestAccounts.user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json")
            .content(json.writeValueAsString(Map.of("version",0,"estimatedReadyAt",java.time.Instant.now().plusSeconds(120)))))
            .andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("SELECT version FROM customer_orders WHERE id=?",Long.class,order.id())).isZero();
        assertThat(expiration.expireOne()).isTrue();
    }

    @Test void acceptedReadyAndLegacyOrdersDoNotExpire() {
        var accepted=orders.create(EMAIL,command());
        ownerOrders.update(EMAIL,vendor,accepted.id(),new OrderStatusRequest(OrderStatus.ACCEPTED,0L,null));
        var ready=orders.create(EMAIL,command());
        ownerOrders.update(EMAIL,vendor,ready.id(),new OrderStatusRequest(OrderStatus.ACCEPTED,0L,null));
        ownerOrders.update(EMAIL,vendor,ready.id(),new OrderStatusRequest(OrderStatus.READY,1L,null));
        var legacy=orders.create(EMAIL,command());
        jdbc.update("UPDATE customer_orders SET acceptance_deadline=clock_timestamp()-interval '1 second' WHERE vendor_id=?",vendor);
        jdbc.update("UPDATE customer_orders SET acceptance_deadline=NULL,acceptance_minutes=NULL WHERE id=?",legacy.id());
        assertThat(expiration.expireOne()).isFalse();
        assertThat(orders.get(EMAIL,accepted.id()).status()).isEqualTo("ACCEPTED");
        assertThat(orders.get(EMAIL,ready.id()).status()).isEqualTo("READY");
        assertThat(orders.get(EMAIL,legacy.id()).status()).isEqualTo("PLACED");
    }
}
