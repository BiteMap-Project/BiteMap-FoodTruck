package com.Bitemap.Backend.auth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class RegistrationErrorTests {
	@Autowired private MockMvc mvc;
	@MockitoBean private AccountRegistrationService registration;

	@Test
	void databaseFailureDoesNotExposeSqlOrCredentials() throws Exception {
		when(registration.register(any())).thenThrow(new DataAccessResourceFailureException("SECRET SQL PARAMETERS"));
		mvc.perform(post("/api/auth/register").with(csrf()).contentType(MediaType.APPLICATION_JSON)
				.content("""
						{"displayName":"Owner","email":"owner@example.com","password":"Long test passphrase"}
						"""))
				.andExpect(status().isServiceUnavailable())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(content().string(not(containsString("SECRET"))))
				.andExpect(content().string(not(containsString("Long test passphrase"))));
	}
}
