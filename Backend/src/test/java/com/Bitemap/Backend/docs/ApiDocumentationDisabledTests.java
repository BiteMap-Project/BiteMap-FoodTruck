package com.Bitemap.Backend.docs;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest
@AutoConfigureMockMvc
class ApiDocumentationDisabledTests {
	@Autowired MockMvc mvc;

	@Test
	void docsAreNotRegisteredOutsideDevelopment() throws Exception {
		mvc.perform(get("/v3/api-docs").with(user("tester"))).andExpect(status().isNotFound());
		mvc.perform(get("/swagger-ui.html").with(user("tester"))).andExpect(status().isNotFound());
	}
}
