package com.Bitemap.Backend.location.management;

import java.time.Instant;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;

public record SavedLocation(long id, String name, String venueName, String address, double latitude,
        double longitude, String timeZone, boolean archived, long version, Instant updatedAt) {
    public record Details(@NotBlank @Size(max=80) String name,
            @NotBlank @Size(max=160) String venueName, @NotBlank @Size(max=300) String address,
            @NotNull @DecimalMin("-90") @DecimalMax("90") Double latitude,
            @NotNull @DecimalMin("-180") @DecimalMax("180") Double longitude,
            @NotBlank @Size(max=80) String timeZone,
            @NotNull @AssertTrue(message="Confirm the pickup pin before saving.")
            @tools.jackson.databind.annotation.JsonDeserialize(using=com.Bitemap.Backend.vendor.OrderingControl.StrictBoolean.class)
            Boolean locationConfirmed) {
        public Details {
            name = name == null ? null : name.strip();
            venueName = venueName == null ? null : venueName.strip();
            address = address == null ? null : address.strip();
            timeZone = timeZone == null ? null : timeZone.strip();
        }
    }
    public record Update(@NotNull @Valid Details location, @NotNull @PositiveOrZero Long version) {}
    public record Archive(@NotNull @PositiveOrZero Long version) {}
}
