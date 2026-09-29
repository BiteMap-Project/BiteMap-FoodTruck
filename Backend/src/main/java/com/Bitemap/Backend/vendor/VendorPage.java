package com.Bitemap.Backend.vendor;

import java.util.List;

public record VendorPage(List<VendorSummary> items, int page, int size, long totalElements, int totalPages) {
}
