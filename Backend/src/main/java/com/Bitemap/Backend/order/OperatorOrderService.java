package com.Bitemap.Backend.order;

import com.Bitemap.Backend.auth.OperatorOwnership;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import java.util.ArrayList;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;
import static com.Bitemap.Backend.order.OperatorOrderException.Kind.*;

@Service
@Validated
@Transactional
public class OperatorOrderService {
    private final JdbcTemplate jdbc;
    private final PickupService pickups;
    private static final String FIELDS = "id,vendor_id,status,total,created_at,updated_at,version,cancellation_reason";
    private static final RowMapper<OperatorOrderResponse.Summary> SUMMARY = (row, index) ->
            new OperatorOrderResponse.Summary(row.getLong("id"), row.getLong("vendor_id"),
                    OrderStatus.valueOf(row.getString("status")), row.getBigDecimal("total"),
                    row.getTimestamp("created_at").toInstant(), row.getTimestamp("updated_at").toInstant(),
                    row.getLong("version"), row.getString("cancellation_reason"));

    public OperatorOrderService(JdbcTemplate jdbc, PickupService pickups) { this.jdbc = jdbc; this.pickups = pickups; }

    // Repeatable read makes count/page consistent. These transactions deliberately allow
    // shared locks: ownership and role revocation must not race the read or update.
    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public OperatorOrderResponse.Page list(String email, long vendorId, OrderStatus status,
            @Min(0) @Max(10000) int page, @Min(1) @Max(100) int size) {
        ownedVendor(email, vendorId);
        String where = " WHERE vendor_id=?" + (status == null ? "" : " AND status=?");
        var args = new ArrayList<Object>();
        args.add(vendorId);
        if (status != null) args.add(status.name());
        long count = jdbc.queryForObject("SELECT count(*) FROM customer_orders" + where, Long.class, args.toArray());
        args.add(size);
        args.add((long) page * size);
        var items = jdbc.query("SELECT " + FIELDS + " FROM customer_orders" + where
                + " ORDER BY created_at DESC,id DESC LIMIT ? OFFSET ?", SUMMARY, args.toArray());
        return new OperatorOrderResponse.Page(items, page, size, count, (count + size - 1) / size);
    }

    public OperatorOrderResponse get(String email, long vendorId, long orderId) {
        ownedVendor(email, vendorId);
        return detail(header(vendorId, orderId, false));
    }

    public OperatorOrderResponse update(String email, long vendorId, long orderId,
            @NotNull @Valid OrderStatusRequest request) {
        long actor = ownedVendor(email, vendorId);
        var current = header(vendorId, orderId, true);
        if (current.version() != request.version()) {
            throw new OperatorOrderException(CONFLICT, "This order has changed. Refresh it before updating its status.");
        }
        if (!current.status().canTransitionTo(request.status())) {
            throw new OperatorOrderException(CONFLICT,
                    "Cannot change an order from " + current.status() + " to " + request.status() + ".");
        }
        String reason = request.cancellationReason() == null ? "" : request.cancellationReason().strip();
        if (request.status() == OrderStatus.CANCELLED && reason.isBlank()) {
            throw new OperatorOrderException(INVALID, "Provide a cancellation reason (1–500 characters).");
        }
        if (request.status() != OrderStatus.CANCELLED && !reason.isEmpty()) {
            throw new OperatorOrderException(INVALID, "A cancellation reason is only allowed when cancelling an order.");
        }
        String savedReason = request.status() == OrderStatus.CANCELLED ? reason : null;
        // Row lock serializes writers; version predicate also rejects stale clients.
        var updated = jdbc.query("UPDATE customer_orders SET status=?,version=version+1,"
                + "updated_at=clock_timestamp(),cancellation_reason=? WHERE id=? AND vendor_id=? AND version=? RETURNING " + FIELDS,
                SUMMARY, request.status().name(), savedReason, orderId, vendorId, request.version());
        if (updated.isEmpty()) throw new OperatorOrderException(CONFLICT, "This order has changed. Refresh it before updating its status.");
        var result = updated.getFirst();
        jdbc.update("""
                INSERT INTO customer_order_status_history
                    (order_id,from_status,to_status,version,changed_by_user_id,changed_at,cancellation_reason)
                VALUES (?,?,?,?,?,?,?)
                """, orderId, current.status().name(), result.status().name(), result.version(), actor,
                java.sql.Timestamp.from(result.updatedAt()), savedReason);
        return detail(result);
    }

    private long ownedVendor(String email, long vendorId) {
        var owners = jdbc.queryForList(OperatorOwnership.SQL, Long.class, email);
        if (owners.isEmpty()) throw new OperatorOrderException(FORBIDDEN, "An enabled operator account is required.");
        var users = jdbc.queryForList("""
                SELECT p.user_id FROM vendors v JOIN operators p ON p.id=v.operator_id
                WHERE v.id=? AND v.operator_id=? FOR SHARE OF v
                """, Long.class, vendorId, owners.getFirst());
        if (users.isEmpty()) throw new OperatorOrderException(NOT_FOUND, "Truck or order not found.");
        return users.getFirst();
    }

    private OperatorOrderResponse.Summary header(long vendorId, long orderId, boolean lock) {
        return jdbc.query("SELECT " + FIELDS + " FROM customer_orders WHERE vendor_id=? AND id=?"
                + (lock ? " FOR UPDATE" : ""), SUMMARY, vendorId, orderId).stream().findFirst()
                .orElseThrow(() -> new OperatorOrderException(NOT_FOUND, "Truck or order not found."));
    }

    private OperatorOrderResponse detail(OperatorOrderResponse.Summary row) {
        var items = jdbc.query("""
                SELECT menu_item_id,name_snapshot,unit_price,quantity,line_total
                FROM customer_order_items WHERE order_id=? ORDER BY id
                """, (rs, index) -> new OrderResponse.Item(rs.getLong(1), rs.getString(2),
                rs.getBigDecimal(3), rs.getInt(4), rs.getBigDecimal(5)), row.id());
        return new OperatorOrderResponse(row.id(), row.vendorId(), row.status(), row.total(),
                row.createdAt(), row.updatedAt(), row.version(), row.cancellationReason(), items, pickups.saved(row.id()));
    }
}
