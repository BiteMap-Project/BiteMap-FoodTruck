package com.Bitemap.Backend.vendor;

public record VendorSummary(
    Long id,
    String name,
    String category,
    String location,
    java.math.BigDecimal averageRating,
    long reviewCount,
    TruckAvailabilityService.Availability availability
) {
    public VendorSummary(
        Long id,
        String name,
        String category,
        String location,
        java.math.BigDecimal averageRating,
        long reviewCount
    ) {
        this(id, name, category, location, averageRating, reviewCount, null);
    }

    public VendorSummary(
        Long id,
        String name,
        String category,
        String location
    ) {
        this(id, name, category, location, null, 0, null);
    }

    static VendorSummary from(Vendor vendor) {
        return new VendorSummary(
            vendor.getId(),
            vendor.getName(),
            vendor.getCategory(),
            vendor.getLocation()
        );
    }
}