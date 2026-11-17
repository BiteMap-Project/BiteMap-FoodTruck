package com.Bitemap.Backend.order;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import tools.jackson.databind.annotation.JsonDeserialize;

public record VerifyPickupRequest(
        @NotNull @Pattern(regexp = "[0-9]{6}") @JsonDeserialize(using = CodeDeserializer.class) String code,
        @NotNull @PositiveOrZero @JsonDeserialize(using = OrderIntegers.Id.class) Long version) {
    @Override public String toString() { return "VerifyPickupRequest[code=REDACTED]"; }
    public static class CodeDeserializer extends tools.jackson.databind.ValueDeserializer<String> {
        @Override public String deserialize(tools.jackson.core.JsonParser parser, tools.jackson.databind.DeserializationContext context) {
            if (!parser.hasToken(tools.jackson.core.JsonToken.VALUE_STRING))
                return context.reportInputMismatch(String.class, "Pickup code must be a six-digit string.");
            return parser.getString();
        }
    }
}
