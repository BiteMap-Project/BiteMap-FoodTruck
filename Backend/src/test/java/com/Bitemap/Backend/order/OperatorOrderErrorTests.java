package com.Bitemap.Backend.order;

import com.Bitemap.Backend.auth.AccountDetailsService;
import com.Bitemap.Backend.auth.AccountResponse;
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
import static org.mockito.Mockito.*;
import static org.hamcrest.Matchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(OperatorOrderController.class)
@Import(SecurityConfiguration.class)
class OperatorOrderErrorTests {
    @Autowired MockMvc mvc;
    @MockitoBean OperatorOrderService service;
    @MockitoBean AccountDetailsService accounts;

    @Test
    void databaseFailuresAreSanitizedForEveryEndpoint() throws Exception {
        when(accounts.account(anyString())).thenAnswer(call ->
                new AccountResponse(1,"Owner",call.getArgument(0),java.util.List.of("ROLE_OPERATOR")));
        when(service.list(anyString(),anyLong(),any(),anyInt(),anyInt())).thenThrow(new DataAccessResourceFailureException("SECRET SQL"));
        when(service.get(anyString(),anyLong(),anyLong())).thenThrow(new DataAccessResourceFailureException("SECRET SQL"));
        when(service.update(anyString(),anyLong(),anyLong(),any())).thenThrow(new CannotCreateTransactionException("SECRET CONNECTION"));
        for (var request : java.util.List.of(get("/api/operator/vendors/1/orders"),get("/api/operator/vendors/1/orders/1"),
                patch("/api/operator/vendors/1/orders/1/status"))) {
            mvc.perform(request.with(com.Bitemap.Backend.TestAccounts.user("owner@example.com").roles("OPERATOR"))
                    .with(csrf()).contentType("application/json").content("{\"status\":\"ACCEPTED\",\"version\":0}"))
                    .andExpect(status().isServiceUnavailable()).andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                    .andExpect(jsonPath("$.trace").doesNotExist()).andExpect(content().string(not(containsString("SECRET"))));
        }
    }
}
