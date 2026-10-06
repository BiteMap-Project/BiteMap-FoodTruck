package com.Bitemap.Backend.analytics;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

public record TruckAnalytics(
		long totalTrucks,
		long totalMenuItems,
		long availableMenuItems,
		long upcomingStops,
		List<TruckMetric> trucks) {

	public record TruckMetric(
			long vendorId,
			String name,
			String category,
			String location,
			long menuItemCount,
			long availableItemCount,
			BigDecimal averageMenuPrice,
			long totalStopCount,
			long upcomingStopCount,
			Instant nextStopAt) {
	}
}
