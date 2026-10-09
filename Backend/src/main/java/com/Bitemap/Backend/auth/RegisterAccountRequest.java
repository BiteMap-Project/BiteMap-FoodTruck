package com.Bitemap.Backend.auth;

import java.util.Locale;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

@com.fasterxml.jackson.annotation.JsonIgnoreProperties(ignoreUnknown = true)
public record RegisterAccountRequest(
		@NotBlank(message = "Display name is required.")
		@Size(max = 120, message = "Display name must be 120 characters or fewer.")
		String displayName,
		@NotBlank(message = "Email is required.")
		@Email(message = "Enter a valid email address.")
		@Size(max = 320, message = "Email must be 320 characters or fewer.")
		String email,
		@NotBlank(message = "Password is required.")
		@Size(min = 15, max = 128, message = "Password must be between 15 and 128 characters.")
		String password) {

	public RegisterAccountRequest {
		displayName = displayName == null ? null : displayName.strip();
		email = email == null ? null : email.strip().toLowerCase(Locale.ROOT);
		// Passwords must be hashed exactly as entered, including spaces.
	}

	@Override
	public String toString() {
		return "RegisterAccountRequest[redacted]";
	}
}
