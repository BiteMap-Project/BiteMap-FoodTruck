package com.Bitemap.Backend.order;

import java.time.Instant;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import tools.jackson.databind.annotation.JsonDeserialize;

public record OrderEstimateRequest(
        @NotNull Instant estimatedReadyAt,
        @NotNull @PositiveOrZero @JsonDeserialize(using = OrderIntegers.Id.class) Long version) {}
