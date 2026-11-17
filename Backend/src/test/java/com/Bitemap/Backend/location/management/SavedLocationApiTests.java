package com.Bitemap.Backend.location.management;

import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.ObjectMapper;
import static com.Bitemap.Backend.TestAccounts.*;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @AutoConfigureMockMvc @Transactional
class SavedLocationApiTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired ObjectMapper json;
    static final String ROOT = "/api/operator/saved-locations", EMAIL = "saved-owner@example.test";
    long owner;
    @BeforeEach void seed() {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM operators", Integer.class)).isZero();
        owner = operator(jdbc, "Owner", EMAIL, "unused");
        operator(jdbc, "Other", "other-saved@example.test", "unused");
    }
    Map<String,Object> details() { return new HashMap<>(Map.of("name", " Campus ", "venueName", " Library entrance ",
        "address", " 18111 Nordhoff St ", "latitude", 34.24, "longitude", -118.53,
        "timeZone", "America/Los_Angeles", "locationConfirmed", true)); }
    long create() throws Exception {
        var result = mvc.perform(post(ROOT).with(user(EMAIL).roles("OPERATOR")).with(csrf())
            .contentType("application/json").content(json.writeValueAsString(details())))
            .andExpect(status().isCreated()).andExpect(header().string("Cache-Control", "no-store"))
            .andExpect(jsonPath("$.name").value("Campus")).andExpect(jsonPath("$.version").value(0)).andReturn();
        return json.readTree(result.getResponse().getContentAsString()).get("id").asLong();
    }
    @Test void ownerCanCreateListEditAndArchiveWithoutChangingPublishedStops() throws Exception {
        long id = create();
        mvc.perform(get(ROOT).with(user(EMAIL).roles("OPERATOR"))).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(1));
        long vendor = jdbc.queryForObject("INSERT INTO vendors(name,category,location,operator_id) VALUES ('Truck','Food','Campus',?) RETURNING id", Long.class, owner);
        jdbc.update("INSERT INTO vendor_stops(vendor_id,venue_name,address,latitude,longitude,starts_at,ends_at,time_zone) VALUES (?, 'Library entrance','18111 Nordhoff St',34.24,-118.53,'2035-01-01T12:00Z','2035-01-01T14:00Z','UTC')", vendor);
        var before = jdbc.queryForList("SELECT * FROM vendor_stops WHERE vendor_id=?", vendor);
        var changed = details(); changed.put("address", "New entrance");
        mvc.perform(put(ROOT+"/"+id).with(user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json")
            .content(json.writeValueAsString(Map.of("location", changed,"version",0))))
            .andExpect(status().isOk()).andExpect(jsonPath("$.version").value(1));
        for (int attempt = 0; attempt < 2; attempt++) mvc.perform(post(ROOT+"/"+id+"/archive").with(user(EMAIL).roles("OPERATOR")).with(csrf())
            .contentType("application/json").content("{\"version\":1}" )).andExpect(status().isOk()).andExpect(jsonPath("$.archived").value(true));
        mvc.perform(get(ROOT).with(user(EMAIL).roles("OPERATOR"))).andExpect(jsonPath("$.length()").value(0));
        assertThat(jdbc.queryForList("SELECT * FROM vendor_stops WHERE vendor_id=?",vendor)).isEqualTo(before);
    }
    @Test void foreignOwnerCannotReadEditOrArchiveAndCannotInjectOwnership() throws Exception {
        long id = create();
        mvc.perform(get(ROOT).with(user("other-saved@example.test").roles("OPERATOR"))).andExpect(jsonPath("$.length()").value(0));
        for (var request : java.util.List.of(get(ROOT+"/"+id), put(ROOT+"/"+id).content(json.writeValueAsString(Map.of("location",details(),"version",0))),
            post(ROOT+"/"+id+"/archive").content("{\"version\":0}"))) {
            mvc.perform(request.with(user("other-saved@example.test").roles("OPERATOR")).with(csrf()).contentType("application/json")).andExpect(status().isNotFound());
        }
        var body=details(); body.put("operatorId", -99); body.put("name", "Other location");
        mvc.perform(post(ROOT).with(user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json").content(json.writeValueAsString(body))).andExpect(status().isCreated());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM operator_saved_locations WHERE operator_id=?",Integer.class,owner)).isEqualTo(2);
    }
    @Test void authenticationRoleCsrfAndDisabledAccountEnforced() throws Exception {
        mvc.perform(get(ROOT)).andExpect(status().isUnauthorized());
        mvc.perform(get(ROOT).with(user(EMAIL).roles("CUSTOMER"))).andExpect(status().isForbidden());
        mvc.perform(post(ROOT).with(user(EMAIL).roles("OPERATOR")).contentType("application/json").content(json.writeValueAsString(details()))).andExpect(status().isForbidden());
        jdbc.update("UPDATE operators SET enabled=false WHERE id=?",owner);
        mvc.perform(get(ROOT).with(user(EMAIL).roles("OPERATOR"))).andExpect(status().isForbidden());
    }
    @Test void invalidFieldsNeverCreateLocations() throws Exception {
        for (var invalid : Map.<String,Object>of("name"," ","address"," ","latitude",91,"longitude",181,"timeZone","Not/AZone","locationConfirmed",false).entrySet()) {
            var body=details(); body.put(invalid.getKey(),invalid.getValue());
            mvc.perform(post(ROOT).with(user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json").content(json.writeValueAsString(body)))
                .andExpect(status().isBadRequest()).andExpect(content().contentTypeCompatibleWith("application/problem+json"));
        }
        var body=details(); body.remove("locationConfirmed");
        mvc.perform(post(ROOT).with(user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json").content(json.writeValueAsString(body))).andExpect(status().isBadRequest());
        assertThat(jdbc.queryForObject("SELECT count(*) FROM operator_saved_locations",Integer.class)).isZero();
    }
    @Test void staleEditAndArchiveCannotOverwriteNewerChanges() throws Exception {
        long id=create();
        var request=json.writeValueAsString(Map.of("location",details(),"version",0));
        mvc.perform(put(ROOT+"/"+id).with(user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json").content(request)).andExpect(status().isOk());
        mvc.perform(put(ROOT+"/"+id).with(user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json").content(request)).andExpect(status().isConflict());
        mvc.perform(post(ROOT+"/"+id+"/archive").with(user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json").content("{\"version\":0}")).andExpect(status().isConflict());
    }
    @Test void duplicateActiveNamesRejectedButReusableAfterArchive() throws Exception {
        long id=create();
        var body=details(); body.put("name","CAMPUS");
        mvc.perform(post(ROOT).with(user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json").content(json.writeValueAsString(body))).andExpect(status().isConflict());
        mvc.perform(post(ROOT+"/"+id+"/archive").with(user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json").content("{\"version\":0}")).andExpect(status().isOk());
        create();
    }
    @Test void activeLimitIsEnforcedAndArchivedLocationsCannotBeEdited() throws Exception {
        long id=create();
        jdbc.update("INSERT INTO operator_saved_locations(operator_id,name,venue_name,address,latitude,longitude,time_zone) SELECT ?, 'Place '||n, 'Entrance','Street',34,-118,'UTC' FROM generate_series(1,99) n",owner);
        var body=details(); body.put("name","One too many");
        mvc.perform(post(ROOT).with(user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json").content(json.writeValueAsString(body)))
            .andExpect(status().isConflict()).andExpect(jsonPath("$.detail").value("You can save up to 100 active locations. Archive an unused location first."));
        mvc.perform(post(ROOT+"/"+id+"/archive").with(user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json").content("{\"version\":0}")).andExpect(status().isOk());
        mvc.perform(put(ROOT+"/"+id).with(user(EMAIL).roles("OPERATOR")).with(csrf()).contentType("application/json")
            .content(json.writeValueAsString(Map.of("location",details(),"version",1)))).andExpect(status().isConflict());
        create();
        mvc.perform(get(ROOT).with(user(EMAIL).roles("OPERATOR"))).andExpect(jsonPath("$.length()").value(100));
    }
}
