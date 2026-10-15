package com.Bitemap.Backend.order;

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

/** Separate committed transactions are essential: a transactional test would hide fixtures from workers. */
@SpringBootTest
class OrderConcurrencyTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired OrderService service;

    @Test
    void simultaneousRetriesCreateExactlyOneOrder() throws Exception { race(false); }

    @Test
    void simultaneousDifferentCartsWithOneKeyConflict() throws Exception { race(true); }

    private void race(boolean differentCart) throws Exception {
        String email = "checkout-race-" + UUID.randomUUID() + "@example.com";
        long customer = jdbc.queryForObject("INSERT INTO app_users(display_name,email,password_hash) VALUES ('Race',?,'unused') RETURNING id", Long.class, email);
        long vendor = 0;
        try {
            jdbc.update("INSERT INTO app_user_roles(user_id,role) VALUES (?,'CUSTOMER')", customer);
            vendor = jdbc.queryForObject("INSERT INTO vendors(name,category,location) VALUES ('Race','Food','CSUN') RETURNING id", Long.class);
            long item = jdbc.queryForObject("INSERT INTO vendor_menu_items(vendor_id,name,price,availability_status) VALUES (?,'Taco',4.25,'ACTIVE') RETURNING id", Long.class, vendor);
            UUID key = UUID.randomUUID();
            var first = new CreateOrderRequest(vendor, key, List.of(new CreateOrderRequest.Item(item, 1)));
            var second = new CreateOrderRequest(vendor, key, List.of(new CreateOrderRequest.Item(item, differentCart ? 2 : 1)));
            var ready = new CountDownLatch(2);
            var start = new CountDownLatch(1);
            try (var executor = Executors.newFixedThreadPool(2)) {
                var futures = List.of(first, second).stream().map(request -> executor.submit(() -> {
                    ready.countDown();
                    if (!start.await(10, TimeUnit.SECONDS)) throw new IllegalStateException("Worker start timed out");
                    try { return (Object) service.create(email, request); }
                    catch (OrderKeyConflictException expected) { return expected; }
                })).toList();
                try { assertThat(ready.await(10, TimeUnit.SECONDS)).isTrue(); }
                finally { start.countDown(); }
                Object a = futures.get(0).get(20, TimeUnit.SECONDS);
                Object b = futures.get(1).get(20, TimeUnit.SECONDS);
                if (differentCart) {
                    assertThat(List.of(a,b).stream().filter(OrderResponse.class::isInstance).count()).isEqualTo(1);
                    assertThat(List.of(a,b).stream().filter(OrderKeyConflictException.class::isInstance).count()).isEqualTo(1);
                } else {
                    assertThat(a).isInstanceOf(OrderResponse.class);
                    assertThat(b).isInstanceOf(OrderResponse.class);
                    assertThat(((OrderResponse)a).id()).isEqualTo(((OrderResponse)b).id());
                }
                assertThat(jdbc.queryForObject("SELECT count(*) FROM customer_orders WHERE customer_user_id=?", Integer.class, customer)).isEqualTo(1);
            }
        } finally {
            jdbc.update("DELETE FROM customer_orders WHERE customer_user_id=?", customer);
            if (vendor != 0) {
                jdbc.update("DELETE FROM vendor_menu_items WHERE vendor_id=?", vendor);
                jdbc.update("DELETE FROM vendors WHERE id=?", vendor);
            }
            jdbc.update("DELETE FROM app_users WHERE id=?", customer);
        }
    }
}
