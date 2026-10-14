package com.Bitemap.Backend.onboarding;

import java.util.UUID;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
class OwnerReviewConcurrencyTests {
    @Autowired JdbcTemplate jdbc;
    @Autowired OwnerApplicationService service;
    long account(String prefix, String role) {
        long id=jdbc.queryForObject("INSERT INTO app_users(display_name,email,password_hash) VALUES ('Race',?,'unused') RETURNING id",Long.class,prefix+UUID.randomUUID()+"@example.com");
        jdbc.update("INSERT INTO app_user_roles(user_id,role) VALUES (?,?)",id,role); return id;
    }
    @Test void concurrentReviewsMakeOneAuditedDecisionAndOneProfile() throws Exception {
        long applicant=account("applicant-","CUSTOMER"), reviewer=account("reviewer-","ADMIN");
        try (var workers=Executors.newFixedThreadPool(2)) {
            long id=service.submit(applicant,new OwnerApplication.Submit("Race Foods","race@example.com","CSUN")).id();
            var ready=new CountDownLatch(2); var start=new CountDownLatch(1);
            Callable<Boolean> request=()->{
                ready.countDown(); if(!start.await(5,TimeUnit.SECONDS)) throw new AssertionError("Timed out");
                try { service.review(reviewer,id,new OwnerApplication.Review(OwnerApplication.Decision.APPROVED,"Verified")); return true; }
                catch(OwnerApplicationService.ApplicationException conflict) { assertThat(conflict.status.value()).isEqualTo(409); return false; }
            };
            var first=workers.submit(request);var second=workers.submit(request);
            assertThat(ready.await(5,TimeUnit.SECONDS)).isTrue();start.countDown();
            assertThat(first.get(10,TimeUnit.SECONDS)).isNotEqualTo(second.get(10,TimeUnit.SECONDS));
            assertThat(jdbc.queryForObject("SELECT count(*) FROM operators WHERE user_id=?",Integer.class,applicant)).isEqualTo(1);
            assertThat(jdbc.queryForObject("SELECT reviewed_by FROM owner_applications WHERE id=?",Long.class,id)).isEqualTo(reviewer);
        } finally {
            jdbc.update("DELETE FROM owner_applications WHERE user_id=?",applicant);
            jdbc.update("DELETE FROM operators WHERE user_id=?",applicant);
            jdbc.update("DELETE FROM app_users WHERE id IN (?,?)",applicant,reviewer);
        }
    }
}
