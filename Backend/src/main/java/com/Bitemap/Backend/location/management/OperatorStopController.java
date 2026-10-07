package com.Bitemap.Backend.location.management;

import java.net.URI;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/operator/vendors/{vendorId}/stops")
@Tag(name = "Operator schedules", description = "Owner-only one-time stops. Use explicit date/time offsets plus an IANA zone. Writes require fresh CSRF.")
@ApiResponses({@ApiResponse(responseCode="400", description="Invalid fields or time zone"),
        @ApiResponse(responseCode="401", description="Login required"), @ApiResponse(responseCode="403", description="Invalid role or CSRF"),
        @ApiResponse(responseCode="404", description="Missing or not owned"), @ApiResponse(responseCode="409", description="Overlap, stale version or immutable history"),
        @ApiResponse(responseCode="503", description="Database unavailable")})
public class OperatorStopController {
    private final OperatorStopService service;
    public OperatorStopController(OperatorStopService service) { this.service = service; }

    @PostMapping
    @Operation(summary="Publish a future stop for an owned truck")
    @ApiResponse(responseCode="201", description="Created")
    @SecurityRequirement(name="csrfToken")
    public ResponseEntity<ManagedStop> create(Authentication auth, @PathVariable long vendorId, @Valid @RequestBody StopRequests.Details request) {
        var stop = service.create(auth.getName(), vendorId, request);
        return ResponseEntity.created(URI.create("/api/operator/vendors/" + vendorId + "/stops/" + stop.id())).cacheControl(CacheControl.noStore()).body(stop);
    }
    @GetMapping
    @Operation(summary="List owned truck stops, including cancellation and completed history")
    @ApiResponse(responseCode="200", description="Schedule page")
    public ResponseEntity<ManagedStop.Page> list(Authentication auth, @PathVariable long vendorId,
            @RequestParam(defaultValue="0") @Min(0) @Max(10000) int page,
            @RequestParam(defaultValue="20") @Min(1) @Max(100) int size) { return ok(service.list(auth.getName(), vendorId, page, size)); }

    @GetMapping("/{stopId}")
    @ApiResponse(responseCode="200", description="Owned stop")
    public ResponseEntity<ManagedStop> get(Authentication auth, @PathVariable long vendorId, @PathVariable long stopId) { return ok(service.get(auth.getName(), vendorId, stopId)); }

    @PutMapping("/{stopId}")
    @Operation(summary="Replace a future scheduled stop; supply its current version")
    @ApiResponse(responseCode="200", description="Updated")
    @SecurityRequirement(name="csrfToken")
    public ResponseEntity<ManagedStop> update(Authentication auth, @PathVariable long vendorId, @PathVariable long stopId,
            @Valid @RequestBody StopRequests.Update request) { return ok(service.update(auth.getName(), vendorId, stopId, request)); }

    @PostMapping("/{stopId}/cancel")
    @Operation(summary="Cancel a future or ongoing stop without deleting history")
    @ApiResponse(responseCode="200", description="Cancelled")
    @SecurityRequirement(name="csrfToken")
    public ResponseEntity<ManagedStop> cancel(Authentication auth, @PathVariable long vendorId, @PathVariable long stopId,
            @Valid @RequestBody StopRequests.Cancel request) { return ok(service.cancel(auth.getName(), vendorId, stopId, request)); }
    private static <T> ResponseEntity<T> ok(T body) { return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body); }
}
