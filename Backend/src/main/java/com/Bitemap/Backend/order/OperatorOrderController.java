package com.Bitemap.Backend.order;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Max;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/operator/vendors/{vendorId}/orders")
@Tag(name = "Operator orders", description = "Owner-protected order queue and versioned status changes. Requires an enabled operator session.")
public class OperatorOrderController {
    private final OperatorOrderService service;
    public OperatorOrderController(OperatorOrderService service) { this.service = service; }

    @GetMapping
    @Operation(summary = "List orders for an owned truck, newest first")
    public ResponseEntity<OperatorOrderResponse.Page> list(Authentication authentication, @PathVariable long vendorId,
            @RequestParam(required = false) OrderStatus status,
            @RequestParam(defaultValue = "0") @Min(0) @Max(10000) int page,
            @RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.list(authentication.getName(), vendorId, status, page, size));
    }

    @GetMapping("/{orderId}")
    @Operation(summary = "Get an owned truck's order and saved item prices")
    public ResponseEntity<OperatorOrderResponse> get(Authentication authentication,
            @PathVariable long vendorId, @PathVariable long orderId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.get(authentication.getName(), vendorId, orderId));
    }

    @PatchMapping("/{orderId}/status")
    @Operation(summary = "Change order status with its current version",
            description = "PLACED → ACCEPTED → READY → COMPLETED. PLACED or ACCEPTED may be cancelled with a reason. Stale versions and invalid transitions return 409; refresh before retrying.")
    @SecurityRequirement(name = "csrfToken")
    public ResponseEntity<OperatorOrderResponse> update(Authentication authentication,
            @PathVariable long vendorId, @PathVariable long orderId, @Valid @RequestBody OrderStatusRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.update(authentication.getName(), vendorId, orderId, request));
    }

    @PatchMapping("/{orderId}/estimate")
    @Operation(summary = "Set an estimated ready time using the current order version",
            description = "The estimate must be 1 minute to 24 hours in the future and may be changed while an order is placed or accepted.")
    @SecurityRequirement(name = "csrfToken")
    public ResponseEntity<OperatorOrderResponse> updateEstimate(Authentication authentication,
            @PathVariable long vendorId, @PathVariable long orderId,
            @Valid @RequestBody OrderEstimateRequest request) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.updateEstimate(authentication.getName(), vendorId, orderId, request));
    }
}
