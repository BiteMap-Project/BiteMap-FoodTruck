package com.Bitemap.Backend.menu;

import com.Bitemap.Backend.auth.OperatorAccountService;
import com.Bitemap.Backend.auth.SecurityConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.OptimisticLockingFailureException;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.hamcrest.Matchers.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@WebMvcTest(MenuController.class)
@Import(SecurityConfiguration.class)
class MenuErrorTests {
    @Autowired MockMvc mvc;
    @MockitoBean MenuService service;
    @MockitoBean OperatorAccountService accounts;

    @Test
    void databaseAndConcurrencyFailuresDoNotLeakSql() throws Exception {
        when(service.list(anyString(), anyLong(), anyInt(), anyInt())).thenThrow(new DataAccessResourceFailureException("SECRET SQL"));
        mvc.perform(get("/api/operator/vendors/1/menu-items").with(user("owner").roles("OPERATOR")))
                .andExpect(status().isServiceUnavailable()).andExpect(content().string(not(containsString("SECRET"))));
        when(service.update(anyString(), anyLong(), anyLong(), any())).thenThrow(new OptimisticLockingFailureException("SECRET SQL"));
        mvc.perform(put("/api/operator/vendors/1/menu-items/1").with(user("owner").roles("OPERATOR")).with(csrf())
                .contentType("application/json").content("{\"name\":\"X\",\"price\":1,\"version\":0}"))
                .andExpect(status().isConflict()).andExpect(content().string(not(containsString("SECRET"))));
    }
}
