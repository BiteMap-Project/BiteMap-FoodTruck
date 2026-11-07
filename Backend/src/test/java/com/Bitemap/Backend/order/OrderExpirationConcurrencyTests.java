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
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;

/** Uses committed transactions on disposable PostgreSQL, not an outer rollback-only test. */
@SpringBootTest
class OrderExpirationConcurrencyTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired OrderService orders;
    @Autowired OperatorOrderService owners;
    @Autowired OrderExpirationService expiration;
    @Autowired PlatformTransactionManager manager;
    String email; long operator,user,vendor,order;

    @BeforeEach void seed() {
        email="expiration-race-"+UUID.randomUUID()+"@example.test";
        operator=TestAccounts.operator(jdbc,"Expiration",email,"unused");
        user=jdbc.queryForObject("SELECT user_id FROM operators WHERE id=?",Long.class,operator);
        vendor=jdbc.queryForObject("INSERT INTO vendors(name,category,location,operator_id) VALUES ('Expiration','Food','LA',?) RETURNING id",Long.class,operator);
        long stop=PickupOrderApiTests.activeStop(jdbc,vendor);
        long item=jdbc.queryForObject("INSERT INTO vendor_menu_items(vendor_id,name,price,availability_status) VALUES (?,'Taco',5,'ACTIVE') RETURNING id",Long.class,vendor);
        order=orders.create(email,new CreateOrderRequest(vendor,stop,UUID.randomUUID(),List.of(new CreateOrderRequest.Item(item,1)))).id();
    }
    @AfterEach void clean() {
        jdbc.update("DELETE FROM customer_orders WHERE vendor_id=?",vendor);
        jdbc.update("DELETE FROM vendor_menu_items WHERE vendor_id=?",vendor);
        jdbc.update("DELETE FROM vendor_stops WHERE vendor_id=?",vendor);
        jdbc.update("DELETE FROM vendors WHERE id=?",vendor);
        jdbc.update("DELETE FROM operators WHERE id=?",operator);
        jdbc.update("DELETE FROM app_users WHERE id=?",user);
    }
    void due() { jdbc.update("UPDATE customer_orders SET acceptance_deadline=clock_timestamp()-interval '1 second' WHERE id=?",order); }
    static void await(CountDownLatch latch) { try { if(!latch.await(10,TimeUnit.SECONDS)) throw new IllegalStateException("Timed out"); } catch(InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException(e); } }

    @ParameterizedTest @ValueSource(booleans={true,false})
    void acceptanceAndExpirationNeverBothWin(boolean acceptFirst) throws Exception {
        if(!acceptFirst) due();
        var locked=new CountDownLatch(1); var release=new CountDownLatch(1); var attempted=new CountDownLatch(1);
        try(var executor=Executors.newFixedThreadPool(2)) {
            var first=executor.submit(()->new TransactionTemplate(manager).execute(tx->{
                if(acceptFirst) { owners.update(email,vendor,order,new OrderStatusRequest(OrderStatus.ACCEPTED,0L,null)); due(); }
                else assertThat(expiration.expireOne()).isTrue();
                locked.countDown(); await(release); return true;
            }));
            assertThat(locked.await(10,TimeUnit.SECONDS)).isTrue();
            var second=executor.submit(()->{
                attempted.countDown();
                if(acceptFirst) assertThat(expiration.expireOne()).isFalse();
                else assertThatThrownBy(()->owners.update(email,vendor,order,new OrderStatusRequest(OrderStatus.ACCEPTED,0L,null))).isInstanceOf(OperatorOrderException.class);
                return true;
            });
            try { assertThat(attempted.await(10,TimeUnit.SECONDS)).isTrue(); } finally { release.countDown(); }
            assertThat(first.get(15,TimeUnit.SECONDS)).isTrue(); assertThat(second.get(15,TimeUnit.SECONDS)).isTrue();
            assertThat(expiration.expireOne()).isFalse();
            assertThat(jdbc.queryForObject("SELECT status FROM customer_orders WHERE id=?",String.class,order)).isEqualTo(acceptFirst?"ACCEPTED":"CANCELLED");
            assertThat(jdbc.queryForObject("SELECT count(*) FROM customer_order_status_history WHERE order_id=?",Integer.class,order)).isEqualTo(1);
        } finally { release.countDown(); }
    }

    @Test void twoWorkersCancelOnlyOnce() throws Exception {
        due(); var start=new CountDownLatch(1);
        try(var executor=Executors.newFixedThreadPool(2)) {
            var jobs=List.of(1,2).stream().map(i->executor.submit(()->{await(start);return expiration.expireOne();})).toList();
            start.countDown();
            int successes=0;
            for(var job:jobs) if(job.get(15,TimeUnit.SECONDS)) successes++;
            assertThat(successes).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT version FROM customer_orders WHERE id=?",Long.class,order)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM customer_order_status_history WHERE order_id=?",Integer.class,order)).isEqualTo(1);
        }
    }

    @Test void auditFailureRollsBackCancellationAndSignals() {
        due();
        long revision=jdbc.queryForObject("SELECT revision FROM vendor_order_signals WHERE vendor_id=?",Long.class,vendor);
        jdbc.execute("ALTER TABLE customer_order_status_history ADD CONSTRAINT acceptance_test_audit_failure CHECK (actor_kind='USER')");
        try {
            assertThatThrownBy(expiration::expireOne).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
            assertThat(jdbc.queryForObject("SELECT status FROM customer_orders WHERE id=?",String.class,order)).isEqualTo("PLACED");
            assertThat(jdbc.queryForObject("SELECT version FROM customer_orders WHERE id=?",Long.class,order)).isZero();
            assertThat(jdbc.queryForObject("SELECT revision FROM vendor_order_signals WHERE vendor_id=?",Long.class,vendor)).isEqualTo(revision);
        } finally { jdbc.execute("ALTER TABLE customer_order_status_history DROP CONSTRAINT acceptance_test_audit_failure"); }
        assertThat(expiration.expireOne()).isTrue();
    }

    @Test void aRequestWaitingOnTheOrderLockCannotUseItsEarlierStartTime() throws Exception {
        var locked=new CountDownLatch(1); var release=new CountDownLatch(1); var attempted=new CountDownLatch(1);
        try(var executor=Executors.newFixedThreadPool(2)) {
            var first=executor.submit(()->new TransactionTemplate(manager).execute(tx->{
                jdbc.queryForObject("SELECT id FROM customer_orders WHERE id=? FOR UPDATE",Long.class,order);
                due(); locked.countDown(); await(release); return true;
            }));
            assertThat(locked.await(10,TimeUnit.SECONDS)).isTrue();
            var second=executor.submit(()->{attempted.countDown();
                assertThatThrownBy(()->owners.update(email,vendor,order,new OrderStatusRequest(OrderStatus.ACCEPTED,0L,null)))
                    .isInstanceOf(OperatorOrderException.class).hasMessageContaining("deadline has passed"); return true;
            });
            try { assertThat(attempted.await(10,TimeUnit.SECONDS)).isTrue(); } finally { release.countDown(); }
            assertThat(first.get(15,TimeUnit.SECONDS)).isTrue(); assertThat(second.get(15,TimeUnit.SECONDS)).isTrue();
            assertThat(expiration.expireOne()).isTrue();
        } finally { release.countDown(); }
    }
}
