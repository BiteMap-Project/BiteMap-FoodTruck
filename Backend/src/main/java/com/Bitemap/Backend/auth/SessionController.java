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
	private final OperatorAccountService accounts;
	private final SecurityContextRepository contexts;
	private final SessionAuthenticationStrategy sessions;
	private final LogoutHandler logoutHandler;

	public SessionController(AuthenticationManager authenticationManager, OperatorAccountService accounts,
			SecurityContextRepository contexts, SessionAuthenticationStrategy sessions, CsrfTokenRepository csrf) {
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
	ResponseEntity<OperatorRegistrationService.OperatorAccount> login(@Valid @RequestBody LoginRequest body,
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
	ResponseEntity<OperatorRegistrationService.OperatorAccount> me(Authentication authentication) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(accounts.account(authentication.getName()));
	}

	@PostMapping("/logout")
	ResponseEntity<Void> logout(HttpServletRequest request, HttpServletResponse response, Authentication authentication) {
		logoutHandler.logout(request, response, authentication);
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}
}
