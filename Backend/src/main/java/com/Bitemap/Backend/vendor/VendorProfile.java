package com.Bitemap.Backend.vendor;

import java.math.BigDecimal;
import java.util.List;

public record VendorProfile(Long id, String name, String category, String location, List<MenuItem> menu) {
	public record MenuItem(long id, String name, String description, BigDecimal price, boolean available) {}
}
