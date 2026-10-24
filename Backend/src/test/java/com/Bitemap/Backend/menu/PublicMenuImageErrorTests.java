package com.Bitemap.Backend.menu;

import com.Bitemap.Backend.auth.AccountDetailsService;
import com.Bitemap.Backend.auth.SecurityConfiguration;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.WebMvcTest;
import org.springframework.context.annotation.Import;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;
import static org.hamcrest.Matchers.not;
import static org.hamcrest.Matchers.containsString;

@WebMvcTest(PublicMenuImageController.class)
@Import(SecurityConfiguration.class)
class PublicMenuImageErrorTests {
    @Autowired MockMvc mvc;
    @MockitoBean MenuItemRepository items;
    @MockitoBean AccountDetailsService accounts;

    @Test void publicDatabaseErrorsAreSanitized() throws Exception {
        when(items.findByIdAndVendorId(2, 1)).thenThrow(new DataAccessResourceFailureException("SECRET SQL"));
        mvc.perform(get("/api/vendors/1/menu-items/2/image"))
                .andExpect(status().isServiceUnavailable()).andExpect(content().string(not(containsString("SECRET"))));
    }
}
