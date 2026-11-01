package com.Bitemap.Backend.order;

import com.Bitemap.Backend.auth.AccountPrincipal;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.*;

class CheckoutAccountBindingTests {
    @Test
    void switchedSessionCannotSubmitAnAttemptForThePreviousAccount() {
        var service = mock(OrderService.class);
        var controller = new CustomerOrderController(service);
        var principal = new AccountPrincipal(8, "b@example.test", "unused", true,
                List.of(new SimpleGrantedAuthority("ROLE_CUSTOMER")));
        var authentication = UsernamePasswordAuthenticationToken.authenticated(principal, null, principal.getAuthorities());
        assertThrows(org.springframework.security.access.AccessDeniedException.class,
                () -> controller.create(authentication, null, 7L));
        verifyNoInteractions(service);
    }
}
