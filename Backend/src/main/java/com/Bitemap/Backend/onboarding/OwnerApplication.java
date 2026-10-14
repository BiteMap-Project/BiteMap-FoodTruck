package com.Bitemap.Backend.onboarding;

import java.time.Instant;
import jakarta.validation.constraints.*;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

public record OwnerApplication(long id, String businessName, String contactEmail, String operatingArea,
        String status, Instant submittedAt, Instant reviewedAt, Long reviewedBy, String reviewNote) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Submit(@NotBlank @Size(max=120) String businessName,
            @NotBlank @Email @Size(max=320) String contactEmail,
            @NotBlank @Size(max=240) String operatingArea) {}
    public enum Decision { APPROVED, REJECTED }
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Review(@NotNull Decision decision, @NotBlank @Size(max=500) String note) {}
}
