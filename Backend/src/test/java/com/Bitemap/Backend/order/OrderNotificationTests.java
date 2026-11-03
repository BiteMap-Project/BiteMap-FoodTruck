package com.Bitemap.Backend.order;

import com.Bitemap.Backend.TestAccounts;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.asyncDispatch;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @AutoConfigureMockMvc @Transactional
class OrderNotificationTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired MockMvc mvc;
    @Autowired OrderSignalReader reader;
    long vendor, user, order;
    String email = "notifications@example.test";
    @BeforeEach void seed() {
        long operator = TestAccounts.operator(jdbc,"Owner",email,"unused");
        user = jdbc.queryForObject("SELECT user_id FROM operators WHERE id=?",Long.class,operator);
        vendor = jdbc.queryForObject("INSERT INTO vendors(name,category,location,operator_id) VALUES ('Truck','Food','CSUN',?) RETURNING id",Long.class,operator);
        order = jdbc.queryForObject("INSERT INTO customer_orders(customer_user_id,vendor_id,idempotency_key,total) VALUES (?,?,gen_random_uuid(),0) RETURNING id",Long.class,user,vendor);
    }
    String path() { return "/api/operator/vendors/"+vendor+"/order-events"; }
    @Test void changesAreDurableAtomicAndCancellationIsNotANewOrder() {
        assertThat(jdbc.queryForMap("SELECT revision,created_count,placed_count FROM vendor_order_signals WHERE vendor_id=?",vendor))
            .containsEntry("revision",1L).containsEntry("created_count",1L).containsEntry("placed_count",1L);
        jdbc.execute("SAVEPOINT before_notification");
        jdbc.update("UPDATE customer_orders SET status='CANCELLED',version=version+1 WHERE id=?",order);
        assertThat(jdbc.queryForMap("SELECT revision,created_count,placed_count FROM vendor_order_signals WHERE vendor_id=?",vendor))
            .containsEntry("revision",2L).containsEntry("created_count",1L).containsEntry("placed_count",0L);
        jdbc.execute("ROLLBACK TO SAVEPOINT before_notification");
        assertThat(jdbc.queryForObject("SELECT revision FROM vendor_order_signals WHERE vendor_id=?",Long.class,vendor)).isEqualTo(1L);
    }
    @Test void ownerStreamIsPrivateAndStartsWithAnAuthoritativeSnapshot() throws Exception {
        var result = mvc.perform(get(path()).with(TestAccounts.user(email).roles("OPERATOR")))
            .andExpect(status().isOk()).andExpect(request().asyncStarted())
            .andExpect(header().string("Cache-Control","no-store"))
            .andExpect(header().string("X-Accel-Buffering","no"))
            .andReturn();
        assertThat(result.getResponse().getContentAsString()).contains("event:orders","\"createdCount\":1","\"placedCount\":1");
        result.getRequest().getSession().invalidate();
        mvc.perform(asyncDispatch(result)).andExpect(status().isOk());
    }
    @Test void anonymousCustomerAndUnrelatedOwnerCannotSubscribe() throws Exception {
        mvc.perform(get(path())).andExpect(status().isUnauthorized());
        mvc.perform(get(path()).with(TestAccounts.user(email).roles("CUSTOMER"))).andExpect(status().isForbidden());
        TestAccounts.operator(jdbc,"Other","other-notifications@example.test","unused");
        mvc.perform(get(path()).with(TestAccounts.user("other-notifications@example.test").roles("OPERATOR"))).andExpect(status().isNotFound());
        mvc.perform(get("/api/customer/orders/"+order+"/events").with(TestAccounts.user("other-notifications@example.test").roles("CUSTOMER"))).andExpect(status().isNotFound());
    }
    @Test void customerStreamOnlyReturnsTheVersionNotOrderContents() throws Exception {
        var result = mvc.perform(get("/api/customer/orders/"+order+"/events").with(TestAccounts.user(email).roles("CUSTOMER")))
            .andExpect(status().isOk()).andExpect(request().asyncStarted()).andReturn();
        assertThat(result.getResponse().getContentAsString()).contains("event:orders","\"revision\":\"0\"").doesNotContain("total","email","items");
        result.getRequest().getSession().invalidate();
    }
    @Test void everySnapshotRechecksCredentialsRoleAndVendorOwnership() {
        var principal=new com.Bitemap.Backend.auth.AccountPrincipal(user,email,"",true,java.util.List.of());
        assertThat(reader.read(principal,vendor,true).placedCount()).isEqualTo(1);
        jdbc.update("UPDATE app_users SET credential_version=1 WHERE id=?",user);
        org.assertj.core.api.Assertions.assertThatThrownBy(()->reader.read(principal,vendor,true)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        jdbc.update("UPDATE app_users SET credential_version=0 WHERE id=?",user);
        jdbc.update("DELETE FROM app_user_roles WHERE user_id=? AND role='OPERATOR'",user);
        org.assertj.core.api.Assertions.assertThatThrownBy(()->reader.read(principal,vendor,true)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
        jdbc.update("INSERT INTO app_user_roles(user_id,role) VALUES (?,'OPERATOR')",user);
        jdbc.update("UPDATE vendors SET operator_id=NULL WHERE id=?",vendor);
        org.assertj.core.api.Assertions.assertThatThrownBy(()->reader.read(principal,vendor,true)).isInstanceOf(org.springframework.web.server.ResponseStatusException.class);
    }
}
