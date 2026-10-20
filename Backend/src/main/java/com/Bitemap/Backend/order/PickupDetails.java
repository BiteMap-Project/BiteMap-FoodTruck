package com.Bitemap.Backend.order;

import java.time.Instant;

public record PickupDetails(long stopId, String venueName, String address, double latitude,
        double longitude, Instant startsAt, Instant endsAt, String timeZone) {}
