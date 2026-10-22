package com.Bitemap.Backend.account;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * The only profile field a signed-in account may change. Any other JSON field
 * (id, email, roles, ...) is ignored: identity always comes from the session.
 */
@com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
public record UpdateProfileRequest(
		@NotBlank(message = "Display name is required.")
		@Size(max = 120, message = "Display name must be 120 characters or fewer.")
		@Pattern(regexp = "[^\\p{Cntrl}]*", message = "Display name cannot contain line breaks or control characters.")
		String displayName) {

	public UpdateProfileRequest {
		displayName = displayName == null ? null : displayName.strip();
	}
}
