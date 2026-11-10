package com.Bitemap.Backend.review;

import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import com.Bitemap.Backend.TestAccounts;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class ReviewApiTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    long customer,other,vendor,otherVendor;
    static final String EMAIL="reviews@example.com", OTHER="other-reviewer@example.com";
    @BeforeEach void seed() {
        customer=customer(EMAIL);other=customer(OTHER);
        vendor=vendor("Review truck");otherVendor=vendor("Another truck");
    }
    long customer(String email) {
        long id=jdbc.queryForObject("INSERT INTO app_users(display_name,email,password_hash) VALUES ('Reviewer',?,'unused') RETURNING id",Long.class,email);
        jdbc.update("INSERT INTO app_user_roles(user_id,role) VALUES (?,'CUSTOMER')",id);return id;
    }
    long vendor(String name) {return jdbc.queryForObject("INSERT INTO vendors(name,category,location) VALUES (?,'Tacos','CSUN') RETURNING id",Long.class,name);}
    void order(long user,long truck,String status) {
        jdbc.update("INSERT INTO customer_orders(customer_user_id,vendor_id,idempotency_key,status,total) VALUES (?,?,?,?,10)",user,truck,UUID.randomUUID(),status);
    }
    String path() {return "/api/customer/vendors/"+vendor+"/review";}
    org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder save(String email,long account,int stars,long version) {
        return post(path()).with(TestAccounts.user(email).roles("CUSTOMER")).with(csrf())
            .header("X-Review-Account-Id",account).contentType(MediaType.APPLICATION_JSON)
            .content("{\"rating\":"+stars+",\"comment\":\"Good food\",\"version\":"+version+"}");
    }
    @Test void publicEmptyAndMissingTruck() throws Exception {
        mvc.perform(get("/api/vendors/"+vendor+"/reviews")).andExpect(status().isOk())
            .andExpect(jsonPath("$.summary.reviewCount").value(0)).andExpect(jsonPath("$.summary.averageRating").isEmpty());
        mvc.perform(get("/api/vendors/9223372036854775807/reviews")).andExpect(status().isNotFound());
        mvc.perform(get("/api/vendors/"+vendor+"/reviews?page=-1")).andExpect(status().isBadRequest());
    }
    @Test void requiresCompletedOrderForThisTruckAndThisAccount() throws Exception {
        order(customer,otherVendor,"COMPLETED");order(other,vendor,"COMPLETED");order(customer,vendor,"READY");
        mvc.perform(save(EMAIL,customer,5,-1)).andExpect(status().isForbidden());
        mvc.perform(get(path()).with(TestAccounts.user(EMAIL).roles("CUSTOMER")))
            .andExpect(status().isOk()).andExpect(jsonPath("$.eligible").value(false));
    }
    @Test void savesUpdatesAndAveragesWithoutDuplicateReviews() throws Exception {
        order(customer,vendor,"COMPLETED");order(other,vendor,"COMPLETED");
        mvc.perform(save(EMAIL,customer,5,-1)).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(0));
        mvc.perform(save(OTHER,other,3,-1)).andExpect(status().isOk());
        mvc.perform(get("/api/vendors/"+vendor+"/reviews")).andExpect(status().isOk())
            .andExpect(jsonPath("$.summary.averageRating").value(4.0)).andExpect(jsonPath("$.summary.reviewCount").value(2))
            .andExpect(jsonPath("$.items[0].email").doesNotExist()).andExpect(jsonPath("$.items[0].customerUserId").doesNotExist());
        mvc.perform(save(EMAIL,customer,4,-1)).andExpect(status().isConflict());
        mvc.perform(save(EMAIL,customer,4,0)).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        mvc.perform(save(EMAIL,customer,2,0)).andExpect(status().isConflict());
        mvc.perform(get("/api/vendors/"+vendor)).andExpect(status().isOk())
            .andExpect(jsonPath("$.averageRating").value(3.5)).andExpect(jsonPath("$.reviewCount").value(2));
        mvc.perform(get("/api/vendors").param("q","Review truck")).andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].reviewCount").value(2));
        assertThat(jdbc.queryForObject("SELECT rating FROM customer_reviews WHERE customer_user_id=?",Integer.class,other)).isEqualTo(3);
    }
    @Test void requiresAuthenticationCsrfAndMatchingAccount() throws Exception {
        mvc.perform(post(path()).with(csrf()).header("X-Review-Account-Id",customer).contentType(MediaType.APPLICATION_JSON)
            .content("{\"rating\":5,\"comment\":\"Nice\",\"version\":-1}")).andExpect(status().isUnauthorized());
        mvc.perform(post(path()).with(TestAccounts.user(EMAIL).roles("CUSTOMER"))).andExpect(status().isForbidden());
        order(customer,vendor,"COMPLETED");
        mvc.perform(save(EMAIL,other,5,-1)).andExpect(status().isForbidden());
    }
    @Test void validatesRatingCommentAndVersion() throws Exception {
        order(customer,vendor,"COMPLETED");
        mvc.perform(save(EMAIL,customer,0,-1)).andExpect(status().isBadRequest());
        mvc.perform(save(EMAIL,customer,6,-1)).andExpect(status().isBadRequest());
        mvc.perform(save(EMAIL,customer,5,-2)).andExpect(status().isBadRequest());
        mvc.perform(save(EMAIL,customer,5,-1).content("{\"rating\":5,\"comment\":\"   \",\"version\":-1}")).andExpect(status().isBadRequest());
        mvc.perform(save(EMAIL,customer,5,-1).content("{\"rating\":5,\"comment\":\""+"a".repeat(2001)+"\",\"version\":-1}")).andExpect(status().isBadRequest());
    }
    @Test void ownerCanReadOnlyTheirWorkspaceAndCannotReviewOwnTruck() throws Exception {
        long owner=TestAccounts.operator(jdbc,"Owner","review-owner@example.com","unused");
        long ownerUser=jdbc.queryForObject("SELECT user_id FROM operators WHERE id=?",Long.class,owner);
        jdbc.update("UPDATE vendors SET operator_id=? WHERE id=?",owner,vendor);
        order(ownerUser,vendor,"COMPLETED");
        mvc.perform(save("review-owner@example.com",ownerUser,5,-1)).andExpect(status().isForbidden());
        mvc.perform(get("/api/operator/vendors/"+vendor+"/reviews").with(TestAccounts.user("review-owner@example.com").roles("CUSTOMER","OPERATOR")))
            .andExpect(status().isOk());
        mvc.perform(get("/api/operator/vendors/"+otherVendor+"/reviews").with(TestAccounts.user("review-owner@example.com").roles("CUSTOMER","OPERATOR")))
            .andExpect(status().isNotFound());
        mvc.perform(get("/api/operator/vendors/"+vendor+"/reviews").with(TestAccounts.user(EMAIL).roles("CUSTOMER")))
            .andExpect(status().isForbidden());
    }
    @Test void returnsOnlyFiveReviewsPerPage() throws Exception {
        for(int i=0;i<6;i++) {
            long user=customer("page"+i+"@example.com");
            order(user,vendor,"COMPLETED");
            jdbc.update("INSERT INTO customer_reviews(vendor_id,customer_user_id,rating,comment) VALUES (?,?,5,'Great')",vendor,user);
        }
        mvc.perform(get("/api/vendors/"+vendor+"/reviews")).andExpect(status().isOk())
            .andExpect(jsonPath("$.items.length()").value(5)).andExpect(jsonPath("$.totalPages").value(2));
        mvc.perform(get("/api/vendors/"+vendor+"/reviews?page=1")).andExpect(status().isOk())
            .andExpect(jsonPath("$.items.length()").value(1)).andExpect(jsonPath("$.summary.reviewCount").value(6));
    }
}