package com.Bitemap.Backend.vendor;

public record VendorSummary(Long id, String name, String category, String location) {

	static VendorSummary from(Vendor vendor) {
		return new VendorSummary(vendor.getId(), vendor.getName(), vendor.getCategory(), vendor.getLocation());
	}
}
