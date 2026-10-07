package com.Bitemap.Backend.location.management;

import com.Bitemap.Backend.auth.OperatorAccountService;
import com.Bitemap.Backend.auth.SecurityConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.CannotAcquireLockException;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.hamcrest.Matchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(OperatorStopController.class)
@Import(SecurityConfiguration.class)
class OperatorStopErrorTests {
    @Autowired MockMvc mvc;
    @MockitoBean OperatorStopService service;
    @MockitoBean OperatorAccountService accounts;
    @Test void databaseAndLockFailuresDoNotExposeSql() throws Exception {
        when(service.list(anyString(),anyLong(),anyInt(),anyInt())).thenThrow(new DataAccessResourceFailureException("SECRET SQL"));
        mvc.perform(get("/api/operator/vendors/1/stops").with(user("owner").roles("OPERATOR")))
                .andExpect(status().isServiceUnavailable()).andExpect(content().string(not(containsString("SECRET"))));
        when(service.cancel(anyString(),anyLong(),anyLong(),any())).thenThrow(new CannotAcquireLockException("SECRET SQL"));
        mvc.perform(post("/api/operator/vendors/1/stops/1/cancel").with(user("owner").roles("OPERATOR")).with(csrf()).contentType("application/json").content("{\"version\":0}"))
                .andExpect(status().isConflict()).andExpect(content().string(not(containsString("SECRET"))));
    }
}
