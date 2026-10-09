package com.Bitemap.Backend.location.management;

import java.time.Clock;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import static org.assertj.core.api.Assertions.*;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class OperatorStopApiTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    @MockitoBean Clock clock;
    long owner, vendor, sibling, foreign, unowned;
    static final String EMAIL = "schedule-owner@example.com";
    @BeforeEach void seed() {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM operators", Integer.class)).as("Use an isolated test database").isZero();
        when(clock.instant()).thenReturn(Instant.parse("2030-01-01T00:00:00Z"));
        owner = owner(EMAIL); vendor = vendor(owner); sibling = vendor(owner);
        foreign = vendor(owner("foreign-schedule@example.com")); unowned = vendor(null);
    }
    Map<String, Object> details() {
        return new HashMap<>(Map.of("venueName", " Campus lunch ", "address", " CSUN ", "latitude", 34.24, "longitude", -118.53,
                "startsAt", "2030-01-02T11:00:00-08:00", "endsAt", "2030-01-02T14:00:00-08:00", "timeZone", "America/Los_Angeles"));
    }
    String root(long v) { return "/api/operator/vendors/" + v + "/stops"; }
    long owner(String email) { return com.Bitemap.Backend.TestAccounts.operator(jdbc, "Schedule test", email, "unused"); }
    long vendor(Long id) { return jdbc.queryForObject("INSERT INTO vendors(name,category,location,operator_id) VALUES ('Schedule truck','Food','Test',?) RETURNING id", Long.class, id); }
    long create(long v, Map<String,Object> body) throws Exception {
        var result = mvc.perform(post(root(v)).with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json").content(json.writeValueAsString(body)))
                .andExpect(status().isCreated()).andExpect(header().string("Cache-Control", "no-store")).andExpect(jsonPath("$.version").value(0)).andReturn();
        long id = json.readTree(result.getResponse().getContentAsString()).get("id").asLong();
        assertThat(result.getResponse().getHeader("Location")).isEqualTo(root(v) + "/" + id);
        return id;
    }
    @Test void createReadUpdateCancelAndPublicDiscovery() throws Exception {
        long id = create(vendor, details());
        mvc.perform(get(root(vendor)+"/"+id).with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("OPERATOR"))).andExpect(status().isOk())
                .andExpect(jsonPath("$.venueName").value("Campus lunch")).andExpect(jsonPath("$.startsAt").value("2030-01-02T19:00:00Z"));
        mvc.perform(get(root(vendor)).with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("OPERATOR"))).andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
        var body = details(); body.put("venueName", "Changed venue");
        mvc.perform(put(root(vendor)+"/"+id).with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(Map.of("stop",body,"version",0)))).andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        mvc.perform(get("/api/vendor-stops").param("q","Changed venue").param("from","2030-01-02T00:00:00Z").param("to","2030-01-03T00:00:00Z"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(post(root(vendor)+"/"+id+"/cancel").with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json").content("{\"version\":1}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.status").value("cancelled")).andExpect(jsonPath("$.version").value(2));
        mvc.perform(get("/api/vendor-stops").param("q","Changed venue").param("from","2030-01-02T00:00:00Z").param("to","2030-01-03T00:00:00Z"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(0));
        assertThat(jdbc.queryForObject("SELECT count(*) FROM vendor_stops WHERE id=?", Integer.class,id)).isEqualTo(1);
    }
    @Test void deniesEveryOperationForForeignUnownedMissingAndDisabled() throws Exception {
        for (long v : new long[]{foreign, unowned, Long.MAX_VALUE}) deny(v);
        jdbc.update("UPDATE operators SET enabled=FALSE WHERE id=?",owner); deny(vendor, 403);
    }
    void deny(long v) throws Exception {
        deny(v, 404);
    }
    void deny(long v, int expected) throws Exception {
        for(var r : java.util.List.of(get(root(v)),get(root(v)+"/1"),post(root(v)).content(json.writeValueAsString(details())),
                put(root(v)+"/1").content(json.writeValueAsString(Map.of("stop",details(),"version",0))),post(root(v)+"/1/cancel").content("{\"version\":0}"))) {
            mvc.perform(r.with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json"))
                    .andExpect(status().is(expected));
        }
    }
    @Test void cannotSubstituteAStopFromAnotherOwnedVendor() throws Exception {
        long id = create(sibling, details());
        mvc.perform(get(root(vendor)+"/"+id).with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("OPERATOR"))).andExpect(status().isNotFound());
        mvc.perform(put(root(vendor)+"/"+id).with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(Map.of("stop",details(),"version",0)))).andExpect(status().isNotFound());
        mvc.perform(post(root(vendor)+"/"+id+"/cancel").with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json").content("{\"version\":0}"))
                .andExpect(status().isNotFound());
    }
    @Test void loginRoleAndCsrfRequired() throws Exception {
        mvc.perform(get(root(vendor))).andExpect(status().isUnauthorized());
        mvc.perform(get(root(vendor)).with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("CUSTOMER"))).andExpect(status().isForbidden());
        mvc.perform(post(root(vendor)).with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("OPERATOR")).contentType("application/json").content(json.writeValueAsString(details())))
                .andExpect(status().isForbidden());
    }
    @Test void overlapBlockedButAdjacentAndOtherTrucksAllowed() throws Exception {
        create(vendor, details());
        mvc.perform(post(root(vendor)).with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json").content(json.writeValueAsString(details())))
                .andExpect(status().isConflict());
        create(sibling, details());
        var adjacent = details(); adjacent.put("startsAt","2030-01-02T14:00:00-08:00"); adjacent.put("endsAt","2030-01-02T16:00:00-08:00"); create(vendor,adjacent);
    }
    @Test void cancelledStopDoesNotBlockAndStaleCancelFails() throws Exception {
        long id = create(vendor,details());
        mvc.perform(post(root(vendor)+"/"+id+"/cancel").with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json").content("{\"version\":0}"))
                .andExpect(status().isOk());
        create(vendor,details());
        mvc.perform(post(root(vendor)+"/"+id+"/cancel").with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json").content("{\"version\":0}"))
                .andExpect(status().isConflict());
        mvc.perform(post(root(vendor)+"/"+id+"/cancel").with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json").content("{\"version\":1}"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
    }
    @Test void overlapOnEditAndStaleVersionAreRejected() throws Exception {
        long first=create(vendor,details());
        var later=details(); later.put("startsAt","2030-01-03T11:00:00-08:00"); later.put("endsAt","2030-01-03T14:00:00-08:00");
        long second=create(vendor,later);
        mvc.perform(put(root(vendor)+"/"+second).with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(Map.of("stop",details(),"version",0)))).andExpect(status().isConflict());
        mvc.perform(put(root(vendor)+"/"+first).with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(Map.of("stop",details(),"version",99)))).andExpect(status().isConflict());
    }
    @ParameterizedTest @ValueSource(strings={"past","reverse","zone","offset","dstGap","nan","latitude","longitude","blank","farFuture"})
    void invalidDetails(String kind) throws Exception {
        var d=details();
        switch(kind) {
            case "past" -> d.put("startsAt","2029-12-31T11:00:00-08:00");
            case "reverse" -> d.put("endsAt","2030-01-02T10:00:00-08:00");
            case "zone" -> d.put("timeZone","Invalid/Zone");
            case "offset" -> d.put("startsAt","2030-01-02T11:00:00-07:00");
            case "dstGap" -> { d.put("startsAt","2030-03-10T02:30:00-08:00"); d.put("endsAt","2030-03-10T04:00:00-07:00"); }
            case "nan" -> d.put("latitude","NaN");
            case "latitude" -> d.put("latitude",91);
            case "longitude" -> d.put("longitude",181);
            case "blank" -> d.put("venueName","  ");
            case "farFuture" -> d.put("endsAt","2101-01-01T14:00:00-08:00");
        }
        mvc.perform(post(root(vendor)).with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json").content(json.writeValueAsString(d)))
                .andExpect(status().isBadRequest());
    }
    @Test void overnightAndExplicitFallBackOffsetsAccepted() throws Exception {
        var d=details(); d.put("startsAt","2030-11-03T01:30:00-07:00"); d.put("endsAt","2030-11-03T01:30:00-08:00"); create(vendor,d);
        d.put("startsAt","2030-01-02T23:00:00-08:00"); d.put("endsAt","2030-01-03T02:00:00-08:00"); create(vendor,d);
    }
    @Test void historicalAndStartedStopsCannotBeEditedButOngoingCanBeCancelled() throws Exception {
        long id=create(vendor,details());
        when(clock.instant()).thenReturn(Instant.parse("2030-01-02T20:00:00Z"));
        mvc.perform(put(root(vendor)+"/"+id).with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json")
                .content(json.writeValueAsString(Map.of("stop",details(),"version",0)))).andExpect(status().isConflict());
        mvc.perform(post(root(vendor)+"/"+id+"/cancel").with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json").content("{\"version\":0}"))
                .andExpect(status().isOk());
        jdbc.update("UPDATE vendor_stops SET status='ended' WHERE id=?",id);
        mvc.perform(post(root(vendor)+"/"+id+"/cancel").with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json").content("{\"version\":1}"))
                .andExpect(status().isConflict());
    }
    @Test void paginationAndForgedOwnership() throws Exception {
        var d=details(); d.put("vendorId",foreign); d.put("operatorId",999); d.put("status","serving");
        long id=create(vendor,d);
        assertThat(jdbc.queryForObject("SELECT vendor_id FROM vendor_stops WHERE id=?",Long.class,id)).isEqualTo(vendor);
        assertThat(jdbc.queryForObject("SELECT status FROM vendor_stops WHERE id=?",String.class,id)).isEqualTo("scheduled");
        mvc.perform(get(root(vendor)).param("size","0").with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("OPERATOR"))).andExpect(status().isBadRequest());
        mvc.perform(get(root(vendor)).param("page","-1").with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("OPERATOR"))).andExpect(status().isBadRequest());
        mvc.perform(get(root(vendor)).param("page","1").param("size","1").with(com.Bitemap.Backend.TestAccounts.user(EMAIL).roles("OPERATOR")))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items").isEmpty()).andExpect(jsonPath("$.totalElements").value(1));
    }
}
