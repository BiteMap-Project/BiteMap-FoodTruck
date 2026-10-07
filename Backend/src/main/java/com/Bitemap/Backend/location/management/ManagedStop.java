package com.Bitemap.Backend.location.management;

import java.time.Instant;
import java.util.List;

public record ManagedStop(long id, long vendorId, String venueName, String address,
        double latitude, double longitude, Instant startsAt, Instant endsAt,
        String timeZone, String status, long version, Instant createdAt, Instant updatedAt) {
    public record Page(List<ManagedStop> items, int page, int size, long totalElements, long totalPages) {}
}
