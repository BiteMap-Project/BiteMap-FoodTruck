package com.Bitemap.Backend.order;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import tools.jackson.databind.annotation.JsonDeserialize;

public record CancelOrderRequest(
        @NotNull @PositiveOrZero @JsonDeserialize(using = OrderIntegers.Id.class) Long version) {}
