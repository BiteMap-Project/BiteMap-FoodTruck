package com.Bitemap.Backend.order;

import java.math.BigDecimal;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class OrderService {
    private final JdbcTemplate jdbc;

    public OrderService(JdbcTemplate jdbc) { this.jdbc = jdbc; }

    @Transactional
    public OrderResponse create(String customerEmail, CreateOrderRequest request) {
        requireUniqueItems(request);
        long customerId = jdbc.queryForObject("""
                SELECT u.id FROM app_users u
                JOIN app_user_roles r ON r.user_id=u.id AND r.role='CUSTOMER'
                WHERE lower(u.email)=lower(?) AND u.enabled
                FOR SHARE OF u
                """, Long.class, customerEmail);

        jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", Object.class,
                customerId + ":" + request.idempotencyKey());
        var existing = find(customerId, request.idempotencyKey());
        if (existing != null) return existing;

        String vendorName = jdbc.query("SELECT name FROM vendors WHERE id=? FOR SHARE", rs ->
                rs.next() ? rs.getString(1) : null, request.vendorId());
        if (vendorName == null) throw new OrderUnavailableException();

        var lines = new ArrayList<OrderResponse.Item>();
        BigDecimal total = BigDecimal.ZERO;
        for (var requested : request.items()) {
            var line = jdbc.query("""
                    SELECT id,name,price FROM vendor_menu_items
                    WHERE id=? AND vendor_id=? AND availability_status='ACTIVE'
                    FOR SHARE
                    """, rs -> rs.next() ? line(rs, requested.quantity()) : null,
                    requested.menuItemId(), request.vendorId());
            if (line == null) throw new OrderUnavailableException();
            lines.add(line);
            total = total.add(line.lineTotal());
        }

        long orderId = jdbc.queryForObject("""
                INSERT INTO customer_orders(customer_user_id,vendor_id,idempotency_key,total)
                VALUES (?,?,?,?) RETURNING id
                """, Long.class, customerId, request.vendorId(), request.idempotencyKey(), total);
        for (var line : lines) jdbc.update("""
                INSERT INTO customer_order_items(order_id,menu_item_id,name_snapshot,unit_price,quantity,line_total)
                VALUES (?,?,?,?,?,?)
                """, orderId, line.menuItemId(), line.name(), line.unitPrice(), line.quantity(), line.lineTotal());
        return load(orderId);
    }

    @Transactional(readOnly = true)
    public OrderResponse get(String customerEmail, long orderId) {
        Long id = jdbc.query("""
                SELECT o.id FROM customer_orders o
                JOIN app_users u ON u.id=o.customer_user_id
                WHERE o.id=? AND lower(u.email)=lower(?) AND u.enabled
                """, rs -> rs.next() ? rs.getLong(1) : null, orderId, customerEmail);
        if (id == null) throw new OrderNotFoundException();
        return load(id);
    }

    private void requireUniqueItems(CreateOrderRequest request) {
        var ids = new HashSet<Long>();
        if (request.items().stream().anyMatch(item -> !ids.add(item.menuItemId()))) {
            throw new IllegalArgumentException("Each menu item may appear only once.");
        }
    }

    private OrderResponse find(long customerId, UUID key) {
        Long id = jdbc.query("SELECT id FROM customer_orders WHERE customer_user_id=? AND idempotency_key=?",
                rs -> rs.next() ? rs.getLong(1) : null, customerId, key);
        return id == null ? null : load(id);
    }

    private OrderResponse load(long orderId) {
        var header = jdbc.queryForObject("""
                SELECT o.id,o.vendor_id,v.name,o.status,o.total,o.created_at
                FROM customer_orders o JOIN vendors v ON v.id=o.vendor_id WHERE o.id=?
                """, (rs, row) -> new Header(rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getString(4),
                        rs.getBigDecimal(5), rs.getTimestamp(6).toInstant()), orderId);
        var items = jdbc.query("""
                SELECT menu_item_id,name_snapshot,unit_price,quantity,line_total
                FROM customer_order_items WHERE order_id=? ORDER BY id
                """, (rs, row) -> new OrderResponse.Item(rs.getLong(1), rs.getString(2), rs.getBigDecimal(3),
                        rs.getInt(4), rs.getBigDecimal(5)), orderId);
        return new OrderResponse(header.id(), header.vendorId(), header.vendorName(), header.status(),
                header.total(), header.createdAt(), items);
    }

    private OrderResponse.Item line(ResultSet rs, int quantity) throws SQLException {
        BigDecimal price = rs.getBigDecimal("price");
        return new OrderResponse.Item(rs.getLong("id"), rs.getString("name"), price, quantity,
                price.multiply(BigDecimal.valueOf(quantity)));
    }

    private record Header(long id, long vendorId, String vendorName, String status,
            BigDecimal total, Instant createdAt) {}
}
