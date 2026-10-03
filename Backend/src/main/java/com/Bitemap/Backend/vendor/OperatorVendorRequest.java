package com.Bitemap.Backend.vendor;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/** Only the editable profile fields are accepted; ownership is never client-controlled. */
public record OperatorVendorRequest(
		@NotBlank @Size(max = 120) String name,
		@NotBlank @Size(max = 80) String category,
		@NotBlank @Size(max = 200) String location) {
	public OperatorVendorRequest {
		name = name == null ? null : name.strip();
		category = category == null ? null : category.strip();
		location = location == null ? null : location.strip();
	}
}
