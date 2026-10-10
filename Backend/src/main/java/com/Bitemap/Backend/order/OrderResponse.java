package com.Bitemap.Backend.order;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record OrderResponse(long id, long vendorId, String vendorName, String status,
        BigDecimal total, Instant createdAt, List<Item> items) {

    public record Item(long menuItemId, String name, BigDecimal unitPrice, int quantity, BigDecimal lineTotal) {}
}
