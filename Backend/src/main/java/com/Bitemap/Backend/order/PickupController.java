package com.Bitemap.Backend.order;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/vendors/{vendorId}/pickup-stop")
public class PickupController {
    private final PickupService service;
    public PickupController(PickupService service) { this.service=service; }

    @GetMapping
    @io.swagger.v3.oas.annotations.Operation(summary="Get the current pickup stop; 204 without an active stop, 409 when ordering is paused")
    public ResponseEntity<PickupDetails> current(@PathVariable long vendorId) {
        var pickup=service.current(vendorId);
        return pickup==null ? ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build()
            : ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(pickup);
    }
}
