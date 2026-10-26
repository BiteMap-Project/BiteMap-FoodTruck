package com.Bitemap.Backend.auth;

import com.Bitemap.Backend.auth.limit.AuthLimitRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.any;
import static org.hamcrest.Matchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest @AutoConfigureMockMvc
class AuthLimitFailureTests {
    @Autowired MockMvc mvc;
    @MockitoBean AuthLimitRepository repository;
    @MockitoBean AccountDetailsService accounts;
    @Test void limiterDatabaseFailureFailsClosedWithoutLeakingSqlOrCheckingPassword() throws Exception {
        when(repository.consume(any())).thenThrow(new org.springframework.dao.DataAccessResourceFailureException("SECRET SQL"));
        mvc.perform(post("/api/auth/login").with(csrf()).contentType("application/json")
                .content("{\"email\":\"test@example.test\",\"password\":\"Private password\"}"))
                .andExpect(status().isServiceUnavailable()).andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(content().string(not(containsString("SECRET"))))
                .andExpect(content().string(not(containsString("Private password"))));
        verify(accounts, never()).loadUserByUsername(any());
    }
}
