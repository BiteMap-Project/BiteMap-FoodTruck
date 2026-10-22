package com.Bitemap.Backend.account;

import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.Bitemap.Backend.auth.AccountDetailsService;
import com.Bitemap.Backend.auth.AccountPrincipal;
import com.Bitemap.Backend.auth.AccountResponse;

/** SCRUM-79: signed-in account settings. Requires authentication and CSRF (see SecurityConfiguration). */
@RestController
@RequestMapping("/api/account")
public class AccountController {
	private final AccountProfileService profiles;
	private final AccountDetailsService accounts;

	public AccountController(AccountProfileService profiles, AccountDetailsService accounts) {
		this.profiles = profiles;
		this.accounts = accounts;
	}

	@PatchMapping("/profile")
	@io.swagger.v3.oas.annotations.Operation(summary = "Change your own display name")
	ResponseEntity<AccountResponse> updateProfile(Authentication authentication,
			@Valid @RequestBody UpdateProfileRequest request) {
		var principal = (AccountPrincipal) authentication.getPrincipal();
		profiles.updateDisplayName(principal.userId(), request.displayName());
		var account = accounts.account(authentication.getName());
		// Same shape and role list as GET /api/auth/me, so the frontend can reuse it directly.
		var roles = authentication.getAuthorities().stream().map(GrantedAuthority::getAuthority).sorted().toList();
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
				.body(new AccountResponse(account.id(), account.displayName(), account.email(), roles));
	}
}
