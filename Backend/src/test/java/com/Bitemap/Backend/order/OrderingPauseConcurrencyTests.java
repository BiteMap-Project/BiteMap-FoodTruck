package com.Bitemap.Backend.order;

import com.Bitemap.Backend.TestAccounts;
import com.Bitemap.Backend.vendor.OperatorVendorService;
import com.Bitemap.Backend.vendor.OrderingControl;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest
class OrderingPauseConcurrencyTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired OrderService orders;
    @Autowired OperatorVendorService vendors;
    @Autowired PlatformTransactionManager manager;

    @ParameterizedTest @ValueSource(booleans = {true, false})
    void firstVendorLockDeterminesWhetherTheNewOrderIsAccepted(boolean pauseFirst) throws Exception {
        String email = "pause-race-"+UUID.randomUUID()+"@example.test";
        long owner = TestAccounts.operator(jdbc,"Race",email,"unused");
        long vendor = jdbc.queryForObject("INSERT INTO vendors(name,category,location,operator_id) VALUES ('Race','Food','LA',?) RETURNING id",Long.class,owner);
        long stop = PickupOrderApiTests.activeStop(jdbc,vendor);
        long item = jdbc.queryForObject("INSERT INTO vendor_menu_items(vendor_id,name,price,availability_status) VALUES (?,'Taco',5,'ACTIVE') RETURNING id",Long.class,vendor);
        var command = new CreateOrderRequest(vendor,stop,UUID.randomUUID(),List.of(new CreateOrderRequest.Item(item,1)));
        var locked = new CountDownLatch(1);
        var release = new CountDownLatch(1);
        var attempted = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var first = executor.submit(() -> new TransactionTemplate(manager).execute(status -> {
                if (pauseFirst) vendors.updateOrdering(email,vendor,new OrderingControl.Update(false,0L));
                else orders.create(email,command);
                locked.countDown();
                await(release);
                return true;
            }));
            assertThat(locked.await(10,TimeUnit.SECONDS)).isTrue();
            var second = executor.submit(() -> {
                attempted.countDown();
                if (pauseFirst) {
                    assertThatThrownBy(() -> orders.create(email,command)).isInstanceOf(OrderUnavailableException.class)
                        .hasMessage("Temporarily not accepting orders.");
                } else vendors.updateOrdering(email,vendor,new OrderingControl.Update(false,0L));
                return true;
            });
            try { assertThat(attempted.await(10,TimeUnit.SECONDS)).isTrue(); }
            finally { release.countDown(); }
            assertThat(first.get(15,TimeUnit.SECONDS)).isTrue();
            assertThat(second.get(15,TimeUnit.SECONDS)).isTrue();
            assertThat(jdbc.queryForObject("SELECT count(*) FROM customer_orders WHERE vendor_id=?",Integer.class,vendor)).isEqualTo(pauseFirst?0:1);
            assertThat(vendors.ordering(email,vendor).acceptingOrders()).isFalse();
            if (!pauseFirst) assertThat(orders.create(email,command).vendorId()).isEqualTo(vendor);
        } finally {
            release.countDown();
            jdbc.update("DELETE FROM customer_orders WHERE vendor_id=?",vendor);
            jdbc.update("DELETE FROM vendor_menu_items WHERE vendor_id=?",vendor);
            jdbc.update("DELETE FROM vendor_stops WHERE vendor_id=?",vendor);
            jdbc.update("DELETE FROM vendors WHERE id=?",vendor);
            TestAccounts.deleteOperator(jdbc,owner);
        }
    }
    private static void await(CountDownLatch latch) {
        try { if (!latch.await(10,TimeUnit.SECONDS)) throw new IllegalStateException("Timed out"); }
        catch (InterruptedException e) { Thread.currentThread().interrupt(); throw new IllegalStateException(e); }
    }
}
