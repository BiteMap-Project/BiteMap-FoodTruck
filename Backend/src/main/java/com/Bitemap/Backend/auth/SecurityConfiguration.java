package com.Bitemap.Backend.auth;

import jakarta.servlet.DispatcherType;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

import static org.springframework.security.config.Customizer.withDefaults;

@Configuration
public class SecurityConfiguration {

	@Bean
	SecurityFilterChain securityFilterChain(HttpSecurity http) throws Exception {
		http.authorizeHttpRequests(authorize -> authorize
				.dispatcherTypeMatchers(DispatcherType.ERROR).permitAll()
				.requestMatchers(HttpMethod.GET, "/api/vendors", "/api/vendor-stops", "/actuator/health", "/actuator/health/**").permitAll()
				.anyRequest().authenticated())
				.httpBasic(withDefaults())
				.formLogin(withDefaults());
		// Keep CSRF and default security headers enabled. Real accounts/roles are a separate task.
		return http.build();
	}
}
