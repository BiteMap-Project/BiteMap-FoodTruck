package com.Bitemap.Backend.order;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record OperatorOrderResponse(long id, long vendorId, OrderStatus status, BigDecimal total,
        Instant createdAt, Instant updatedAt, Instant estimatedReadyAt, long version,
        String cancellationReason, List<OrderResponse.Item> items, PickupDetails pickup, Instant acceptanceDeadline) {
    public OperatorOrderResponse { items = List.copyOf(items); }

    public record Summary(long id, long vendorId, OrderStatus status, BigDecimal total,
            Instant createdAt, Instant updatedAt, Instant estimatedReadyAt, long version,
            String cancellationReason, Instant acceptanceDeadline) {}

    public record Page(List<Summary> items, int page, int size, long totalElements, long totalPages) {
        public Page { items = List.copyOf(items); }
    }
}
