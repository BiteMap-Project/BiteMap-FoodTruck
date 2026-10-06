package com.Bitemap.Backend.menu;

import java.math.BigDecimal;

public record MenuItemResponse(long id, long vendorId, String name, String description,
                               BigDecimal price, MenuAvailability status, long version) {
    static MenuItemResponse from(MenuItem item) {
        return new MenuItemResponse(item.getId(), item.getVendorId(), item.getName(), item.getDescription(),
                item.getPrice(), item.getStatus(), item.getVersion());
    }
}
