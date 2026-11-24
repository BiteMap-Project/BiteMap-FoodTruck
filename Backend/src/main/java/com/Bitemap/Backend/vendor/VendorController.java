package com.Bitemap.Backend.vendor;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/vendors")
public class VendorController {

	private final VendorService service;
    private final TruckAvailabilityService availability;

	public VendorController(VendorService service, TruckAvailabilityService availability) {
        this.availability = availability;
		this.service = service;
	}

    @GetMapping("/{id}/availability")
    public org.springframework.http.ResponseEntity<TruckAvailabilityService.Availability> availability(@PathVariable long id) {
        var value = availability.forVendors(java.util.List.of(id)).get(id);
        if (value == null) throw new org.springframework.web.server.ResponseStatusException(org.springframework.http.HttpStatus.NOT_FOUND);
        return org.springframework.http.ResponseEntity.ok().cacheControl(org.springframework.http.CacheControl.noStore()).body(value);
    }

	@GetMapping("/{id}")
	public VendorProfile profile(@PathVariable long id) {
		return service.profile(id);
	}

	@GetMapping
	public VendorPage list(
			@RequestParam(defaultValue = "") @Size(max = 200) String q,
			@RequestParam(defaultValue = "0") @Min(0) @Max(10000) int page,
			@RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
		return service.list(q, page, size);
	}
}
