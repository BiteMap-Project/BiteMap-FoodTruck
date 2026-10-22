package com.Bitemap.Backend.menu;

import java.math.BigDecimal;
import jakarta.validation.constraints.*;

public record CreateMenuItemRequest(
        @NotBlank @Size(max = 150) String name,
        @Size(max = 500) String description,
        @NotNull @DecimalMin("0.00") @Digits(integer = 8, fraction = 2) BigDecimal price,
        @NotNull MenuAvailability status,
        MenuImagePreset imagePreset) {
    public CreateMenuItemRequest {
        name = name == null ? null : name.strip();
        description = description == null || description.isBlank() ? null : description.strip();
    }

    public CreateMenuItemRequest(String name, String description, BigDecimal price, MenuAvailability status) {
        this(name, description, price, status, MenuImagePreset.GENERIC);
    }
}
