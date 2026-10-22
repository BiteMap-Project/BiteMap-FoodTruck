package com.Bitemap.Backend.favorite;

import java.time.Instant;
import java.util.List;

/** A page of the signed-in customer's saved trucks, newest first. */
public record FavoritePage(List<Truck> items, int page, int size, long totalElements, long totalPages) {
	public FavoritePage { items = List.copyOf(items); }

	public record Truck(long id, String name, String category, String location, Instant savedAt) {}
}
