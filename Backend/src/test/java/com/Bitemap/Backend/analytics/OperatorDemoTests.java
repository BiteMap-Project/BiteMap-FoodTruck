package com.Bitemap.Backend.analytics;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class OperatorDemoTests {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired org.springframework.jdbc.core.JdbcTemplate jdbc;
    @Autowired com.Bitemap.Backend.onboarding.OwnerApplicationService applications;

    @Test
    void registerLoginPublishBrowseAnalyzeAndLogout() throws Exception {
        mvc.perform(post("/api/auth/register").with(csrf()).contentType("application/json")
                .content("{\"displayName\":\"Demo Owner\",\"email\":\"demo-walkthrough@example.com\",\"password\":\"A demo test passphrase 2026!\"}"))
                .andExpect(status().isCreated());
        var login = mvc.perform(post("/api/auth/login").with(csrf()).contentType("application/json")
                .content("{\"email\":\"demo-walkthrough@example.com\",\"password\":\"A demo test passphrase 2026!\"}"))
                .andExpect(status().isOk()).andReturn();
        var session = (MockHttpSession) login.getRequest().getSession(false);
        long applicant = jdbc.queryForObject("SELECT id FROM app_users WHERE email='demo-walkthrough@example.com'", Long.class);
        long reviewer = jdbc.queryForObject("INSERT INTO app_users(display_name,email,password_hash) VALUES ('Reviewer','demo-reviewer@example.com','unused') RETURNING id", Long.class);
        jdbc.update("INSERT INTO app_user_roles(user_id,role) VALUES (?,'ADMIN')", reviewer);
        var application = applications.submit(applicant, new com.Bitemap.Backend.onboarding.OwnerApplication.Submit("Demo", "demo@example.com", "CSUN"));
        applications.review(reviewer, application.id(), new com.Bitemap.Backend.onboarding.OwnerApplication.Review(com.Bitemap.Backend.onboarding.OwnerApplication.Decision.APPROVED, "Demo reviewed"));
        mvc.perform(post("/api/auth/become-operator").session(session).with(csrf())).andExpect(status().isOk());
        var created = mvc.perform(post("/api/operator/vendors").session(session).with(csrf()).contentType("application/json")
                .content("{\"name\":\"Professor Tacos\",\"category\":\"Tacos\",\"location\":\"CSUN\"}"))
                .andExpect(status().isCreated()).andReturn();
        long id = json.readTree(created.getResponse().getContentAsString()).get("id").asLong();
        mvc.perform(post("/api/operator/vendors/" + id + "/menu-items").session(session).with(csrf()).contentType("application/json")
                .content("{\"name\":\"Campus Taco\",\"price\":4.50,\"status\":\"ACTIVE\"}"))
                .andExpect(status().isCreated());
        mvc.perform(get("/api/vendors").param("q", "Professor Tacos"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(get("/api/vendors/" + id)).andExpect(status().isOk())
                .andExpect(jsonPath("$.menu[0].name").value("Campus Taco"));
        mvc.perform(get("/api/operator/analytics/trucks").session(session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalTrucks").value(1)).andExpect(jsonPath("$.totalMenuItems").value(1))
                .andExpect(jsonPath("$.trucks[0].averageMenuPrice").value(4.5));
        mvc.perform(post("/api/auth/logout").session(session).with(csrf())).andExpect(status().isNoContent());
        mvc.perform(get("/api/operator/analytics/trucks")).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/vendors/" + id)).andExpect(status().isOk());
    }
}
