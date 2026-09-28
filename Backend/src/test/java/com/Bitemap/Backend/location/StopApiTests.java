package com.Bitemap.Backend.location;

import java.sql.Timestamp;
import java.time.Instant;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.transaction.annotation.Transactional;
import static org.assertj.core.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
class StopApiTests {
    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    long vendor;

    @BeforeEach
    void fixture() {
        assertThat(jdbc.queryForObject("SELECT count(*) FROM vendor_stops", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM vendors", Integer.class)).isZero();
        vendor = jdbc.queryForObject(
                "INSERT INTO vendors(name, category, location) VALUES ('Test Tacos', 'Tacos', 'Legacy label') RETURNING id",
                Long.class);
    }

    MockHttpServletRequestBuilder request() {
        return get("/api/vendor-stops").param("from", "2026-09-28T16:00:00Z").param("to", "2026-09-28T20:00:00Z");
    }

    long stop(String start, String end, double lat, double lon, String status) {
        return jdbc.queryForObject("""
                INSERT INTO vendor_stops(vendor_id, venue_name, address, latitude, longitude,
                    starts_at, ends_at, time_zone, status)
                VALUES (?, 'Test venue', 'Test address', ?, ?, ?, ?, 'America/Los_Angeles', ?)
                RETURNING id
                """, Long.class, vendor, lat, lon, Timestamp.from(Instant.parse(start)),
                Timestamp.from(Instant.parse(end)), status);
    }

    long standard() {
        return stop("2026-09-28T17:00:00Z", "2026-09-28T19:00:00Z", 34, -118, "scheduled");
    }

    @Test
    void listsDistinctStopsWithVendorIdentityAndNoInventedDistance() throws Exception {
        long first = standard();
        long second = standard();
        mvc.perform(request()).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(2))
                .andExpect(jsonPath("$.items[0].stopId").value(first))
                .andExpect(jsonPath("$.items[1].stopId").value(second))
                .andExpect(jsonPath("$.items[0].vendor.id").value(vendor))
                .andExpect(jsonPath("$.items[0].vendor.location").value("Legacy label"))
                .andExpect(jsonPath("$.items[0].timeZone").value("America/Los_Angeles"))
                .andExpect(jsonPath("$.items[0].startsAt").value("2026-09-28T17:00:00Z"))
                .andExpect(jsonPath("$.items[0].distanceMeters").isEmpty())
                .andExpect(jsonPath("$.items[0].lastConfirmedAt").isEmpty())
                .andExpect(jsonPath("$.evaluatedAt").exists());
        mvc.perform(get("/api/vendors")).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].id").value(vendor));
    }

    @Test
    void intervalIsHalfOpenAndCancelledEndedStopsAreExcluded() throws Exception {
        stop("2026-09-28T15:00:00Z", "2026-09-28T16:00:00Z", 34, -118, "scheduled");
        stop("2026-09-28T20:00:00Z", "2026-09-28T21:00:00Z", 34, -118, "scheduled");
        stop("2026-09-28T17:00:00Z", "2026-09-28T19:00:00Z", 34, -118, "cancelled");
        stop("2026-09-28T17:00:00Z", "2026-09-28T19:00:00Z", 34, -118, "ended");
        long id = standard();
        mvc.perform(request()).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].stopId").value(id));
    }

    @Test
    void searchIsTrimmedCaseInsensitiveAndLiteralAndCuisineIsExact() throws Exception {
        standard();
        mvc.perform(request().param("q", " tACo ")).andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(request().param("q", "VENUE").param("cuisine", " tacos "))
                .andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(request().param("q", "ADDRESS")).andExpect(jsonPath("$.totalElements").value(1));
        mvc.perform(request().param("cuisine", "taco")).andExpect(jsonPath("$.totalElements").value(0));
        for (String query : new String[]{"%", "_", "!", "\\", "' OR 1=1 --"}) {
            mvc.perform(request().param("q", query)).andExpect(status().isOk())
                    .andExpect(jsonPath("$.totalElements").value(0));
        }
    }

    @Test
    void distanceFiltersAndOrdersAndAcceptsCoincidentPoints() throws Exception {
        long far = stop("2026-09-28T17:00:00Z", "2026-09-28T19:00:00Z", 35, -118, "scheduled");
        long near = standard();
        mvc.perform(request().param("lat", "34").param("lon", "-118"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.items[0].stopId").value(near))
                .andExpect(jsonPath("$.items[1].stopId").value(far))
                .andExpect(jsonPath("$.items[0].distanceMeters", org.hamcrest.Matchers.lessThan(1.0)))
                .andExpect(jsonPath("$.items[1].distanceMeters", org.hamcrest.Matchers.closeTo(111195.0, 2.0)));
        mvc.perform(request().param("lat", "34").param("lon", "-118").param("radiusKm", "10"))
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void distanceCrossesDateLineAndHandlesAntipodes() throws Exception {
        stop("2026-09-28T17:00:00Z", "2026-09-28T19:00:00Z", 0, -179.9, "scheduled");
        mvc.perform(request().param("lat", "0").param("lon", "179.9").param("radiusKm", "30"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].distanceMeters", org.hamcrest.Matchers.closeTo(22239.0, 2.0)));
        mvc.perform(request().param("lat", "0").param("lon", "0.1"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].distanceMeters").value(org.hamcrest.Matchers.greaterThan(20000000.0), Double.class));
    }

    @Test
    void paginationIsStableAndRetainsTotalBeyondLastPage() throws Exception {
        long first = standard();
        long second = standard();
        mvc.perform(request().param("size", "1")).andExpect(jsonPath("$.items[0].stopId").value(first));
        mvc.perform(request().param("size", "1").param("page", "1"))
                .andExpect(jsonPath("$.items[0].stopId").value(second)).andExpect(jsonPath("$.totalPages").value(2));
        mvc.perform(request().param("page", "10000")).andExpect(jsonPath("$.items").isEmpty())
                .andExpect(jsonPath("$.totalElements").value(2));
    }

    @Test
    void defaultRangeStartsAtServerTimeAndExcludesOldStops() throws Exception {
        Instant now = Instant.now();
        stop(now.minusSeconds(3600).toString(), now.plusSeconds(3600).toString(), 34, -118, "scheduled");
        stop("2000-01-01T00:00:00Z", "2000-01-01T01:00:00Z", 34, -118, "scheduled");
        mvc.perform(get("/api/vendor-stops")).andExpect(status().isOk())
                .andExpect(jsonPath("$.totalElements").value(1));
    }

    @Test
    void overnightDstFallBackStopRetainsBothInstantsAndZone() throws Exception {
        // Two local 01:30 times, one hour apart across the Los Angeles fall-back.
        stop("2026-11-01T08:30:00Z", "2026-11-01T09:30:00Z", 34, -118, "scheduled");
        mvc.perform(get("/api/vendor-stops").param("from", "2026-10-31T23:00:00-07:00")
                .param("to", "2026-11-01T03:00:00-08:00"))
                .andExpect(status().isOk()).andExpect(jsonPath("$.totalElements").value(1))
                .andExpect(jsonPath("$.items[0].startsAt").value("2026-11-01T08:30:00Z"))
                .andExpect(jsonPath("$.items[0].endsAt").value("2026-11-01T09:30:00Z"));
    }

    @ParameterizedTest
    @CsvSource({"lat,34", "lon,-118", "radiusKm,10", "page,-1", "page,10001", "page,nope",
            "size,0", "size,101", "from,nope", "from,2026-09-28T16:00:00",
            "to,2026-09-28T16:00:00Z", "to,2026-11-01T00:00:00Z", "from,1800-01-01T00:00:00Z"})
    void invalidInputIsBadRequest(String key, String value) throws Exception {
        // Replace the existing window parameters rather than creating duplicates.
        var req = get("/api/vendor-stops").param("from", key.equals("from") ? value : "2026-09-28T16:00:00Z")
                .param("to", key.equals("to") ? value : "2026-09-28T20:00:00Z");
        if (!key.equals("from") && !key.equals("to")) req.param(key, value);
        mvc.perform(req).andExpect(status().isBadRequest())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"));
    }

    @ParameterizedTest
    @CsvSource({"lat,NaN", "lat,Infinity", "lat,91", "lon,-181", "radiusKm,NaN", "radiusKm,0", "radiusKm,101"})
    void rejectsInvalidCoordinatesAndRadius(String key, String value) throws Exception {
        var req = request().param("lat", key.equals("lat") ? value : "34")
                .param("lon", key.equals("lon") ? value : "-118");
        if (key.equals("radiusKm")) req.param(key, value);
        mvc.perform(req).andExpect(status().isBadRequest());
    }

    @Test
    void validatesLengthAndProtectsWrites() throws Exception {
        mvc.perform(request().param("q", "a".repeat(201))).andExpect(status().isBadRequest());
        mvc.perform(request().param("cuisine", "a".repeat(81))).andExpect(status().isBadRequest());
        mvc.perform(post("/api/vendor-stops")).andExpect(status().isForbidden());
        mvc.perform(get("/api/private").header("Accept", "application/json")).andExpect(status().isUnauthorized());
    }

    @ParameterizedTest
    @ValueSource(strings = {"latitude = 91", "longitude = -181", "latitude = 'NaN'",
            "latitude = 'Infinity'", "longitude = NULL", "ends_at = starts_at",
            "starts_at = '-infinity'", "venue_name = E'\\t'", "address = ''",
            "time_zone = 'MadeUp/Zone'", "time_zone = '+03:00'", "status = 'invalid'",
            "status = 'serving'", "vendor_id = 9223372036854775807"})
    void schemaRejectsInvalidUpdates(String assignment) {
        long id = standard();
        // Fixed test-only assignments, never user input. Transaction rolls back after each case.
        assertThatThrownBy(() -> jdbc.update("UPDATE vendor_stops SET " + assignment + " WHERE id = ?", id))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    void returnsServingMetadataWithoutClaimingFreshness() throws Exception {
        long id = standard();
        jdbc.update("UPDATE vendor_stops SET status='serving', last_confirmed_at=? WHERE id=?",
                Timestamp.from(Instant.parse("2026-09-28T17:00:00Z")), id);
        mvc.perform(request()).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].status").value("serving"))
                .andExpect(jsonPath("$.items[0].lastConfirmedAt").value("2026-09-28T17:00:00Z"))
                .andExpect(jsonPath("$.items[0].openNow").doesNotExist());
    }
}
