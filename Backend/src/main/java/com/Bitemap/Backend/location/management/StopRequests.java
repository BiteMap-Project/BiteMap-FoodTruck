package com.Bitemap.Backend.location.management;

import java.time.OffsetDateTime;
import com.fasterxml.jackson.annotation.JsonFormat;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

public final class StopRequests {
    private StopRequests() {}

    public record Details(
            @NotBlank @Size(max = 160) String venueName,
            @NotBlank @Size(max = 300) String address,
            @NotNull @DecimalMin("-90") @DecimalMax("90") Double latitude,
            @NotNull @DecimalMin("-180") @DecimalMax("180") Double longitude,
            @NotNull @JsonFormat(without = JsonFormat.Feature.ADJUST_DATES_TO_CONTEXT_TIME_ZONE) OffsetDateTime startsAt,
            @NotNull @JsonFormat(without = JsonFormat.Feature.ADJUST_DATES_TO_CONTEXT_TIME_ZONE) OffsetDateTime endsAt,
            @NotBlank @Size(max = 80) String timeZone) {
        public Details {
            venueName = venueName == null ? null : venueName.strip();
            address = address == null ? null : address.strip();
            timeZone = timeZone == null ? null : timeZone.strip();
        }
    }

    public record Update(@NotNull @Valid Details stop, @NotNull @PositiveOrZero Long version) {}
    public record Cancel(@NotNull @PositiveOrZero Long version) {}
}
