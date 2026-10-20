package com.Bitemap.Backend.favorite;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

/**
 * SCRUM-78: saved trucks. Every method takes the customer's user ID from the
 * authenticated session; no request can name another account.
 */
@Service
public class FavoriteService {
	/** Upper bound for the ID list used to mark Save/Unsave buttons. */
	static final int MAX_IDS = 1000;

	private final JdbcTemplate jdbc;

	public FavoriteService(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	/** Saves a truck. Saving the same truck again changes nothing and still succeeds. */
	@Transactional
	public void save(long userId, long vendorId) {
		int inserted = jdbc.update("""
				INSERT INTO customer_favorites(user_id, vendor_id)
				SELECT ?, v.id FROM vendors v WHERE v.id = ?
				ON CONFLICT (user_id, vendor_id) DO NOTHING
				""", userId, vendorId);
		if (inserted == 0) {
			boolean exists = Boolean.TRUE.equals(jdbc.queryForObject(
					"SELECT EXISTS(SELECT 1 FROM vendors WHERE id = ?)", Boolean.class, vendorId));
			if (!exists) throw new FavoriteNotFoundException();
		}
	}

	/** Removes a saved truck. Removing one that is not saved (or no longer exists) also succeeds. */
	@Transactional
	public void remove(long userId, long vendorId) {
		jdbc.update("DELETE FROM customer_favorites WHERE user_id = ? AND vendor_id = ?", userId, vendorId);
	}

	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	public FavoritePage list(long userId, int page, int size) {
		long count = jdbc.queryForObject(
				"SELECT count(*) FROM customer_favorites WHERE user_id = ?", Long.class, userId);
		var items = jdbc.query("""
				SELECT v.id, v.name, v.category, v.location, f.created_at
				FROM customer_favorites f JOIN vendors v ON v.id = f.vendor_id
				WHERE f.user_id = ?
				ORDER BY f.created_at DESC, v.id DESC
				LIMIT ? OFFSET ?
				""", (rs, row) -> new FavoritePage.Truck(rs.getLong(1), rs.getString(2), rs.getString(3),
						rs.getString(4), rs.getTimestamp(5).toInstant()),
				userId, size, (long) page * size);
		return new FavoritePage(items, page, size, count, (count + size - 1) / size);
	}

	@Transactional(readOnly = true)
	public FavoriteIds ids(long userId) {
		return new FavoriteIds(jdbc.queryForList("""
				SELECT vendor_id FROM customer_favorites WHERE user_id = ?
				ORDER BY created_at DESC, vendor_id DESC LIMIT ?
				""", Long.class, userId, MAX_IDS));
	}
}
