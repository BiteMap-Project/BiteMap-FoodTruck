package com.Bitemap.Backend.order;

import com.Bitemap.Backend.TestAccounts;
import com.Bitemap.Backend.location.management.OperatorStopService;
import com.Bitemap.Backend.location.management.StopRequests;
import com.Bitemap.Backend.location.management.ScheduleException;
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

@SpringBootTest
class PickupConcurrencyTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired OrderService orders;
    @Autowired OperatorStopService stops;

    @Test void checkoutAndCancellationCannotBothSucceed() throws Exception {
        String email="pickup-race-"+UUID.randomUUID()+"@example.com";
        long operator=TestAccounts.operator(jdbc,"Pickup race",email,"unused");
        long vendor=jdbc.queryForObject("INSERT INTO vendors(name,category,location,operator_id) VALUES ('Pickup race','Food','CSUN',?) RETURNING id",Long.class,operator);
        long stop=PickupOrderApiTests.activeStop(jdbc,vendor);
        long item=jdbc.queryForObject("INSERT INTO vendor_menu_items(vendor_id,name,price,availability_status) VALUES (?,'Taco',5,'ACTIVE') RETURNING id",Long.class,vendor);
        var ready=new CountDownLatch(2);
        var start=new CountDownLatch(1);
        try (var executor=Executors.newFixedThreadPool(2)) {
            var checkout=executor.submit(()->{
                ready.countDown();
                if(!start.await(10,TimeUnit.SECONDS)) throw new IllegalStateException("Timed out");
                try { orders.create(email,new CreateOrderRequest(vendor,stop,UUID.randomUUID(),List.of(new CreateOrderRequest.Item(item,1)))); return true; }
                catch(OrderUnavailableException expected) { return false; }
            });
            var cancellation=executor.submit(()->{
                ready.countDown();
                if(!start.await(10,TimeUnit.SECONDS)) throw new IllegalStateException("Timed out");
                try { stops.cancel(email,vendor,stop,new StopRequests.Cancel(0L)); return true; }
                catch(ScheduleException expected) { assertThat(expected.kind()).isEqualTo(ScheduleException.Kind.CONFLICT); return false; }
            });
            try { assertThat(ready.await(10,TimeUnit.SECONDS)).isTrue(); }
            finally { start.countDown(); }
            boolean ordered=checkout.get(20,TimeUnit.SECONDS);
            boolean cancelled=cancellation.get(20,TimeUnit.SECONDS);
            assertThat(ordered).isNotEqualTo(cancelled);
            assertThat(jdbc.queryForObject("SELECT count(*) FROM customer_orders WHERE vendor_id=?",Integer.class,vendor)).isEqualTo(ordered?1:0);
            assertThat(jdbc.queryForObject("SELECT status FROM vendor_stops WHERE id=?",String.class,stop)).isEqualTo(cancelled?"cancelled":"scheduled");
        } finally {
            jdbc.update("DELETE FROM customer_orders WHERE vendor_id=?",vendor);
            jdbc.update("DELETE FROM vendor_menu_items WHERE vendor_id=?",vendor);
            jdbc.update("DELETE FROM vendor_stops WHERE vendor_id=?",vendor);
            jdbc.update("DELETE FROM vendors WHERE id=?",vendor);
            TestAccounts.deleteOperator(jdbc,operator);
        }
    }
}
