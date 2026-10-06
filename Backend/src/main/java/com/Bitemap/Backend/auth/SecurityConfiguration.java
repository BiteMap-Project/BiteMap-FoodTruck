package com.Bitemap.Backend.auth;

import jakarta.servlet.DispatcherType;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.crypto.password.DelegatingPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.crypto.password.Pbkdf2PasswordEncoder;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.ProviderManager;
import org.springframework.security.authentication.dao.DaoAuthenticationProvider;
import org.springframework.security.config.annotation.web.configurers.AbstractHttpConfigurer;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.security.web.csrf.CsrfTokenRepository;
import org.springframework.security.web.csrf.HttpSessionCsrfTokenRepository;
import org.springframework.security.web.csrf.CsrfAuthenticationStrategy;
import org.springframework.security.web.authentication.session.ChangeSessionIdAuthenticationStrategy;
import org.springframework.security.web.authentication.session.CompositeSessionAuthenticationStrategy;
import org.springframework.security.web.authentication.session.SessionAuthenticationStrategy;

@Configuration
public class SecurityConfiguration {

	@Bean
	PasswordEncoder passwordEncoder() {
		var encoder = new Pbkdf2PasswordEncoder("", 16, 600_000, 256);
		encoder.setAlgorithm(Pbkdf2PasswordEncoder.SecretKeyFactoryAlgorithm.PBKDF2WithHmacSHA256);
		String id = "pbkdf2-sha256-600k";
		return new DelegatingPasswordEncoder(id, java.util.Map.of(id, encoder));
	}

	@Bean
	AuthenticationManager authenticationManager(OperatorAccountService accounts, PasswordEncoder encoder) {
		var provider = new DaoAuthenticationProvider(accounts);
		provider.setPasswordEncoder(encoder);
		return new ProviderManager(provider);
	}

	@Bean
	SecurityContextRepository securityContextRepository() {
		var repository = new HttpSessionSecurityContextRepository();
		repository.setDisableUrlRewriting(true);
		return repository;
	}

	@Bean
	CsrfTokenRepository csrfTokenRepository() {
		return new HttpSessionCsrfTokenRepository();
	}

	@Bean
	SessionAuthenticationStrategy loginSessionStrategy(CsrfTokenRepository csrf) {
		return new CompositeSessionAuthenticationStrategy(java.util.List.of(
				new ChangeSessionIdAuthenticationStrategy(), new CsrfAuthenticationStrategy(csrf)));
	}

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http, SecurityContextRepository contexts,
			CsrfTokenRepository csrf) throws Exception {
		http.authorizeHttpRequests(authorize -> authorize
				.dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
				.requestMatchers(HttpMethod.GET, "/api/auth/csrf").permitAll()
				.requestMatchers(HttpMethod.POST, "/api/auth/register", "/api/auth/login", "/api/auth/logout").permitAll()
				.requestMatchers(HttpMethod.GET, "/api/vendors", "/api/vendors/{id}", "/api/vendor-stops", "/actuator/health", "/actuator/health/**").permitAll()
				.requestMatchers("/api/operator/**").hasRole("OPERATOR")
				.anyRequest().authenticated())
				.securityContext(context -> context.securityContextRepository(contexts))
				.csrf(config -> config.csrfTokenRepository(csrf))
				.requestCache(AbstractHttpConfigurer::disable)
				.httpBasic(AbstractHttpConfigurer::disable)
				.formLogin(AbstractHttpConfigurer::disable)
				.logout(AbstractHttpConfigurer::disable)
				.exceptionHandling(errors -> errors.authenticationEntryPoint((request, response, exception) -> {
					response.setStatus(401);
					response.setContentType("application/problem+json");
					response.getWriter().write("{\"status\":401,\"title\":\"Unauthorized\",\"detail\":\"Sign in to continue.\"}");
				}));
		// JSON controller endpoints handle login/logout; CSRF and security headers remain enabled.
		return http.build();
	}
}
