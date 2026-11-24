package com.Bitemap.Backend.vendor;

import java.sql.ResultSet;
import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.RowCallbackHandler;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class TruckAvailabilityServiceTests {
    private final Instant now = Instant.parse("2026-11-18T12:00:00Z");

    @Test
    void reportsOpenAndClosingSoonUsingTheOrderingCutoff() throws Exception {
        assertThat(status(true, 1, 120, 10)).isEqualTo("OPEN");
        assertThat(status(true, 1, 40, 10)).isEqualTo("CLOSING_SOON");
    }

    @Test
    void reportsClosedWhenPausedWithoutAnActiveStopOrAtCutoff() throws Exception {
        assertThat(status(false, 1, 120, 10)).isEqualTo("CLOSED");
        assertThat(status(true, 0, 120, 10)).isEqualTo("CLOSED");
        assertThat(status(true, 1, 10, 10)).isEqualTo("CLOSED");
    }

    private String status(boolean accepting, int activeCount, int minutesLeft, int cutoff) throws Exception {
        var jdbc = mock(NamedParameterJdbcTemplate.class);
        var row = mock(ResultSet.class);
        when(row.getLong("id")).thenReturn(1L);
        when(row.getLong("stop_id")).thenReturn(7L);
        when(row.getLong("active_count")).thenReturn((long) activeCount);
        when(row.getLong("ordering_cutoff_minutes")).thenReturn((long) cutoff);
        when(row.getBoolean("accepting_orders")).thenReturn(accepting);
        when(row.getTimestamp("ends_at")).thenReturn(Timestamp.from(now.plusSeconds(minutesLeft * 60L)));
        doAnswer(call -> { call.getArgument(2, RowCallbackHandler.class).processRow(row); return null; })
            .when(jdbc).query(anyString(), org.mockito.ArgumentMatchers.<String, Object>anyMap(), any(RowCallbackHandler.class));
        var service = new TruckAvailabilityService(jdbc, Clock.fixed(now, ZoneOffset.UTC));
        return service.forVendors(List.of(1L)).get(1L).status();
    }
}