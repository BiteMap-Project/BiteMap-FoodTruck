package com.Bitemap.Backend.order;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record CustomerOrderPage(List<Summary> items, int page, int size, long totalElements, long totalPages) {
    public CustomerOrderPage { items = List.copyOf(items); }
    public record Summary(long id, long vendorId, String vendorName, OrderStatus status,
            BigDecimal total, Instant createdAt) {}
}
