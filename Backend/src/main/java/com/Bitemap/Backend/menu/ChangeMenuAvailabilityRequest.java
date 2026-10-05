package com.Bitemap.Backend.menu;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;

public record ChangeMenuAvailabilityRequest(@NotNull MenuAvailability status,
                                           @NotNull @PositiveOrZero Long version) {}
