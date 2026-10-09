package com.Bitemap.Backend.auth;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

import static org.hamcrest.Matchers.*;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
class SessionErrorTests {
	@Autowired MockMvc mvc;
	@MockitoBean AccountService onboarding;
	@MockitoBean AccountDetailsService accounts;

	@Test
	void databaseFailureIsSafeAndDoesNotLookLikeWrongPassword() throws Exception {
		when(accounts.loadUserByUsername("owner@example.com"))
				.thenThrow(new DataAccessResourceFailureException("SECRET SQL PARAMETERS"));
		mvc.perform(post("/api/auth/login").with(csrf()).contentType("application/json")
				.content("{\"email\":\"owner@example.com\",\"password\":\"DO_NOT_ECHO_PASSWORD\"}"))
				.andExpect(status().isServiceUnavailable())
				.andExpect(content().string(not(containsString("SECRET"))))
				.andExpect(content().string(not(containsString("DO_NOT_ECHO_PASSWORD"))));
	}
}
