package com.Bitemap.Backend.menu;

import java.net.URI;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/operator/vendors/{vendorId}/menu-items")
@Tag(name = "Operator menu", description = "Requires an enabled owner's login session. Refresh CSRF after login. Version is returned by reads and writes.")
@ApiResponses({@ApiResponse(responseCode = "400", description = "Invalid request"),
        @ApiResponse(responseCode = "401", description = "Login required"),
        @ApiResponse(responseCode = "403", description = "Invalid role or CSRF token"),
        @ApiResponse(responseCode = "404", description = "Resource missing or not owned by an enabled operator"),
        @ApiResponse(responseCode = "409", description = "Stale version or concurrent update; reload before retrying"),
        @ApiResponse(responseCode = "503", description = "Database unavailable")})
public class MenuController {
    private final MenuService service;
    public MenuController(MenuService service) { this.service = service; }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @Operation(summary = "Add an owned vendor's menu item (USD)")
    @SecurityRequirement(name = "csrfToken")
    public ResponseEntity<MenuItemResponse> create(Authentication auth, @PathVariable long vendorId,
                                                   @Valid @RequestBody CreateMenuItemRequest request) {
        var item = service.create(auth.getName(), vendorId, request);
        return ResponseEntity.created(URI.create("/api/operator/vendors/" + vendorId + "/menu-items/" + item.id()))
                .cacheControl(CacheControl.noStore()).body(item);
    }

    @GetMapping
    @Operation(summary = "List all states of the owner's menu, paginated")
    public ResponseEntity<MenuService.MenuPage> list(Authentication auth, @PathVariable long vendorId,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(auth.getName(), vendorId, page, size));
    }

    @GetMapping("/{itemId}")
    public ResponseEntity<MenuItemResponse> get(Authentication auth, @PathVariable long vendorId, @PathVariable long itemId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.get(auth.getName(), vendorId, itemId));
    }

    @PutMapping("/{itemId}")
    @Operation(summary = "Replace name, description and price; preserve availability")
    @SecurityRequirement(name = "csrfToken")
    public ResponseEntity<MenuItemResponse> update(Authentication auth, @PathVariable long vendorId, @PathVariable long itemId,
                                                   @Valid @RequestBody UpdateMenuItemRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.update(auth.getName(), vendorId, itemId, request));
    }

    @PatchMapping("/{itemId}/availability")
    @Operation(summary = "Change ACTIVE / INACTIVE / SOLD_OUT; preserve item details")
    @SecurityRequirement(name = "csrfToken")
    public ResponseEntity<MenuItemResponse> availability(Authentication auth, @PathVariable long vendorId, @PathVariable long itemId,
                                                        @Valid @RequestBody ChangeMenuAvailabilityRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.changeAvailability(auth.getName(), vendorId, itemId, request));
    }
}
