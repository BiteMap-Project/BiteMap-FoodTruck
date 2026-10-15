package com.Bitemap.Backend.order;

import java.util.List;
import java.util.UUID;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import tools.jackson.databind.annotation.JsonDeserialize;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

@JsonIgnoreProperties(ignoreUnknown = true)
public record CreateOrderRequest(
        @NotNull(message = "vendorId is required") @NonZeroId
        @JsonDeserialize(using = OrderIntegers.Id.class) Long vendorId,
        @NotNull(message = "idempotencyKey is required") UUID idempotencyKey,
        @NotEmpty(message = "Provide at least one menu item") @Size(max = 50, message = "Provide at most 50 distinct menu items")
        List<@NotNull(message = "Menu item must not be null") @Valid Item> items) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Item(@NotNull(message = "menuItemId is required") @NonZeroId
            @JsonDeserialize(using = OrderIntegers.Id.class) Long menuItemId,
            @NotNull(message = "quantity is required") @Min(value = 1, message = "Quantity must be between 1 and 10")
            @Max(value = 10, message = "Quantity must be between 1 and 10")
            @JsonDeserialize(using = OrderIntegers.Quantity.class) Integer quantity) {}
}
