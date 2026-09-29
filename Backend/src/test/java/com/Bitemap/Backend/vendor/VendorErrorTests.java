package com.Bitemap.Backend.vendor;

import com.Bitemap.Backend.auth.SecurityConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.CannotCreateTransactionException;

import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.not;
import static org.mockito.BDDMockito.given;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@WebMvcTest(VendorController.class)
@Import(SecurityConfiguration.class)
class VendorErrorTests {

	@Autowired
	private MockMvc mvc;

	@MockitoBean
	private VendorService service;

	@Test
	void reportsDatabaseFailureWithoutLeakingInternalDetails() throws Exception {
		given(service.list("", 0, 20)).willThrow(new DataAccessResourceFailureException("internal-database-detail"));
		assertUnavailable();
	}

	@Test
	void reportsTransactionConnectionFailureAsUnavailable() throws Exception {
		given(service.list("", 0, 20)).willThrow(new CannotCreateTransactionException("internal-database-detail"));
		assertUnavailable();
	}

	private void assertUnavailable() throws Exception {
		mvc.perform(get("/api/vendors"))
				.andExpect(status().isServiceUnavailable())
				.andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
				.andExpect(jsonPath("$.status").value(503))
				.andExpect(jsonPath("$.detail").value("Vendor information is temporarily unavailable. Please try again later."))
				.andExpect(content().string(not(containsString("internal-database-detail"))))
				.andExpect(jsonPath("$.trace").doesNotExist());
	}
}
