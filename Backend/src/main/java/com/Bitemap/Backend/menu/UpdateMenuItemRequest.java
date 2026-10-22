package com.Bitemap.Backend.menu;

import java.math.BigDecimal;
import jakarta.validation.constraints.*;

public record UpdateMenuItemRequest(
        @NotBlank @Size(max = 150) String name,
        @Size(max = 500) String description,
        @NotNull @DecimalMin("0.00") @Digits(integer = 8, fraction = 2) BigDecimal price,
        @NotNull @PositiveOrZero Long version,
        MenuImagePreset imagePreset) {
    public UpdateMenuItemRequest {
        name = name == null ? null : name.strip();
        description = description == null || description.isBlank() ? null : description.strip();
    }

    public UpdateMenuItemRequest(String name, String description, BigDecimal price, Long version) {
        this(name, description, price, version, null);
    }
}
