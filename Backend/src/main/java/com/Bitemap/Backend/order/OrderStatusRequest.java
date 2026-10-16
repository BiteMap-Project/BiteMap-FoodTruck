package com.Bitemap.Backend.order;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;
import tools.jackson.databind.annotation.JsonDeserialize;

public record OrderStatusRequest(
        @NotNull @JsonDeserialize(using = StatusDeserializer.class) OrderStatus status,
        @NotNull @PositiveOrZero @JsonDeserialize(using = OrderIntegers.Id.class) Long version,
        @Size(max = 500) String cancellationReason) {
    /** Do not accept enum ordinals or numeric strings as order status commands. */
    public static class StatusDeserializer extends tools.jackson.databind.ValueDeserializer<OrderStatus> {
        @Override
        public OrderStatus deserialize(tools.jackson.core.JsonParser parser,
                tools.jackson.databind.DeserializationContext context) {
            if (!parser.hasToken(tools.jackson.core.JsonToken.VALUE_STRING)) {
                return context.reportInputMismatch(OrderStatus.class, "Expected a status name.");
            }
            try {
                return OrderStatus.valueOf(parser.getString());
            } catch (IllegalArgumentException exception) {
                return context.reportInputMismatch(OrderStatus.class, "Expected a supported status name.");
            }
        }
    }
}
