package com.Bitemap.Backend.location.management;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import tools.jackson.databind.ObjectMapper;
import static com.Bitemap.Backend.TestAccounts.user;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

// Use an isolated test database. No test-level transaction: failed HTTP requests
// must roll back their own writes before the following count query runs.
@SpringBootTest
@AutoConfigureMockMvc
class RecurringStopApiTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @MockitoBean Clock clock;
    String email;
    long owner, vendor;

    @BeforeEach void seed() {
        when(clock.instant()).thenReturn(Instant.parse("2030-01-01T00:00:00Z"));
        email = "repeat-" + UUID.randomUUID() + "@example.com";
        owner = com.Bitemap.Backend.TestAccounts.operator(jdbc, "Repeat test", email, "unused");
        vendor = jdbc.queryForObject("""
                INSERT INTO vendors(name,category,location,operator_id)
                VALUES ('Repeat test','Food','Test',?) RETURNING id
                """, Long.class, owner);
    }

    @AfterEach void cleanup() {
        jdbc.update("DELETE FROM vendor_stops WHERE vendor_id=?", vendor);
        jdbc.update("DELETE FROM vendors WHERE id=?", vendor);
        if (owner != 0) com.Bitemap.Backend.TestAccounts.deleteOperator(jdbc, owner);
    }

    String root() { return "/api/operator/vendors/" + vendor + "/stops"; }
    Map<String, Object> details(String day) {
        return Map.of("venueName", "Repeat lunch", "address", "CSUN", "latitude", 34.24,
                "longitude", -118.53, "startsAt", day + "T11:00:00-08:00",
                "endsAt", day + "T14:00:00-08:00", "timeZone", "America/Los_Angeles");
    }
    String body() throws Exception {
        return json.writeValueAsString(Map.of("stop", details("2030-01-03"),
                "frequency", "WEEKLY", "until", "2030-01-17"));
    }
    int count() {
        return jdbc.queryForObject("SELECT count(*) FROM vendor_stops WHERE vendor_id=?", Integer.class, vendor);
    }

    @Test void createsAllOccurrencesAndARepeatSubmissionCannotDuplicateThem() throws Exception {
        mvc.perform(post(root()+"/repeat").with(user(email).roles("OPERATOR")).with(csrf())
                .contentType("application/json").content(body()))
                .andExpect(status().isCreated()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(jsonPath("$.length()").value(3))
                .andExpect(jsonPath("$[2].startsAt").value("2030-01-17T19:00:00Z"));
        assertThat(count()).isEqualTo(3);
        mvc.perform(post(root()+"/repeat").with(user(email).roles("OPERATOR")).with(csrf())
                .contentType("application/json").content(body())).andExpect(status().isConflict());
        assertThat(count()).isEqualTo(3);
        mvc.perform(get("/api/vendor-stops").param("q", "Repeat lunch")
                .param("from", "2030-01-17T00:00:00Z").param("to", "2030-01-18T00:00:00Z"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test void aConflictOnTheThirdDateRollsBackTheFirstTwoInserts() throws Exception {
        mvc.perform(post(root()).with(user(email).roles("OPERATOR")).with(csrf())
                .contentType("application/json").content(json.writeValueAsString(details("2030-01-17"))))
                .andExpect(status().isCreated());
        mvc.perform(post(root()+"/repeat").with(user(email).roles("OPERATOR")).with(csrf())
                .contentType("application/json").content(body())).andExpect(status().isConflict());
        assertThat(count()).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT starts_at FROM vendor_stops WHERE vendor_id=?",
                java.sql.Timestamp.class, vendor).toInstant()).isEqualTo(Instant.parse("2030-01-17T19:00:00Z"));
    }

    @Test void overlappingOccurrencesRollBackTheEntireRequest() throws Exception {
        var overlapping = new java.util.HashMap<>(details("2030-01-03"));
        overlapping.put("endsAt", "2030-01-05T14:00:00-08:00");
        var body = Map.of("stop", overlapping, "frequency", "DAILY", "until", "2030-01-05");
        mvc.perform(post(root()+"/repeat").with(user(email).roles("OPERATOR")).with(csrf())
                .contentType("application/json").content(json.writeValueAsString(body)))
                .andExpect(status().isConflict());
        assertThat(count()).isZero();
    }

    @Test void requiresOperatorSessionCsrfAndOwnership() throws Exception {
        mvc.perform(post(root()+"/repeat").with(csrf()).contentType("application/json").content(body()))
                .andExpect(status().isUnauthorized());
        mvc.perform(post(root()+"/repeat").with(user(email).roles("CUSTOMER")).with(csrf())
                .contentType("application/json").content(body())).andExpect(status().isForbidden());
        mvc.perform(post(root()+"/repeat").with(user(email).roles("OPERATOR"))
                .contentType("application/json").content(body())).andExpect(status().isForbidden());
        mvc.perform(post("/api/operator/vendors/" + Long.MAX_VALUE + "/stops/repeat")
                .with(user(email).roles("OPERATOR")).with(csrf()).contentType("application/json").content(body()))
                .andExpect(status().isNotFound());
        assertThat(count()).isZero();
    }

    @Test void rejectsUnknownFrequencyAndMissingFieldsWithoutWriting() throws Exception {
        for (String invalid : new String[]{"{}", body().replace("WEEKLY", "HOURLY"),
                body().replace("2030-01-17", "2030-01-02")}) {
            mvc.perform(post(root()+"/repeat").with(user(email).roles("OPERATOR")).with(csrf())
                    .contentType("application/json").content(invalid)).andExpect(status().isBadRequest());
        }
        assertThat(count()).isZero();
    }
}
