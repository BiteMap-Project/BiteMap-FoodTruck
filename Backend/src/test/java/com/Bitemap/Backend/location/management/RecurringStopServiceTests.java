package com.Bitemap.Backend.location.management;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.*;
import static com.Bitemap.Backend.location.management.RecurringStopService.Frequency.*;

class RecurringStopServiceTests {
    private StopRequests.Details stop(String start, String end) {
        return new StopRequests.Details("Lunch", "CSUN", 34.24, -118.53,
                OffsetDateTime.parse(start), OffsetDateTime.parse(end), "America/Los_Angeles");
    }

    private RecurringStopService.Request request(StopRequests.Details stop,
            RecurringStopService.Frequency frequency, String until) {
        return new RecurringStopService.Request(stop, frequency, LocalDate.parse(until));
    }

    @Test void everyFrequencyIncludesTheFirstAndMatchingLastDate() {
        var first = stop("2030-01-03T11:00:00-08:00", "2030-01-03T14:00:00-08:00");
        for (var frequency : RecurringStopService.Frequency.values()) {
            var rows = RecurringStopService.expand(request(first, frequency, "2030-01-31"));
            assertThat(rows).hasSize(28 / frequency.days + 1);
            assertThat(rows.get(0)).isEqualTo(first);
            assertThat(rows.get(rows.size() - 1).startsAt().toLocalDate()).isEqualTo(LocalDate.parse("2030-01-31"));
        }
    }

    @Test void overnightStopsKeepTheirNextDayEndAndVenue() {
        var first = stop("2030-01-03T23:00:00-08:00", "2030-01-04T03:00:00-08:00");
        var rows = RecurringStopService.expand(request(first, EVERY_2_WEEKS, "2030-02-01"));
        assertThat(rows).hasSize(3);
        assertThat(rows.get(2).startsAt()).isEqualTo(OffsetDateTime.parse("2030-01-31T23:00:00-08:00"));
        assertThat(rows.get(2).endsAt()).isEqualTo(OffsetDateTime.parse("2030-02-01T03:00:00-08:00"));
        assertThat(rows.get(2).address()).isEqualTo(first.address());
    }

    @Test void weeklyTimesStayAtElevenAcrossSpringAndFall() {
        var spring = RecurringStopService.expand(request(
                stop("2030-03-03T11:00:00-08:00", "2030-03-03T14:00:00-08:00"), WEEKLY, "2030-03-10"));
        assertThat(spring.get(1).startsAt()).isEqualTo(OffsetDateTime.parse("2030-03-10T11:00:00-07:00"));
        var fall = RecurringStopService.expand(request(
                stop("2030-10-27T11:00:00-07:00", "2030-10-27T14:00:00-07:00"), WEEKLY, "2030-11-03"));
        assertThat(fall.get(1).startsAt()).isEqualTo(OffsetDateTime.parse("2030-11-03T11:00:00-08:00"));
    }

    @Test void rejectsASkippedHourInsteadOfSilentlyMovingIt() {
        var first = stop("2030-03-03T02:30:00-08:00", "2030-03-03T04:00:00-08:00");
        assertThatThrownBy(() -> RecurringStopService.expand(request(first, WEEKLY, "2030-03-17")))
                .isInstanceOf(ScheduleException.class).hasMessageContaining("2030-03-10T02:30");
    }

    @Test void repeatedHourUsesTheTemplatesOffsetWhenAvailable() {
        var first = stop("2030-10-27T01:30:00-07:00", "2030-10-27T03:00:00-07:00");
        var rows = RecurringStopService.expand(request(first, WEEKLY, "2030-11-03"));
        assertThat(rows.get(1).startsAt()).isEqualTo(OffsetDateTime.parse("2030-11-03T01:30:00-07:00"));
        assertThat(rows.get(1).endsAt()).isEqualTo(OffsetDateTime.parse("2030-11-03T03:00:00-08:00"));
    }

    @Test void leapDayAndYearBoundariesAreCalendarBased() {
        var rows = RecurringStopService.expand(request(
                stop("2032-02-28T11:00:00-08:00", "2032-02-28T14:00:00-08:00"), DAILY, "2032-03-01"));
        assertThat(rows).hasSize(3);
        assertThat(rows.get(1).startsAt().getDayOfMonth()).isEqualTo(29);
        assertThat(RecurringStopService.expand(request(
                stop("2030-12-31T11:00:00-08:00", "2030-12-31T14:00:00-08:00"), DAILY, "2031-01-01")))
                .hasSize(2);
    }

    @Test void rejectsShortLongAndExcessiveRepeatsAndWrongOffsets() {
        var first = stop("2030-01-03T11:00:00-08:00", "2030-01-03T14:00:00-08:00");
        for (String until : new String[]{"2030-01-02", "2030-01-03", "2030-04-01", "2031-01-04"}) {
            assertThatThrownBy(() -> RecurringStopService.expand(request(first, DAILY, until)))
                    .isInstanceOf(ScheduleException.class);
        }
        assertThat(RecurringStopService.expand(request(first, DAILY, "2030-02-23"))).hasSize(52);
        assertThatThrownBy(() -> RecurringStopService.expand(request(
                stop("2030-01-03T11:00:00-07:00", "2030-01-03T14:00:00-07:00"), WEEKLY, "2030-01-10")))
                .isInstanceOf(ScheduleException.class).hasMessageContaining("offsets");
    }
}
