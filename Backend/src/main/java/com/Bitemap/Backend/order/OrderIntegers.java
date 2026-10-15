package com.Bitemap.Backend.order;

import tools.jackson.core.JsonParser;
import tools.jackson.core.JsonToken;
import tools.jackson.databind.DeserializationContext;
import tools.jackson.databind.ValueDeserializer;

/** Local to checkout: do not silently round fractional IDs/quantities or coerce strings. */
public final class OrderIntegers {
    private OrderIntegers() {}
    public static class Id extends ValueDeserializer<Long> {
        @Override public Long deserialize(JsonParser parser, DeserializationContext context) {
            if (!parser.hasToken(JsonToken.VALUE_NUMBER_INT)) return context.reportInputMismatch(Long.class, "Expected an integer ID.");
            return parser.getLongValue();
        }
    }
    public static class Quantity extends ValueDeserializer<Integer> {
        @Override public Integer deserialize(JsonParser parser, DeserializationContext context) {
            if (!parser.hasToken(JsonToken.VALUE_NUMBER_INT)) return context.reportInputMismatch(Integer.class, "Expected an integer quantity.");
            return parser.getIntValue();
        }
    }
}
