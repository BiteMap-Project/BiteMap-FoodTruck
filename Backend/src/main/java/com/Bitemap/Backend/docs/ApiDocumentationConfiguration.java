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
						+ "For registration, execute GET /api/auth/csrf, copy its token, then select Authorize and paste it into csrfToken. "
						+ "Use the same browser session. Registration does not log you in."))
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
				if (success != null) responses.addApiResponse("201", success.description("Operator account created"));
			}
			// CsrfToken is injected by Spring, not supplied as a request parameter.
			var csrf = api.getPaths().get("/api/auth/csrf");
			if (csrf != null && csrf.getGet() != null) csrf.getGet().setParameters(java.util.List.of());
		};
	}
}
