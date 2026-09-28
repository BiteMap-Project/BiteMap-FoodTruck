package com.Bitemap.Backend.vendor;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Size;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/vendors")
public class VendorController {

	private final VendorService service;

	public VendorController(VendorService service) {
		this.service = service;
	}

	@GetMapping
	public VendorPage list(
			@RequestParam(defaultValue = "") @Size(max = 200) String q,
			@RequestParam(defaultValue = "0") @Min(0) @Max(10000) int page,
			@RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
		return service.list(q, page, size);
	}
}
