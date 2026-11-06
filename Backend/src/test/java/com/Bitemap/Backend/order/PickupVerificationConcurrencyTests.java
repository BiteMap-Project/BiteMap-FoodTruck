package com.Bitemap.Backend.order;

import com.Bitemap.Backend.TestAccounts;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.assertThat;

/** Real committed transactions, not a rollback-only test: failures must survive the response. */
@SpringBootTest
class PickupVerificationConcurrencyTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired OperatorOrderService owners;
    @Autowired OrderService customers;

    @Test void legacyReadsAndVerificationShareLockOrder() throws Exception {
        String email="pickup-legacy-"+UUID.randomUUID()+"@example.com";
        long operator=TestAccounts.operator(jdbc,"Legacy",email,"unused");
        long user=jdbc.queryForObject("SELECT user_id FROM operators WHERE id=?",Long.class,operator);
        long vendor=jdbc.queryForObject("INSERT INTO vendors(name,category,location,operator_id) VALUES ('Legacy','Food','Campus',?) RETURNING id",Long.class,operator);
        long order=jdbc.queryForObject("INSERT INTO customer_orders(customer_user_id,vendor_id,idempotency_key,status,total) VALUES (?,? ,?,'READY',0) RETURNING id",Long.class,user,vendor,UUID.randomUUID());
        try(var executor=Executors.newFixedThreadPool(3)) {
            var start=new CountDownLatch(1);
            var first=executor.submit(()->{ start.await(); return customers.get(email,order).pickupCode(); });
            var second=executor.submit(()->{ start.await(); return customers.get(email,order).pickupCode(); });
            var verify=executor.submit(()->{ start.await(); return owners.verifyPickup(email,vendor,order,new VerifyPickupRequest("123456",0L)); });
            start.countDown();
            String a=first.get(15,TimeUnit.SECONDS), b=second.get(15,TimeUnit.SECONDS);
            verify.get(15,TimeUnit.SECONDS);
            // A lucky guess may finish the order before a read; otherwise both reads see the same code.
            if(a!=null && b!=null) assertThat(a).isEqualTo(b);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM order_pickup_codes WHERE order_id=?",Integer.class,order)).isEqualTo(1);
        } finally {
            jdbc.update("DELETE FROM customer_orders WHERE id=?",order);
            jdbc.update("DELETE FROM vendors WHERE id=?",vendor);
            jdbc.update("DELETE FROM operators WHERE id=?",operator);
            jdbc.update("DELETE FROM app_users WHERE id=?",user);
        }
    }

    @Test void concurrentVerificationAndCooldownAreDurable() throws Exception {
        String email="pickup-race-"+UUID.randomUUID()+"@example.com";
        long operator=TestAccounts.operator(jdbc,"Pickup",email,"unused");
        long user=jdbc.queryForObject("SELECT user_id FROM operators WHERE id=?",Long.class,operator);
        long vendor=jdbc.queryForObject("INSERT INTO vendors(name,category,location,operator_id) VALUES ('Pickup','Food','Campus',?) RETURNING id",Long.class,operator);
        long order=jdbc.queryForObject("INSERT INTO customer_orders(customer_user_id,vendor_id,idempotency_key,status,total) VALUES (?,? ,?,'READY',0) RETURNING id",Long.class,user,vendor,UUID.randomUUID());
        try {
            String code=customers.get(email,order).pickupCode();
            String wrong=code.equals("000000")?"000001":"000000";
            for(int i=0;i<5;i++) assertThat(owners.verifyPickup(email,vendor,order,new VerifyPickupRequest(wrong,0L)).failure()).isNotNull();
            assertThat(jdbc.queryForObject("SELECT failed_attempts FROM order_pickup_codes WHERE order_id=?",Integer.class,order)).isEqualTo(5);
            assertThat(owners.verifyPickup(email,vendor,order,new VerifyPickupRequest(code,0L)).failure().status()).isEqualTo(429);
            jdbc.update("UPDATE order_pickup_codes SET locked_until=clock_timestamp()-interval '1 second' WHERE order_id=?",order);
            var start=new CountDownLatch(1);
            try(var executor=Executors.newFixedThreadPool(2)) {
                var futures=List.of(1,2).stream().map(i->executor.submit(()->{
                    if(!start.await(5,TimeUnit.SECONDS)) throw new IllegalStateException("Timed out");
                    return owners.verifyPickup(email,vendor,order,new VerifyPickupRequest(code,0L));
                })).toList();
                start.countDown();
                for(var future:futures) {
                    var result=future.get(15,TimeUnit.SECONDS);
                    assertThat(result.failure()).isNull();
                    assertThat(result.order().status()).isEqualTo(OrderStatus.COMPLETED);
                    assertThat(result.order().version()).isEqualTo(1);
                }
            }
            assertThat(jdbc.queryForObject("SELECT count(*) FROM customer_order_status_history WHERE order_id=?",Integer.class,order)).isEqualTo(1);
            assertThat(customers.get(email,order).pickupCode()).isNull();
        } finally {
            jdbc.update("DELETE FROM customer_orders WHERE id=?",order);
            jdbc.update("DELETE FROM vendors WHERE id=?",vendor);
            jdbc.update("DELETE FROM operators WHERE id=?",operator);
            jdbc.update("DELETE FROM app_users WHERE id=?",user);
        }
    }
}
