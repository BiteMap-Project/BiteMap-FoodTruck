package com.Bitemap.Backend.auth;

import com.Bitemap.Backend.auth.limit.AuthenticationRateLimiter;
import com.Bitemap.Backend.auth.limit.ClientAddressResolver;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class RegistrationController {
	private final AccountRegistrationService registration;
    private final AuthenticationRateLimiter limiter;
    private final ClientAddressResolver addresses;

	public RegistrationController(AccountRegistrationService registration,
            AuthenticationRateLimiter limiter, ClientAddressResolver addresses) {
		this.registration = registration;
        this.limiter = limiter;
        this.addresses = addresses;
	}

	@GetMapping("/csrf")
	ResponseEntity<CsrfResponse> csrf(CsrfToken token) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
				.body(new CsrfResponse(token.getHeaderName(), token.getToken()));
	}

	@PostMapping("/register")
	ResponseEntity<AccountResponse> register(
			@Valid @RequestBody RegisterAccountRequest request, HttpServletRequest servletRequest) {
        limiter.registration(addresses.resolve(servletRequest));
		return ResponseEntity.status(HttpStatus.CREATED).cacheControl(CacheControl.noStore())
				.body(registration.register(request));
	}

	record CsrfResponse(String headerName, String token) {}
}
