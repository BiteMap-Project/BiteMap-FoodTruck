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
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class CustomerCancellationApiTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    static final String EMAIL = "cancel-customer@example.test";
    long customer, vendor, order;

    @BeforeEach void seed() {
        customer = jdbc.queryForObject("INSERT INTO app_users(display_name,email,password_hash) VALUES ('Customer',?,'unused') RETURNING id",Long.class,EMAIL);
        jdbc.update("INSERT INTO app_user_roles(user_id,role) VALUES (?,'CUSTOMER')",customer);
        long other = jdbc.queryForObject("INSERT INTO app_users(display_name,email,password_hash) VALUES ('Other','cancel-other@example.test','unused') RETURNING id",Long.class);
        jdbc.update("INSERT INTO app_user_roles(user_id,role) VALUES (?,'CUSTOMER')",other);
        vendor = jdbc.queryForObject("INSERT INTO vendors(name,category,location) VALUES ('Cancel truck','Food','CSUN') RETURNING id",Long.class);
        order = jdbc.queryForObject("INSERT INTO customer_orders(customer_user_id,vendor_id,idempotency_key,total) VALUES (?,?,?,0) RETURNING id",Long.class,customer,vendor,UUID.randomUUID());
    }
    String path() { return "/api/customer/orders/" + order + "/cancel"; }
    org.springframework.test.web.servlet.ResultActions cancel(String email, String body) throws Exception {
        return mvc.perform(post(path()).with(TestAccounts.user(email).roles("CUSTOMER")).with(csrf()).contentType("application/json").content(body));
    }
    @Test void cancelsPlacedOrderAndReplaysExactlyOnce() throws Exception {
        for (int i=0;i<2;i++) cancel(EMAIL,"{\"version\":0}")
            .andExpect(status().isOk()).andExpect(header().string("Cache-Control","no-store"))
            .andExpect(jsonPath("$.status").value("CANCELLED")).andExpect(jsonPath("$.version").value(1))
            .andExpect(jsonPath("$.cancellationReason").value("Cancelled by customer."));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM customer_order_status_history WHERE order_id=?",Integer.class,order)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT changed_by_user_id FROM customer_order_status_history WHERE order_id=?",Long.class,order)).isEqualTo(customer);
    }
    @Test void rejectsForeignMissingAnonymousAndMissingCsrf() throws Exception {
        cancel("cancel-other@example.test","{\"version\":0}").andExpect(status().isNotFound());
        mvc.perform(post(path()).with(csrf()).contentType("application/json").content("{\"version\":0}")).andExpect(status().isUnauthorized());
        mvc.perform(post(path()).with(TestAccounts.user(EMAIL).roles("CUSTOMER")).contentType("application/json").content("{\"version\":0}")).andExpect(status().isForbidden());
        order = Long.MAX_VALUE;
        cancel(EMAIL,"{\"version\":0}").andExpect(status().isNotFound());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM customer_order_status_history",Integer.class)).isZero();
    }
    @ParameterizedTest @ValueSource(strings={"ACCEPTED","READY","COMPLETED","CANCELLED"})
    void cannotCancelAfterOwnerHasActed(String status) throws Exception {
        jdbc.update("UPDATE customer_orders SET status=?,version=1 WHERE id=?",status,order);
        cancel(EMAIL,"{\"version\":0}").andExpect(status().isConflict());
        cancel(EMAIL,"{\"version\":1}").andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("SELECT status FROM customer_orders WHERE id=?",String.class,order)).isEqualTo(status);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM customer_order_status_history",Integer.class)).isZero();
    }
    @Test void staleVersionDoesNotCancelAndFreshVersionCan() throws Exception {
        jdbc.update("UPDATE customer_orders SET version=1 WHERE id=?",order);
        cancel(EMAIL,"{\"version\":0}").andExpect(status().isConflict());
        assertThat(jdbc.queryForObject("SELECT status FROM customer_orders WHERE id=?",String.class,order)).isEqualTo("PLACED");
        cancel(EMAIL,"{\"version\":1}").andExpect(status().isOk()).andExpect(jsonPath("$.version").value(2));
    }
    @ParameterizedTest @ValueSource(strings={"{}","{\"version\":null}","{\"version\":-1}","{\"version\":1.5}","{\"version\":\"0\"}"})
    void validatesVersionWithoutWriting(String body) throws Exception {
        cancel(EMAIL,body).andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("SELECT version FROM customer_orders WHERE id=?",Long.class,order)).isZero();
    }
}
