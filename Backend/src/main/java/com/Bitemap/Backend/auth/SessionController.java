package com.Bitemap.Backend.auth;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.validation.Valid;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.CompositeLogoutHandler;
import org.springframework.security.web.authentication.logout.CookieClearingLogoutHandler;
import org.springframework.security.web.authentication.logout.LogoutHandler;
import org.springframework.security.web.authentication.logout.SecurityContextLogoutHandler;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfLogoutHandler;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class SessionController {
	private final AuthenticationManager authenticationManager;
	private final AccountDetailsService accounts;
	private final SecurityContextRepository contexts;
	private final SessionAuthenticationStrategy sessions;
	private final LogoutHandler logoutHandler;
    private final AccountService onboarding;

	public SessionController(AuthenticationManager authenticationManager, AccountDetailsService accounts,
			SecurityContextRepository contexts, SessionAuthenticationStrategy sessions, CsrfTokenRepository csrf,
            AccountService onboarding) {
        this.onboarding = onboarding;
		this.authenticationManager = authenticationManager;
		this.accounts = accounts;
		this.contexts = contexts;
		this.sessions = sessions;
		var securityLogout = new SecurityContextLogoutHandler();
		securityLogout.setSecurityContextRepository(contexts);
		this.logoutHandler = new CompositeLogoutHandler(new CsrfLogoutHandler(csrf), securityLogout,
				new CookieClearingLogoutHandler("JSESSIONID"));
	}

	@PostMapping("/login")
	ResponseEntity<AccountResponse> login(@Valid @RequestBody LoginRequest body,
			HttpServletRequest request, HttpServletResponse response) {
		var authentication = authenticationManager.authenticate(
				UsernamePasswordAuthenticationToken.unauthenticated(body.email(), body.password()));
		var account = accounts.account(authentication.getName());
		sessions.onAuthentication(authentication, request, response);
		var context = SecurityContextHolder.createEmptyContext();
		context.setAuthentication(authentication);
		SecurityContextHolder.setContext(context);
		contexts.saveContext(context, request, response);
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(account);
	}

	@GetMapping("/me")
	ResponseEntity<AccountResponse> me(Authentication authentication) {
        var account = accounts.account(authentication.getName());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(
                new AccountResponse(account.id(), account.displayName(), account.email(),
                        authentication.getAuthorities().stream().map(a -> a.getAuthority()).sorted().toList()));
	}

    @PostMapping("/become-operator")
    @org.springframework.security.access.prepost.PreAuthorize("hasRole('CUSTOMER')")
    ResponseEntity<AccountResponse> becomeOperator(Authentication authentication,
            HttpServletRequest request, HttpServletResponse response) {
        var principal = (AccountPrincipal) authentication.getPrincipal();
        onboarding.becomeOperator(principal.userId()); // Transaction commits before session changes.
        var account = accounts.account(authentication.getName());
        var roles = account.roles().stream().map(org.springframework.security.core.authority.SimpleGrantedAuthority::new).toList();
        var refreshed = new AccountPrincipal(account.id(), account.email(), "", true, roles);
        refreshed.eraseCredentials();
        var updated = UsernamePasswordAuthenticationToken.authenticated(refreshed, null, roles);
        sessions.onAuthentication(updated, request, response);
        var context = SecurityContextHolder.createEmptyContext();
        context.setAuthentication(updated);
        SecurityContextHolder.setContext(context);
        contexts.saveContext(context, request, response);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(account);
    }

	@PostMapping("/logout")
	ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response, Authentication authentication) {
		logoutHandler.logout(request, response, authentication);
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}
}
