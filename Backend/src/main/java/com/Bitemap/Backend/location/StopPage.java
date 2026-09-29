package com.Bitemap.Backend.location;

import java.time.Instant;
import java.util.List;
import com.Bitemap.Backend.vendor.VendorSummary;

public record StopPage(List<Stop> items, int page, int size, long totalElements,
        long totalPages, Instant evaluatedAt) {

    public record Stop(long stopId, VendorSummary vendor, String venueName, String address,
            double latitude, double longitude, Instant startsAt, Instant endsAt, String timeZone,
            String status, Instant lastConfirmedAt, Double distanceMeters) {
    }
}
