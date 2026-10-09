package com.Bitemap.Backend.vendor;

import com.Bitemap.Backend.auth.AccountDetailsService;
import com.Bitemap.Backend.auth.SecurityConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.CannotCreateTransactionException;

import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.hamcrest.Matchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(OperatorVendorController.class)
@Import(SecurityConfiguration.class)
class OperatorVendorErrorTests {
	@Autowired MockMvc mvc;
	@MockitoBean OperatorVendorService service;
	@MockitoBean AccountDetailsService accounts;
    @org.junit.jupiter.api.BeforeEach
    void account() {
        when(accounts.account(anyString())).thenAnswer(call ->
                new com.Bitemap.Backend.auth.AccountResponse(
                        1, "Test", call.getArgument(0), java.util.List.of("ROLE_OPERATOR")));
    }

	@Test
	void databaseAndTransactionFailuresAreSanitized() throws Exception {
		when(service.list(anyString(), anyInt(), anyInt())).thenThrow(new DataAccessResourceFailureException("SECRET SQL"));
		when(service.create(anyString(), any())).thenThrow(new CannotCreateTransactionException("SECRET CONNECTION"));
		when(service.update(anyString(), anyLong(), any())).thenThrow(new DataAccessResourceFailureException("SECRET SQL"));
		for (var request : java.util.List.of(get("/api/operator/vendors"), post("/api/operator/vendors"), put("/api/operator/vendors/1"))) {
			mvc.perform(request.with(com.Bitemap.Backend.TestAccounts.user("owner@example.com").roles("OPERATOR")).with(csrf()).contentType("application/json")
					.content("{\"name\":\"Name\",\"category\":\"Food\",\"location\":\"CSUN\"}"))
					.andExpect(status().isServiceUnavailable()).andExpect(content().contentTypeCompatibleWith("application/problem+json"))
					.andExpect(content().string(not(containsString("SECRET"))));
		}
	}
}
