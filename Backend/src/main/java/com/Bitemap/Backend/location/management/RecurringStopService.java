package com.Bitemap.Backend.location.management;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

@Service
@Validated
public class RecurringStopService {
    private final OperatorStopService stops;

    public RecurringStopService(OperatorStopService stops) {
        this.stops = stops;
    }

    public enum Frequency {
        DAILY(1), EVERY_2_DAYS(2), WEEKLY(7), EVERY_2_WEEKS(14);

        final int days;
        Frequency(int days) { this.days = days; }
    }

    public record Request(
            @NotNull @Valid StopRequests.Details stop,
            @NotNull Frequency frequency,
            @NotNull LocalDate until) {}

    // Existing create() joins this transaction and keeps its ownership, vendor
    // locking, validation and overlap checks. Any failed stop rolls back ALL stops.
    @Transactional(isolation = Isolation.READ_COMMITTED)
    public List<ManagedStop> create(String email, long vendorId, @NotNull @Valid Request request) {
        var results = new ArrayList<ManagedStop>();
        for (var occurrence : expand(request)) {
            try {
                results.add(stops.create(email, vendorId, occurrence));
            } catch (ScheduleException error) {
                if (error.kind() == ScheduleException.Kind.NOT_FOUND) throw error;
                throw new ScheduleException(error.kind(), "No stops saved. "
                        + occurrence.startsAt().toLocalDate() + ": " + error.getMessage());
            }
        }
        return List.copyOf(results);
    }

    static List<StopRequests.Details> expand(Request request) {
        var template = request.stop();
        var first = template.startsAt().toLocalDate();
        long span = ChronoUnit.DAYS.between(first, request.until());
        long count = span / request.frequency().days + 1;
        if (span < 0 || span > 365 || count < 2 || count > 52) {
            throw invalid("Choose 2–52 stops, ending within 365 days of the first start date.");
        }
        try {
            var zone = ZoneId.of(template.timeZone());
            checkOffset(template.startsAt(), zone);
            checkOffset(template.endsAt(), zone);
            var results = new ArrayList<StopRequests.Details>();
            for (int index = 0; index < count; index++) {
                long days = (long) index * request.frequency().days;
                // Calendar days preserve the venue's clock times across DST.
                var start = resolve(template.startsAt().toLocalDateTime().plusDays(days),
                        zone, template.startsAt().getOffset());
                var end = resolve(template.endsAt().toLocalDateTime().plusDays(days),
                        zone, template.endsAt().getOffset());
                if (!end.toInstant().isAfter(start.toInstant())) {
                    throw invalid("End must be after start on " + start.toLocalDate()
                            + ". Adjust the hours or schedule this date separately.");
                }
                results.add(new StopRequests.Details(template.venueName(), template.address(),
                        template.latitude(), template.longitude(), start, end, template.timeZone()));
            }
            return List.copyOf(results);
        } catch (DateTimeException error) {
            throw invalid("Choose valid dates and a supported time zone.");
        }
    }

    private static void checkOffset(OffsetDateTime time, ZoneId zone) {
        if (!zone.getRules().getValidOffsets(time.toLocalDateTime()).contains(time.getOffset())) {
            throw invalid("The first stop's offsets must match its time zone.");
        }
    }

    private static OffsetDateTime resolve(LocalDateTime local, ZoneId zone, ZoneOffset preferred) {
        var offsets = zone.getRules().getValidOffsets(local);
        if (offsets.isEmpty()) {
            throw invalid("The time " + local + " does not exist due to daylight saving. "
                    + "Adjust the hours or end the repeat before that date. No stops saved.");
        }
        // During a repeated hour, keep the first stop's offset if available;
        // otherwise use the first occurrence of that clock time.
        return OffsetDateTime.of(local, offsets.contains(preferred) ? preferred : offsets.get(0));
    }

    private static ScheduleException invalid(String message) {
        return new ScheduleException(ScheduleException.Kind.INVALID, message);
    }
}
