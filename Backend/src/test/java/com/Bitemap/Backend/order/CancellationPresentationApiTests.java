package com.Bitemap.Backend.order;

import com.Bitemap.Backend.TestAccounts;
import java.util.UUID;
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
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @AutoConfigureMockMvc @Transactional
class CancellationPresentationApiTests {
    static final String EMAIL="cancellation-view@example.test";
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired OperatorOrderService owners;
    @Autowired OrderExpirationService expiration;
    long order, vendor;

    @BeforeEach void seed() {
        long operator=TestAccounts.operator(jdbc,"Owner customer",EMAIL,"unused");
        TestAccounts.operator(jdbc,"Unrelated account","other@example.test","unused");
        long user=jdbc.queryForObject("SELECT user_id FROM operators WHERE id=?",Long.class,operator);
        vendor=jdbc.queryForObject("INSERT INTO vendors(name,category,location,operator_id) VALUES ('Truck','Food','LA',?) RETURNING id",Long.class,operator);
        order=jdbc.queryForObject("INSERT INTO customer_orders(customer_user_id,vendor_id,idempotency_key,total) VALUES (?,?,?,5) RETURNING id",Long.class,user,vendor,UUID.randomUUID());
    }

    @ParameterizedTest @ValueSource(strings={"CUSTOMER","OWNER","ACCEPTANCE_TIMEOUT"})
    void returnsExplicitSourceAndReasonInDetailsAndHistoryEvenForDualRoleAccounts(String source) throws Exception {
        if(source.equals("CUSTOMER")) {
            mvc.perform(post("/api/customer/orders/"+order+"/cancel").with(TestAccounts.user(EMAIL).roles("CUSTOMER")).with(csrf())
                .contentType("application/json").content("{\"version\":0}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.cancellationSource").value(source));
        } else if(source.equals("OWNER")) {
            owners.update(EMAIL,vendor,order,new OrderStatusRequest(OrderStatus.CANCELLED,0L,"Kitchen closed"));
        } else {
            jdbc.update("UPDATE customer_orders SET acceptance_minutes=5,acceptance_deadline=clock_timestamp()-interval '1 second' WHERE id=?",order);
            org.assertj.core.api.Assertions.assertThat(expiration.expireOne()).isTrue();
        }
        String reason=source.equals("CUSTOMER")?"Cancelled by customer.":source.equals("OWNER")?"Kitchen closed":OrderExpirationService.REASON;
        mvc.perform(get("/api/customer/orders/"+order).with(TestAccounts.user(EMAIL).roles("CUSTOMER")))
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(jsonPath("$.cancellationSource").value(source)).andExpect(jsonPath("$.cancellationReason").value(reason))
            .andExpect(jsonPath("$.changedByUserId").doesNotExist()).andExpect(jsonPath("$.pickupCode").isEmpty());
        mvc.perform(get("/api/customer/orders").with(TestAccounts.user(EMAIL).roles("CUSTOMER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].cancellationSource").value(source))
            .andExpect(jsonPath("$.items[0].cancellationReason").value(reason));
        mvc.perform(get("/api/customer/orders/"+order).with(TestAccounts.user("other@example.test").roles("CUSTOMER")))
            .andExpect(status().isNotFound());
        mvc.perform(get("/api/customer/orders").with(TestAccounts.user("other@example.test").roles("CUSTOMER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty());
    }

    @Test void legacyCancellationKeepsItsReasonWithoutGuessingASource() throws Exception {
        jdbc.update("UPDATE customer_orders SET status='CANCELLED',cancellation_reason='Historical reason' WHERE id=?",order);
        mvc.perform(get("/api/customer/orders").with(TestAccounts.user(EMAIL).roles("CUSTOMER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].cancellationSource").isEmpty())
            .andExpect(jsonPath("$.items[0].cancellationReason").value("Historical reason"));
    }
}
