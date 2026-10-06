package com.Bitemap.Backend.vendor;

import java.net.URI;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
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
@RequestMapping("/api/operator/vendors")
@Tag(name = "Operator vendors", description = "Requires an enabled operator's login session. Ownership comes from the session, not request fields.")
@ApiResponses({
		@ApiResponse(responseCode = "400", description = "Invalid input"),
		@ApiResponse(responseCode = "401", description = "Login required"),
		@ApiResponse(responseCode = "403", description = "Inactive operator, incorrect role, or invalid CSRF token"),
		@ApiResponse(responseCode = "503", description = "Database temporarily unavailable")
})
public class OperatorVendorController {
	private final OperatorVendorService service;

	public OperatorVendorController(OperatorVendorService service) {
		this.service = service;
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	@Operation(summary = "Create a vendor owned by the current operator")
	@SecurityRequirement(name = "csrfToken")
	public ResponseEntity<VendorSummary> create(Authentication authentication, @Valid @RequestBody OperatorVendorRequest request) {
		var vendor = service.create(authentication.getName(), request);
		return ResponseEntity.created(URI.create("/api/vendors/" + vendor.id()))
				.cacheControl(CacheControl.noStore()).body(vendor);
	}

	@GetMapping
	@Operation(summary = "List only the current operator's vendors")
	public ResponseEntity<VendorPage> list(Authentication authentication,
			@RequestParam(defaultValue = "0") @Min(0) @Max(10000) int page,
			@RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.list(authentication.getName(), page, size));
	}

	@PutMapping("/{id}")
	@Operation(summary = "Replace an owned vendor's name, category, and location",
			description = "All three fields are required. Does not change ownership, menus, or schedules. Last successful write wins.")
	@ApiResponse(responseCode = "404", description = "Vendor missing or not owned by this operator")
	@SecurityRequirement(name = "csrfToken")
	public ResponseEntity<VendorSummary> update(Authentication authentication, @PathVariable long id,
			@Valid @RequestBody OperatorVendorRequest request) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.update(authentication.getName(), id, request));
	}
}
