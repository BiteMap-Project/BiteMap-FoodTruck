package com.Bitemap.Backend.order;

import com.Bitemap.Backend.TestAccounts;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest
class OperatorOrderTransactionTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired OperatorOrderService service;
    String email;
    long operator, user, vendor, order;

    @BeforeEach
    void seedCommittedFixtures() {
        email = "owner-order-race-" + UUID.randomUUID() + "@example.com";
        operator = TestAccounts.operator(jdbc,"Owner",email,"unused");
        user = jdbc.queryForObject("SELECT user_id FROM operators WHERE id=?",Long.class,operator);
        vendor = jdbc.queryForObject("INSERT INTO vendors(name,category,location,operator_id) VALUES ('Race','Food','CSUN',?) RETURNING id",Long.class,operator);
        order = jdbc.queryForObject("INSERT INTO customer_orders(customer_user_id,vendor_id,idempotency_key,total) VALUES (?,?,?,0) RETURNING id",
                Long.class,user,vendor,UUID.randomUUID());
    }

    @AfterEach
    void cleanup() {
        jdbc.update("DELETE FROM customer_orders WHERE id=?",order);
        jdbc.update("DELETE FROM vendors WHERE id=?",vendor);
        TestAccounts.deleteOperator(jdbc,operator);
    }

    @Test
    void concurrentAcceptAndCancelHaveOneWinnerAndOneAuditEvent() throws Exception {
        race(new OrderStatusRequest(OrderStatus.ACCEPTED,0L,null),new OrderStatusRequest(OrderStatus.CANCELLED,0L,"Closed"));
    }

    @Test
    void concurrentIdenticalRequestsDoNotAdvanceOrAuditTwice() throws Exception {
        race(new OrderStatusRequest(OrderStatus.ACCEPTED,0L,null),new OrderStatusRequest(OrderStatus.ACCEPTED,0L,null));
    }

    private void race(OrderStatusRequest first, OrderStatusRequest second) throws Exception {
        var ready = new CountDownLatch(2);
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var futures = List.of(first,second).stream().map(request -> executor.submit(() -> {
                ready.countDown();
                if (!start.await(10,TimeUnit.SECONDS)) throw new IllegalStateException("Worker start timed out");
                try { return (Object) service.update(email,vendor,order,request); }
                catch (OperatorOrderException expected) { return expected; }
            })).toList();
            try { assertThat(ready.await(10,TimeUnit.SECONDS)).isTrue(); }
            finally { start.countDown(); }
            var results = List.of(futures.get(0).get(20,TimeUnit.SECONDS),futures.get(1).get(20,TimeUnit.SECONDS));
            assertThat(results.stream().filter(OperatorOrderResponse.class::isInstance).count()).isEqualTo(1);
            assertThat(results.stream().filter(OperatorOrderException.class::isInstance).map(OperatorOrderException.class::cast)
                    .map(OperatorOrderException::kind).toList()).containsExactly(OperatorOrderException.Kind.CONFLICT);
            assertThat(jdbc.queryForObject("SELECT version FROM customer_orders WHERE id=?",Long.class,order)).isEqualTo(1L);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM customer_order_status_history WHERE order_id=?",Integer.class,order)).isEqualTo(1);
        }
    }

    @Test
    void auditInsertFailureRollsBackTheStatusAndVersion() {
        // Force a real unique-constraint failure after the UPDATE, inside the service transaction.
        jdbc.update("INSERT INTO customer_order_status_history(order_id,from_status,to_status,version,changed_by_user_id) VALUES (?,'PLACED','ACCEPTED',1,?)",order,user);
        assertThatThrownBy(() -> service.update(email,vendor,order,new OrderStatusRequest(OrderStatus.ACCEPTED,0L,null)))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(jdbc.queryForObject("SELECT status FROM customer_orders WHERE id=?",String.class,order)).isEqualTo("PLACED");
        assertThat(jdbc.queryForObject("SELECT version FROM customer_orders WHERE id=?",Long.class,order)).isZero();
    }

    @Test
    void serviceRechecksRoleAndTruckOwnershipWithoutWebSecurity() {
        jdbc.update("DELETE FROM app_user_roles WHERE user_id=? AND role='OPERATOR'",user);
        assertThatThrownBy(() -> service.get(email,vendor,order)).isInstanceOfSatisfying(OperatorOrderException.class,
                e -> assertThat(e.kind()).isEqualTo(OperatorOrderException.Kind.FORBIDDEN));
        jdbc.update("INSERT INTO app_user_roles(user_id,role) VALUES (?,'OPERATOR')",user);
        jdbc.update("UPDATE vendors SET operator_id=NULL WHERE id=?",vendor);
        assertThatThrownBy(() -> service.update(email,vendor,order,new OrderStatusRequest(OrderStatus.ACCEPTED,0L,null)))
                .isInstanceOfSatisfying(OperatorOrderException.class,e -> assertThat(e.kind()).isEqualTo(OperatorOrderException.Kind.NOT_FOUND));
    }
}
