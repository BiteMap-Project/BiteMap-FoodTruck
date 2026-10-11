package com.Bitemap.Backend.order;

import java.util.List;
import java.util.UUID;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

public record CreateOrderRequest(
        @Positive long vendorId,
        @NotNull UUID idempotencyKey,
        @NotEmpty @Size(max = 50) List<@Valid Item> items) {

    public record Item(@Positive long menuItemId, @Min(1) @Max(10) int quantity) {}
}
