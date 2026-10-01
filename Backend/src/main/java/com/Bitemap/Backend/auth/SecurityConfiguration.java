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

import static org.springframework.security.config.Customizer.withDefaults;

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
	SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
		http.authorizeHttpRequests(authorize -> authorize
				.dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
				.requestMatchers(HttpMethod.GET, "/api/auth/csrf").permitAll()
				.requestMatchers(HttpMethod.POST, "/api/auth/register").permitAll()
				.requestMatchers(HttpMethod.GET, "/api/vendors", "/api/vendors/{id}", "/api/vendor-stops", "/actuator/health", "/actuator/health/**").permitAll()
				.anyRequest().authenticated())
				.httpBasic(withDefaults())
				.formLogin(withDefaults());
		// Keep CSRF and default security headers enabled. Operator login is a separate task.
		return http.build();
	}
}
