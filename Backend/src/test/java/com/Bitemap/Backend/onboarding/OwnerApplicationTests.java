package com.Bitemap.Backend.onboarding;

import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import static com.Bitemap.Backend.TestAccounts.user;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.assertj.core.api.Assertions.*;

@SpringBootTest @AutoConfigureMockMvc @Transactional
class OwnerApplicationTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    long customer, admin;
    static final String BODY = "{\"businessName\":\"Delight Foods\",\"contactEmail\":\"contact@example.com\",\"operatingArea\":\"Northridge\",\"roles\":[\"ADMIN\",\"OPERATOR\"],\"userId\":999}";
    long account(String email, String role) {
        long id=jdbc.queryForObject("INSERT INTO app_users(display_name,email,password_hash) VALUES ('Test',?,'unused') RETURNING id",Long.class,email);
        jdbc.update("INSERT INTO app_user_roles(user_id,role) VALUES (?,?)",id,role);
        return id;
    }
    @BeforeEach void setup() { customer=account("applicant@example.com","CUSTOMER"); admin=account("reviewer@example.com","ADMIN"); }
    long submit() throws Exception {
        var result=mvc.perform(post("/api/customer/owner-application").with(user("applicant@example.com").roles("CUSTOMER")).with(csrf())
            .contentType("application/json").content(BODY)).andExpect(status().isCreated()).andExpect(jsonPath("$.status").value("PENDING")).andReturn();
        return json.readTree(result.getResponse().getContentAsString()).get("id").asLong();
    }
    @Test void submissionDoesNotGrantRolesAndCannotBypassApproval() throws Exception {
        submit();
        assertThat(jdbc.queryForList("SELECT role FROM app_user_roles WHERE user_id=?",String.class,customer)).containsExactly("CUSTOMER");
        assertThat(jdbc.queryForObject("SELECT count(*) FROM operators",Integer.class)).isZero();
        mvc.perform(post("/api/auth/become-operator").with(user("applicant@example.com").roles("CUSTOMER")).with(csrf())).andExpect(status().isForbidden());
        mvc.perform(get("/api/operator/vendors").with(user("applicant@example.com").roles("CUSTOMER"))).andExpect(status().isForbidden());
    }
    @Test void onlyAdminCanReviewAndApprovalNeverClaimsTrucks() throws Exception {
        jdbc.update("INSERT INTO vendors(name,category,location) VALUES ('Unclaimed','Food','CSUN')");
        var before=jdbc.queryForList("SELECT * FROM vendors ORDER BY id");
        long id=submit();
        mvc.perform(post("/api/admin/owner-applications/"+id+"/review").with(user("applicant@example.com").roles("CUSTOMER")).with(csrf())
            .contentType("application/json").content("{\"decision\":\"APPROVED\",\"note\":\"Reviewed\"}")).andExpect(status().isForbidden());
        review(id,"APPROVED",200);
        assertThat(jdbc.queryForList("SELECT role FROM app_user_roles WHERE user_id=? ORDER BY role",String.class,customer)).containsExactly("CUSTOMER","OPERATOR");
        assertThat(jdbc.queryForObject("SELECT reviewed_by FROM owner_applications WHERE id=?",Long.class,id)).isEqualTo(admin);
        assertThat(jdbc.queryForList("SELECT * FROM vendors ORDER BY id")).isEqualTo(before);
        review(id,"REJECTED",409);
    }
    void review(long id,String decision,int status) throws Exception {
        mvc.perform(post("/api/admin/owner-applications/"+id+"/review").with(user("reviewer@example.com").roles("ADMIN")).with(csrf())
            .contentType("application/json").content("{\"decision\":\""+decision+"\",\"note\":\"Reviewed by team\"}"))
            .andExpect(status().is(status));
    }
    @Test void rejectionDoesNotGrantAccess() throws Exception { review(submit(),"REJECTED",200); assertThat(jdbc.queryForObject("SELECT count(*) FROM operators",Integer.class)).isZero(); }
    @Test void identityAndReviewBoundaries() throws Exception {
        long id=submit();
        account("other@example.com","CUSTOMER");
        mvc.perform(get("/api/customer/owner-application").with(user("other@example.com").roles("CUSTOMER"))).andExpect(status().isNoContent());
        mvc.perform(get("/api/admin/owner-applications").with(user("applicant@example.com").roles("CUSTOMER"))).andExpect(status().isForbidden());
        mvc.perform(get("/api/admin/owner-applications").with(user("reviewer@example.com").roles("ADMIN"))).andExpect(status().isOk()).andExpect(jsonPath("$[0].id").value(id));
        mvc.perform(get("/api/operator/vendors").with(user("reviewer@example.com").roles("ADMIN"))).andExpect(status().isForbidden());
        jdbc.update("INSERT INTO app_user_roles(user_id,role) VALUES (?,'ADMIN')",customer);
        mvc.perform(post("/api/admin/owner-applications/"+id+"/review").with(user("applicant@example.com").roles("ADMIN","CUSTOMER")).with(csrf())
            .contentType("application/json").content("{\"decision\":\"APPROVED\",\"note\":\"Self\"}")).andExpect(status().isForbidden());
    }
    @Test void authenticationCsrfAndValidation() throws Exception {
        mvc.perform(get("/api/customer/owner-application")).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/customer/owner-application").with(user("applicant@example.com").roles("CUSTOMER")).contentType("application/json").content(BODY)).andExpect(status().isForbidden());
        mvc.perform(post("/api/customer/owner-application").with(user("applicant@example.com").roles("CUSTOMER")).with(csrf()).contentType("application/json").content("{}" )).andExpect(status().isBadRequest());
        long id=submit();
        mvc.perform(post("/api/customer/owner-application").with(user("applicant@example.com").roles("CUSTOMER")).with(csrf()).contentType("application/json").content(BODY)).andExpect(status().isConflict());
        mvc.perform(post("/api/admin/owner-applications/"+id+"/review").with(user("reviewer@example.com").roles("ADMIN")).contentType("application/json").content("{}" )).andExpect(status().isForbidden());
        review(999999999,"APPROVED",404);
    }
    @Test void revokedAdminAndDisabledApplicantCannotBeApproved() throws Exception {
        long id=submit(); jdbc.update("UPDATE app_users SET enabled=FALSE WHERE id=?",customer); review(id,"APPROVED",403);
        jdbc.update("DELETE FROM app_user_roles WHERE user_id=?",admin); review(id,"APPROVED",403);
    }
}
