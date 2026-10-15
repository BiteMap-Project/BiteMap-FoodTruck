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
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.doThrow;
import static org.hamcrest.Matchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(CustomerOrderController.class)
@Import(SecurityConfiguration.class)
class OrderErrorTests {
    @Autowired MockMvc mvc;
    @MockitoBean OrderService service;
    @MockitoBean AccountDetailsService accounts;

    @Test
    void databaseAndTransactionFailuresNeverExposeInternalDetails() throws Exception {
        when(accounts.account(anyString())).thenAnswer(call ->
                new AccountResponse(1, "Customer", call.getArgument(0), java.util.List.of("ROLE_CUSTOMER")));
        for (RuntimeException failure : java.util.List.of(new DataAccessResourceFailureException("SECRET SQL"),
                new CannotCreateTransactionException("SECRET CONNECTION"))) {
            doThrow(failure).when(service).create(anyString(), any());
            mvc.perform(post("/api/customer/orders").with(com.Bitemap.Backend.TestAccounts.user("customer@example.com").roles("CUSTOMER"))
                    .with(csrf()).contentType("application/json")
                    .content("{\"vendorId\":-1,\"idempotencyKey\":\"cd821fc5-316c-4a85-af68-e6890485d32c\",\"items\":[{\"menuItemId\":-5,\"quantity\":1}]}"))
                    .andExpect(status().isServiceUnavailable())
                    .andExpect(content().contentTypeCompatibleWith("application/problem+json"))
                    .andExpect(jsonPath("$.detail").value("Ordering is temporarily unavailable. Please try again."))
                    .andExpect(jsonPath("$.trace").doesNotExist())
                    .andExpect(content().string(not(containsString("SECRET"))));
        }
    }
}
