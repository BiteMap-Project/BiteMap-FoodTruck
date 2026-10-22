package com.Bitemap.Backend.vendor;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import tools.jackson.databind.annotation.JsonDeserialize;

public record OrderingControl(boolean acceptingOrders, long version) {
    public record Update(@NotNull @JsonDeserialize(using = StrictBoolean.class) Boolean acceptingOrders,
                         @NotNull @PositiveOrZero @JsonDeserialize(using = StrictVersion.class) Long version) {}

    public static class StrictBoolean extends tools.jackson.databind.ValueDeserializer<Boolean> {
        @Override public Boolean deserialize(tools.jackson.core.JsonParser p, tools.jackson.databind.DeserializationContext c) {
            if (!p.hasToken(tools.jackson.core.JsonToken.VALUE_TRUE) && !p.hasToken(tools.jackson.core.JsonToken.VALUE_FALSE))
                return c.reportInputMismatch(Boolean.class, "Expected a JSON boolean.");
            return p.getBooleanValue();
        }
    }
    public static class StrictVersion extends tools.jackson.databind.ValueDeserializer<Long> {
        @Override public Long deserialize(tools.jackson.core.JsonParser p, tools.jackson.databind.DeserializationContext c) {
            if (!p.hasToken(tools.jackson.core.JsonToken.VALUE_NUMBER_INT))
                return c.reportInputMismatch(Long.class, "Expected an integer version.");
            return p.getLongValue();
        }
    }
}
