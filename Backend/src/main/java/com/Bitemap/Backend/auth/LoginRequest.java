package com.Bitemap.Backend.auth;

import java.util.Locale;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record LoginRequest(
		@NotBlank @Email @Size(max = 320) String email,
		@NotBlank @Size(max = 128) String password) {
	public LoginRequest {
		email = email == null ? null : email.strip().toLowerCase(Locale.ROOT);
	}

	@Override
	public String toString() {
		return "LoginRequest[redacted]";
	}
}
