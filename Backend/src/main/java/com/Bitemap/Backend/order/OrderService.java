package com.Bitemap.Backend.order;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.UUID;
import java.util.Map;
import java.util.Collections;
import java.util.stream.Collectors;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import org.springframework.validation.annotation.Validated;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Validated
public class OrderService {
    private static final BigDecimal MAX_TOTAL = new BigDecimal("9999999999.99");
    private final JdbcTemplate jdbc;
    private final PickupService pickups;

    public OrderService(JdbcTemplate jdbc, PickupService pickups) { this.jdbc = jdbc; this.pickups = pickups; }

    @Transactional
    public OrderResponse create(String customerEmail, @NotNull @Valid CreateOrderRequest request) {
        requireUniqueItems(request);
        var customers = jdbc.queryForList("""
                SELECT u.id FROM app_users u
                JOIN app_user_roles r ON r.user_id=u.id AND r.role='CUSTOMER'
                WHERE lower(u.email)=lower(?) AND u.enabled
                FOR SHARE OF u,r
                """, Long.class, customerEmail);
        if (customers.isEmpty()) throw new AccessDeniedException("An enabled customer account is required.");
        long customerId = customers.getFirst();

        jdbc.queryForObject("SELECT pg_advisory_xact_lock(hashtextextended(?, 0))", Object.class,
                customerId + ":" + request.idempotencyKey());
        var existing = find(customerId, request.idempotencyKey());
        if (existing != null) {
            Map<Long, Integer> quantities = request.items().stream().collect(Collectors.toMap(CreateOrderRequest.Item::menuItemId, CreateOrderRequest.Item::quantity));
            if (existing.vendorId() != request.vendorId() || existing.pickup() == null
                    || existing.pickup().stopId() != request.pickupStopId() || existing.items().size() != quantities.size()
                    || existing.items().stream().anyMatch(item -> !Integer.valueOf(item.quantity()).equals(quantities.get(item.menuItemId()))))
                throw new OrderKeyConflictException();
            return existing;
        }

        Boolean accepting = jdbc.query("SELECT accepting_orders FROM vendors WHERE id=? FOR SHARE", rs ->
                rs.next() ? rs.getBoolean(1) : null, request.vendorId());
        if (accepting == null) throw new OrderUnavailableException("The selected truck is not available.");
        if (!accepting) throw new OrderUnavailableException("Temporarily not accepting orders.");

        // One bounded lookup, not one query per line. Lock in stable ID order.
        var parameters = new ArrayList<Object>();
        parameters.add(request.vendorId());
        request.items().stream().map(CreateOrderRequest.Item::menuItemId).sorted().forEach(parameters::add);
        String placeholders = String.join(",", Collections.nCopies(request.items().size(), "?"));
        var menu = jdbc.query("SELECT id,name,price,availability_status FROM vendor_menu_items WHERE vendor_id=? AND id IN ("
                + placeholders + ") ORDER BY id FOR SHARE", (rs, row) -> new MenuLine(rs.getLong("id"),rs.getString("name"),
                rs.getBigDecimal("price"),rs.getString("availability_status")), parameters.toArray()).stream()
                .collect(Collectors.toMap(MenuLine::id, item -> item));

        var lines = new ArrayList<OrderResponse.Item>();
        BigDecimal total = BigDecimal.ZERO;
        for (var requested : request.items()) {
            var item = menu.get(requested.menuItemId());
            // Missing and wrong-truck IDs deliberately have the same response.
            if (item == null || item.status().equals("INACTIVE"))
                throw new OrderUnavailableException("Item " + requested.menuItemId() + " is not available for this truck.");
            if (item.status().equals("SOLD_OUT")) throw new OrderUnavailableException("Item " + requested.menuItemId() + " is currently sold out.");
            if (!item.status().equals("ACTIVE")) throw new OrderUnavailableException("Item " + requested.menuItemId() + " is not available for this truck.");
            var line = new OrderResponse.Item(item.id(),item.name(),item.price(),requested.quantity(),item.price().multiply(BigDecimal.valueOf(requested.quantity())));
            lines.add(line);
            total = total.add(line.lineTotal());
        }

        if (total.compareTo(MAX_TOTAL) > 0) throw new InvalidOrderException("Order total exceeds the supported maximum. Reduce your cart.");
        // Evaluate the clock after waiting for menu locks, immediately before inserting.
        var pickup = pickups.requireCurrent(request.vendorId(), request.pickupStopId());
        long orderId = jdbc.queryForObject("""
                INSERT INTO customer_orders(customer_user_id,vendor_id,idempotency_key,total)
                VALUES (?,?,?,?) RETURNING id
                """, Long.class, customerId, request.vendorId(), request.idempotencyKey(), total);
        pickups.save(orderId, pickup);
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
            throw new InvalidOrderException("Each menu item may appear only once. Combine duplicate items into one quantity.");
        }
    }

    @Transactional(readOnly = true, isolation = org.springframework.transaction.annotation.Isolation.REPEATABLE_READ)
    public CustomerOrderPage list(String email,
            @jakarta.validation.constraints.Min(0) @jakarta.validation.constraints.Max(10000) int page,
            @jakarta.validation.constraints.Min(1) @jakarta.validation.constraints.Max(100) int size) {
        // Identity comes only from the authenticated principal. Both queries use the same scope.
        String scope = """
                FROM customer_orders o JOIN app_users u ON u.id=o.customer_user_id
                JOIN app_user_roles r ON r.user_id=u.id AND r.role='CUSTOMER'
                JOIN vendors v ON v.id=o.vendor_id
                WHERE lower(u.email)=lower(?) AND u.enabled
                """;
        long count = jdbc.queryForObject("SELECT count(*) " + scope, Long.class, email);
        var items = jdbc.query("SELECT o.id,o.vendor_id,v.name,o.status,o.total,o.created_at " + scope
                + " ORDER BY o.created_at DESC,o.id DESC LIMIT ? OFFSET ?",
                (rs, row) -> new CustomerOrderPage.Summary(rs.getLong(1), rs.getLong(2), rs.getString(3),
                        OrderStatus.valueOf(rs.getString(4)), rs.getBigDecimal(5), rs.getTimestamp(6).toInstant()),
                email, size, (long) page * size);
        return new CustomerOrderPage(items, page, size, count, (count + size - 1) / size);
    }

    private OrderResponse find(long customerId, UUID key) {
        Long id = jdbc.query("SELECT id FROM customer_orders WHERE customer_user_id=? AND idempotency_key=?",
                rs -> rs.next() ? rs.getLong(1) : null, customerId, key);
        return id == null ? null : load(id);
    }

    private OrderResponse load(long orderId) {
        var header = jdbc.queryForObject("""
                SELECT o.id,o.vendor_id,v.name,o.status,o.total,o.created_at,o.cancellation_reason
                FROM customer_orders o JOIN vendors v ON v.id=o.vendor_id WHERE o.id=?
                """, (rs, row) -> new Header(rs.getLong(1), rs.getLong(2), rs.getString(3), rs.getString(4),
                        rs.getBigDecimal(5), rs.getTimestamp(6).toInstant(), rs.getString(7)), orderId);
        var items = jdbc.query("""
                SELECT menu_item_id,name_snapshot,unit_price,quantity,line_total
                FROM customer_order_items WHERE order_id=? ORDER BY id
                """, (rs, row) -> new OrderResponse.Item(rs.getLong(1), rs.getString(2), rs.getBigDecimal(3),
                        rs.getInt(4), rs.getBigDecimal(5)), orderId);
        return new OrderResponse(header.id(), header.vendorId(), header.vendorName(), header.status(),
                header.total(), header.createdAt(), items, header.cancellationReason(), pickups.saved(orderId));
    }

    private record MenuLine(long id, String name, BigDecimal price, String status) {}

    private record Header(long id, long vendorId, String vendorName, String status,
            BigDecimal total, Instant createdAt, String cancellationReason) {}
}
