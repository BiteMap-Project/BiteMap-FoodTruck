package com.Bitemap.Backend.location;

import com.Bitemap.Backend.auth.SecurityConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.transaction.CannotCreateTransactionException;
import static org.mockito.BDDMockito.given;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(StopController.class)
@Import(SecurityConfiguration.class)
class StopErrorTests {
	@MockitoBean
	private com.Bitemap.Backend.auth.AccountDetailsService accounts;
    @Autowired MockMvc mvc;
    @MockitoBean StopService service;

    @Test
    void hidesDatabaseDetails() throws Exception {
        given(service.list("", "", null, null, null, null, null, 0, 20))
                .willThrow(new DataAccessResourceFailureException("secret-sql"));
        unavailable();
    }

    @Test
    void handlesConnectionFailure() throws Exception {
        given(service.list("", "", null, null, null, null, null, 0, 20))
                .willThrow(new CannotCreateTransactionException("secret-sql"));
        unavailable();
    }

    void unavailable() throws Exception {
        mvc.perform(get("/api/vendor-stops")).andExpect(status().isServiceUnavailable())
                .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                .andExpect(jsonPath("$.status").value(503))
                .andExpect(content().string(not(containsString("secret-sql"))));
    }
}
