package com.Bitemap.Backend.location.management;

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
class SavedLocationConcurrencyTests {
    @Autowired SavedLocationService service;
    @Autowired JdbcTemplate jdbc;
    @Autowired PlatformTransactionManager transactions;
    @Test void concurrentEditsWithSameVersionHaveOnlyOneWinner() throws Exception {
        String email="saved-edit-"+UUID.randomUUID()+"@example.test";
        long owner=com.Bitemap.Backend.TestAccounts.operator(jdbc,"Race",email,"unused");
        var details=new SavedLocation.Details("Campus","Entrance","Street",34.0,-118.0,"UTC",true);
        long id=service.create(email,details).id();
        try (var pool=Executors.newFixedThreadPool(2)) {
            var ready=new CountDownLatch(2); var start=new CountDownLatch(1);
            Callable<Boolean> edit=() -> {
                ready.countDown();
                if (!start.await(5,TimeUnit.SECONDS)) throw new AssertionError("Start timed out");
                try { service.update(email,id,new SavedLocation.Update(details,0L)); return true; }
                catch (ScheduleException error) { assertThat(error.kind()).isEqualTo(ScheduleException.Kind.CONFLICT); return false; }
            };
            var first=pool.submit(edit); var second=pool.submit(edit);
            assertThat(ready.await(5,TimeUnit.SECONDS)).isTrue(); start.countDown();
            assertThat(java.util.List.of(first.get(5,TimeUnit.SECONDS),second.get(5,TimeUnit.SECONDS))).containsExactlyInAnyOrder(true,false);
            assertThat(service.get(email,id).version()).isEqualTo(1);
        } finally {
            jdbc.update("DELETE FROM operator_saved_locations WHERE operator_id=?",owner);
            com.Bitemap.Backend.TestAccounts.deleteOperator(jdbc,owner);
        }
    }
    @Test void concurrentCreatesSerializeDuplicateCheckWithoutDeadlock() throws Exception {
        String email="saved-race-"+UUID.randomUUID()+"@example.test";
        long owner=com.Bitemap.Backend.TestAccounts.operator(jdbc,"Race",email,"unused");
        var details=new SavedLocation.Details("Campus","Entrance","Street",34.0,-118.0,"UTC",true);
        var locked=new CountDownLatch(1); var release=new CountDownLatch(1);
        try (var pool=Executors.newFixedThreadPool(2)) {
            try {
                var first=pool.submit(() -> new TransactionTemplate(transactions).execute(tx -> {
                    var result=service.create(email,details); locked.countDown();
                    try { if(!release.await(8,TimeUnit.SECONDS)) throw new AssertionError("Commit wait timed out"); }
                    catch(InterruptedException e) { Thread.currentThread().interrupt(); throw new AssertionError(e); }
                    return result;
                }));
                assertThat(locked.await(5,TimeUnit.SECONDS)).isTrue();
                var started=new CountDownLatch(1);
                var second=pool.submit(() -> { started.countDown(); return service.create(email,details); });
                assertThat(started.await(5,TimeUnit.SECONDS)).isTrue();
                release.countDown(); first.get(5,TimeUnit.SECONDS);
                assertThatThrownBy(() -> second.get(5,TimeUnit.SECONDS)).isInstanceOf(ExecutionException.class)
                    .hasCauseInstanceOf(ScheduleException.class)
                    .satisfies(error -> assertThat(((ScheduleException)error.getCause()).kind()).isEqualTo(ScheduleException.Kind.CONFLICT));
                assertThat(jdbc.queryForObject("SELECT count(*) FROM operator_saved_locations WHERE operator_id=?",Integer.class,owner)).isEqualTo(1);
            } finally { release.countDown(); pool.shutdownNow(); pool.awaitTermination(10,TimeUnit.SECONDS); }
        } finally {
            jdbc.update("DELETE FROM operator_saved_locations WHERE operator_id=?",owner);
            com.Bitemap.Backend.TestAccounts.deleteOperator(jdbc,owner);
        }
    }
}
