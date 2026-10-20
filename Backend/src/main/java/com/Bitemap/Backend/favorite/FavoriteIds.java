package com.Bitemap.Backend.favorite;

import java.util.List;

/** IDs of every truck the signed-in customer has saved, so lists can show Save or Unsave. */
public record FavoriteIds(List<Long> vendorIds) {
	public FavoriteIds { vendorIds = List.copyOf(vendorIds); }
}
