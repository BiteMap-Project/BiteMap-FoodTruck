package com.Bitemap.Backend.menu;

import java.util.List;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.validation.annotation.Validated;

@Service
@Validated
@Transactional
public class MenuService {
    private final MenuItemRepository items;

    public MenuService(MenuItemRepository items) { this.items = items; }

    public MenuItemResponse create(String operatorEmail, long vendorId, @NotNull @Valid CreateMenuItemRequest request) {
        requireOwner(operatorEmail, vendorId);
        return MenuItemResponse.from(items.saveAndFlush(new MenuItem(vendorId, request.name(),
                request.description(), request.price(), request.status())));
    }

    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public MenuPage list(String operatorEmail, long vendorId, @Min(0) @Max(10000) int page, @Min(1) @Max(100) int size) {
        requireOwner(operatorEmail, vendorId);
        var result = items.findAllByVendorId(vendorId, PageRequest.of(page, size, Sort.by("name", "id")));
        return new MenuPage(result.stream().map(MenuItemResponse::from).toList(), page, size,
                result.getTotalElements(), result.getTotalPages());
    }

    public MenuItemResponse get(String operatorEmail, long vendorId, long itemId) {
        requireOwner(operatorEmail, vendorId);
        return MenuItemResponse.from(findItem(vendorId, itemId));
    }

    public MenuItemResponse update(String operatorEmail, long vendorId, long itemId, @NotNull @Valid UpdateMenuItemRequest request) {
        requireOwner(operatorEmail, vendorId);
        var item = findItem(vendorId, itemId);
        requireVersion(item, request.version());
        item.edit(request.name(), request.description(), request.price());
        items.flush(); // @Version check occurs before response mapping; response contains new version.
        return MenuItemResponse.from(item);
    }

    public MenuItemResponse changeAvailability(String operatorEmail, long vendorId, long itemId,
                                               @NotNull @Valid ChangeMenuAvailabilityRequest request) {
        requireOwner(operatorEmail, vendorId);
        var item = findItem(vendorId, itemId);
        requireVersion(item, request.version());
        item.changeAvailability(request.status());
        items.flush();
        return MenuItemResponse.from(item);
    }

    private void requireOwner(String email, long vendorId) {
        items.lockOwnedVendor(vendorId, email).orElseThrow(MenuNotFoundException::new);
    }

    private MenuItem findItem(long vendorId, long itemId) {
        return items.findByIdAndVendorId(itemId, vendorId).orElseThrow(MenuNotFoundException::new);
    }

    private void requireVersion(MenuItem item, long expected) {
        if (item.getVersion() != expected) throw new MenuConflictException();
    }

    public record MenuPage(List<MenuItemResponse> items, int page, int size, long totalElements, int totalPages) {}
}
