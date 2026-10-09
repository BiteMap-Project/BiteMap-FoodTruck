package com.Bitemap.Backend.location.management;

import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.UUID;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest
class OperatorStopConcurrencyTests {
    @Autowired OperatorStopService service;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;
    @Test void concurrentSameTruckCreatesHaveOneWinnerWhileSiblingTruckIsIndependent() throws Exception {
        String email="schedule-race-"+UUID.randomUUID()+"@example.com";
        long owner=com.Bitemap.Backend.TestAccounts.operator(jdbc, "Schedule race", email, "unused");
        long vendor=vendor(owner), sibling=vendor(owner);
        var start=OffsetDateTime.now(ZoneOffset.UTC).plusDays(2).withNano(0);
        var details=new StopRequests.Details("Race","Test",34.0,-118.0,start,start.plusHours(2),"UTC");
        var locked=new CountDownLatch(1); var release=new CountDownLatch(1);
        try (var pool=Executors.newFixedThreadPool(3)) {
            try {
                var first=pool.submit(() -> new TransactionTemplate(transactions).execute(tx -> {
                    var saved=service.create(email,vendor,details); locked.countDown();
                    try { if(!release.await(8,TimeUnit.SECONDS)) throw new AssertionError("Timed out waiting to commit"); }
                    catch(InterruptedException e) { Thread.currentThread().interrupt(); throw new AssertionError(e); }
                    return saved;
                }));
                assertThat(locked.await(5,TimeUnit.SECONDS)).isTrue();
                var secondStarted=new CountDownLatch(1);
                var second=pool.submit(() -> { secondStarted.countDown(); return service.create(email,vendor,details); });
                assertThat(secondStarted.await(5,TimeUnit.SECONDS)).isTrue();
                var independent=pool.submit(() -> service.create(email,sibling,details));
                assertThat(independent.get(5,TimeUnit.SECONDS).vendorId()).isEqualTo(sibling);
                release.countDown();
                first.get(5,TimeUnit.SECONDS);
                assertThatThrownBy(() -> second.get(5,TimeUnit.SECONDS)).isInstanceOf(ExecutionException.class)
                        .hasCauseInstanceOf(ScheduleException.class)
                        .satisfies(e -> assertThat(((ScheduleException)e.getCause()).kind()).isEqualTo(ScheduleException.Kind.CONFLICT));
                assertThat(jdbc.queryForObject("SELECT count(*) FROM vendor_stops WHERE vendor_id=?",Integer.class,vendor)).isEqualTo(1);
            } finally { release.countDown(); pool.shutdownNow(); pool.awaitTermination(10,TimeUnit.SECONDS); }
        } finally {
            jdbc.update("DELETE FROM vendor_stops WHERE vendor_id IN (?,?)",vendor,sibling);
            jdbc.update("DELETE FROM vendors WHERE id IN (?,?)",vendor,sibling);
            com.Bitemap.Backend.TestAccounts.deleteOperator(jdbc, owner);
        }
    }
    long vendor(long owner) { return jdbc.queryForObject("INSERT INTO vendors(name,category,location,operator_id) VALUES ('Schedule race','Food','Test',?) RETURNING id",Long.class,owner); }
}
