package com.Bitemap.Backend.docs;

import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;
import org.springdoc.core.customizers.OpenApiCustomizer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpMethod;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
@Profile("dev")
public class ApiDocumentationConfiguration {

	@Bean
	@Order(0)
	SecurityFilterChain documentationSecurity(HttpSecurity http) throws Exception {
		return http.securityMatcher("/swagger-ui.html", "/swagger-ui/**", "/v3/api-docs", "/v3/api-docs/**", "/v3/api-docs.yaml")
				.authorizeHttpRequests(auth -> auth.requestMatchers(HttpMethod.GET, "/**").permitAll()
						.anyRequest().denyAll()).build();
	}

	@Bean
	OpenAPI biteMapApi() {
		return new OpenAPI().info(new Info().title("BiteMap API").version("development")
				.description("Local development API explorer. Requests use your real development database. "
						+ "Before registration, login, or logout, execute GET /api/auth/csrf, copy its token, then select Authorize and paste it into csrfToken. "
						+ "Use the same browser session. Fetch and authorize a fresh CSRF token after login, operator onboarding, or logout. "
						+ "Login sets a session cookie automatically; registration does not log you in."))
				.components(new Components().addSecuritySchemes("csrfToken", new SecurityScheme()
						.type(SecurityScheme.Type.APIKEY).in(SecurityScheme.In.HEADER).name("X-CSRF-TOKEN")
						.description("Token returned by GET /api/auth/csrf in this browser session; not a login credential.")));
	}

	@Bean
	OpenApiCustomizer registrationCsrfDocumentation() {
		return api -> {
			var registration = api.getPaths().get("/api/auth/register");
			if (registration != null && registration.getPost() != null) {
				registration.getPost().addSecurityItem(new SecurityRequirement().addList("csrfToken"));
				var responses = registration.getPost().getResponses();
				var success = responses.remove("200");
				if (success != null) responses.addApiResponse("201", success.description("Customer account created"));
			}
			// CsrfToken is injected by Spring, not supplied as a request parameter.
			var csrf = api.getPaths().get("/api/auth/csrf");
			if (csrf != null && csrf.getGet() != null) csrf.getGet().setParameters(java.util.List.of());
			for (String path : java.util.List.of("/api/auth/login", "/api/auth/logout")) {
				var item = api.getPaths().get(path);
				if (item == null || item.getPost() == null) continue;
				var operation = item.getPost();
				operation.addSecurityItem(new SecurityRequirement().addList("csrfToken"));
				operation.getResponses().addApiResponse("403", new io.swagger.v3.oas.models.responses.ApiResponse()
						.description("Missing or invalid CSRF token. Fetch a fresh token in the same session."));
				if (path.endsWith("logout")) {
					operation.getResponses().remove("200");
					operation.getResponses().addApiResponse("204", new io.swagger.v3.oas.models.responses.ApiResponse()
							.description("Session invalidated; no response body"));
				} else {
					operation.getResponses().addApiResponse("401", new io.swagger.v3.oas.models.responses.ApiResponse()
							.description("Invalid email or password (also used for disabled accounts)"));
					operation.getResponses().addApiResponse("400", new io.swagger.v3.oas.models.responses.ApiResponse()
							.description("Invalid input"));
					operation.getResponses().addApiResponse("503", new io.swagger.v3.oas.models.responses.ApiResponse()
							.description("Authentication temporarily unavailable"));
				}
			}
            var onboarding = api.getPaths().get("/api/auth/become-operator");
            if (onboarding != null && onboarding.getPost() != null) {
                var operation = onboarding.getPost();
                operation.setSummary("Enable operator access for the signed-in customer");
                operation.setDescription("No request body. Idempotent; never claims existing trucks. "
                        + "Rotates the session and CSRF token after commit. Fetch a fresh CSRF token afterward.");
                operation.addSecurityItem(new SecurityRequirement().addList("csrfToken"));
                operation.getResponses().addApiResponse("401", new io.swagger.v3.oas.models.responses.ApiResponse().description("Login required"));
                operation.getResponses().addApiResponse("403", new io.swagger.v3.oas.models.responses.ApiResponse().description("Invalid CSRF, missing customer role, or revoked operator access"));
                operation.getResponses().addApiResponse("503", new io.swagger.v3.oas.models.responses.ApiResponse().description("Authentication temporarily unavailable"));
            }
			var me = api.getPaths().get("/api/auth/me");
			if (me != null && me.getGet() != null) {
				me.getGet().setDescription("Returns unified account ID and current session ROLE_CUSTOMER/ROLE_OPERATOR grants. Requires the login session cookie.");
				me.getGet().getResponses().addApiResponse("401", new io.swagger.v3.oas.models.responses.ApiResponse()
						.description("No valid account session"));
			}
		};
	}
}
