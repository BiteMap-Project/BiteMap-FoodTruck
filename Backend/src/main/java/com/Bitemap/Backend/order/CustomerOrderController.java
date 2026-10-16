package com.Bitemap.Backend.order;

import java.net.URI;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/customer/orders")
public class CustomerOrderController {
    private final OrderService service;

    public CustomerOrderController(OrderService service) { this.service = service; }

    @PostMapping
    public ResponseEntity<OrderResponse> create(Authentication authentication,
            @Valid @RequestBody CreateOrderRequest request) {
        var order = service.create(authentication.getName(), request);
        return ResponseEntity.created(URI.create("/api/customer/orders/" + order.id()))
                .cacheControl(CacheControl.noStore()).body(order);
    }

    @GetMapping("/{orderId}")
    public ResponseEntity<OrderResponse> get(Authentication authentication, @PathVariable long orderId) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.get(authentication.getName(), orderId));
    }

    @GetMapping
    @io.swagger.v3.oas.annotations.Operation(summary = "List your own orders, newest first")
    public ResponseEntity<CustomerOrderPage> list(Authentication authentication,
            @org.springframework.web.bind.annotation.RequestParam(defaultValue = "0")
            @jakarta.validation.constraints.Min(0) @jakarta.validation.constraints.Max(10000) int page,
            @org.springframework.web.bind.annotation.RequestParam(defaultValue = "20")
            @jakarta.validation.constraints.Min(1) @jakarta.validation.constraints.Max(100) int size) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(service.list(authentication.getName(), page, size));
    }
}
