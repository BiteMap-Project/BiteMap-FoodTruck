package com.Bitemap.Backend.docs;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.hamcrest.Matchers.containsString;

@SpringBootTest(properties = "spring.flyway.locations=classpath:db/migration")
@AutoConfigureMockMvc
@ActiveProfiles("dev")
class ApiDocumentationTests {
	@Autowired MockMvc mvc;

	@Test
	void developmentSpecListsBusinessEndpointsAndCsrfScheme() throws Exception {
		mvc.perform(get("/v3/api-docs"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.info.title").value("BiteMap API"))
				.andExpect(jsonPath("$.paths['/api/vendors'].get").exists())
				.andExpect(jsonPath("$.paths['/api/vendors/{id}'].get").exists())
				.andExpect(jsonPath("$.paths['/api/vendor-stops'].get").exists())
				.andExpect(jsonPath("$.paths['/api/auth/csrf'].get").exists())
				.andExpect(jsonPath("$.paths['/api/auth/csrf'].get.parameters").isEmpty())
				.andExpect(jsonPath("$.paths['/api/auth/register'].post.responses['201']").exists())
				.andExpect(jsonPath("$.paths['/api/auth/register'].post.security[0].csrfToken").isArray())
				.andExpect(jsonPath("$.paths['/api/auth/login'].post.security[0].csrfToken").isArray())
				.andExpect(jsonPath("$.paths['/api/auth/login'].post.responses['401']").exists())
				.andExpect(jsonPath("$.paths['/api/auth/me'].get.responses['401']").exists())
				.andExpect(jsonPath("$.paths['/api/auth/logout'].post.responses['204']").exists())
				.andExpect(jsonPath("$.components.securitySchemes.csrfToken.name").value("X-CSRF-TOKEN"));
	}

	@Test
	void operatorManagementContractIsDocumented() throws Exception {
		mvc.perform(get("/v3/api-docs")).andExpect(status().isOk())
				.andExpect(jsonPath("$.paths['/api/operator/vendors'].get").exists())
				.andExpect(jsonPath("$.paths['/api/operator/vendors'].post.responses['201']").exists())
				.andExpect(jsonPath("$.paths['/api/operator/vendors'].post.security[0].csrfToken").isArray())
				.andExpect(jsonPath("$.paths['/api/operator/vendors/{id}'].put.responses['404']").exists())
				.andExpect(jsonPath("$.paths['/api/operator/vendors/{id}'].put.security[0].csrfToken").isArray())
				.andExpect(jsonPath("$.components.schemas.OperatorVendorRequest.properties.operatorId").doesNotExist());
	}

	@Test
	void swaggerAssetsAndConfigurationAreAccessible() throws Exception {
		mvc.perform(get("/swagger-ui.html")).andExpect(status().is3xxRedirection());
		mvc.perform(get("/swagger-ui/index.html")).andExpect(status().isOk())
				.andExpect(content().string(containsString("Swagger UI")));
		mvc.perform(get("/v3/api-docs/swagger-config")).andExpect(status().isOk());
	}

	@Test
	void documentationDoesNotBypassApplicationSecurity() throws Exception {
		mvc.perform(post("/api/auth/register").contentType("application/json").content("{}"))
				.andExpect(status().isForbidden());
		mvc.perform(get("/api/private").accept("application/json")).andExpect(status().isUnauthorized());
	}
}
