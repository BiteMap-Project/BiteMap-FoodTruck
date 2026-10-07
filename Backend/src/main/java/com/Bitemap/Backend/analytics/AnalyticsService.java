package com.Bitemap.Backend.analytics;

import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AnalyticsService {
	private final NamedParameterJdbcTemplate jdbc;

	public AnalyticsService(NamedParameterJdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	@Transactional
	public TruckAnalytics truckMetrics(String email) {
        long ownerId = jdbc.query("SELECT id FROM operators WHERE email = :email AND enabled = TRUE FOR SHARE",
                Map.of("email", email), (rs, row) -> rs.getLong("id")).stream().findFirst()
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.FORBIDDEN, "An enabled operator account is required."));
		String query = """
				WITH menu_metrics AS (
				    SELECT vendor_id, count(*) AS menu_item_count,
				           count(*) FILTER (WHERE available) AS available_item_count,
				           round(avg(price), 2) AS average_menu_price
				    FROM vendor_menu_items GROUP BY vendor_id
				), stop_metrics AS (
				    SELECT vendor_id, count(*) AS total_stop_count,
				           count(*) FILTER (
				               WHERE status IN ('scheduled', 'serving') AND ends_at > CURRENT_TIMESTAMP
				           ) AS upcoming_stop_count,
				           min(starts_at) FILTER (
				               WHERE status IN ('scheduled', 'serving') AND ends_at > CURRENT_TIMESTAMP
				           ) AS next_stop_at
				    FROM vendor_stops GROUP BY vendor_id
				)
				SELECT v.id, v.name, v.category, v.location,
				       coalesce(m.menu_item_count, 0) AS menu_item_count,
				       coalesce(m.available_item_count, 0) AS available_item_count,
				       m.average_menu_price,
				       coalesce(s.total_stop_count, 0) AS total_stop_count,
				       coalesce(s.upcoming_stop_count, 0) AS upcoming_stop_count,
				       s.next_stop_at
				FROM vendors v
				LEFT JOIN menu_metrics m ON m.vendor_id = v.id
				LEFT JOIN stop_metrics s ON s.vendor_id = v.id
				WHERE v.operator_id = :ownerId
				ORDER BY v.name, v.id
				""";
		List<TruckAnalytics.TruckMetric> trucks = jdbc.query(query, Map.of("ownerId", ownerId), (rs, row) -> {
			Timestamp nextStop = rs.getTimestamp("next_stop_at");
			return new TruckAnalytics.TruckMetric(
					rs.getLong("id"), rs.getString("name"), rs.getString("category"),
					rs.getString("location"), rs.getLong("menu_item_count"),
					rs.getLong("available_item_count"), rs.getBigDecimal("average_menu_price"),
					rs.getLong("total_stop_count"), rs.getLong("upcoming_stop_count"),
					nextStop == null ? null : nextStop.toInstant());
		});

		return new TruckAnalytics(
				trucks.size(),
				trucks.stream().mapToLong(TruckAnalytics.TruckMetric::menuItemCount).sum(),
				trucks.stream().mapToLong(TruckAnalytics.TruckMetric::availableItemCount).sum(),
				trucks.stream().mapToLong(TruckAnalytics.TruckMetric::upcomingStopCount).sum(),
				trucks);
	}
}
