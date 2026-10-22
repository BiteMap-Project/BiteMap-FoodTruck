package com.Bitemap.Backend.vendor;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
@Transactional
public class OperatorVendorService {
	private static final RowMapper<VendorSummary> SUMMARY = (row, index) -> new VendorSummary(
			row.getLong("id"), row.getString("name"), row.getString("category"), row.getString("location"));
	private final JdbcTemplate jdbc;

	public OperatorVendorService(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	public VendorSummary create(String email, OperatorVendorRequest request) {
		long ownerId = activeOwner(email);
		return jdbc.queryForObject("""
				INSERT INTO vendors (name, category, location, operator_id) VALUES (?, ?, ?, ?)
				RETURNING id, name, category, location
				""", SUMMARY, request.name(), request.category(), request.location(), ownerId);
	}

	@Transactional(isolation = Isolation.REPEATABLE_READ)
	public VendorPage list(String email, int page, int size) {
		long ownerId = activeOwner(email);
		long total = jdbc.queryForObject("SELECT count(*) FROM vendors WHERE operator_id = ?", Long.class, ownerId);
		var items = jdbc.query("""
				SELECT id, name, category, location FROM vendors WHERE operator_id = ?
				ORDER BY name, id LIMIT ? OFFSET ?
				""", SUMMARY, ownerId, size, (long) page * size);
		return new VendorPage(items, page, size, total, (int) Math.ceil((double) total / size));
	}

	public VendorSummary update(String email, long vendorId, OperatorVendorRequest request) {
		long ownerId = activeOwner(email);
		// Ownership is checked in the write itself, not a separate check-then-update.
		return jdbc.query("""
				UPDATE vendors SET name = ?, category = ?, location = ?
				WHERE id = ? AND operator_id = ? RETURNING id, name, category, location
				""", SUMMARY, request.name(), request.category(), request.location(), vendorId, ownerId)
				.stream().findFirst().orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vendor not found."));
	}

    public OrderingControl ordering(String email, long vendorId) {
        long owner = activeOwner(email);
        return jdbc.query("SELECT accepting_orders,ordering_version FROM vendors WHERE id=? AND operator_id=? FOR SHARE",
                (r, n) -> new OrderingControl(r.getBoolean(1), r.getLong(2)), vendorId, owner).stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vendor not found."));
    }

    public OrderingControl updateOrdering(String email, long vendorId, OrderingControl.Update command) {
        long owner = activeOwner(email);
        // Conflicts with checkout's FOR SHARE. Keep this lock through commit.
        var current = jdbc.query("SELECT accepting_orders,ordering_version FROM vendors WHERE id=? AND operator_id=? FOR UPDATE",
                (r, n) -> new OrderingControl(r.getBoolean(1), r.getLong(2)), vendorId, owner).stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Vendor not found."));
        if (current.version() != command.version())
            throw new ResponseStatusException(HttpStatus.CONFLICT, "Ordering settings changed. Refresh before trying again.");
        if (current.acceptingOrders() == command.acceptingOrders()) return current;
        jdbc.update("UPDATE vendors SET accepting_orders=?,ordering_version=ordering_version+1 WHERE id=?", command.acceptingOrders(), vendorId);
        return new OrderingControl(command.acceptingOrders(), current.version() + 1);
    }

	private long activeOwner(String email) {
		// Hold the account stable until this transaction ends: disabling/deleting it
		// cannot race between this check and a vendor write. Never load password hashes.
		return jdbc.query(com.Bitemap.Backend.auth.OperatorOwnership.SQL,
				(row, index) -> row.getLong("id"), email).stream().findFirst()
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "An enabled operator account is required."));
	}
}
