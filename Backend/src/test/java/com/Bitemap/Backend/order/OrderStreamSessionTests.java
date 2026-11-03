package com.Bitemap.Backend.order;

import com.Bitemap.Backend.auth.AccountPrincipal;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextImpl;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.*;

class OrderStreamSessionTests {
    AccountPrincipal principal(long id,long version,String role) {
        return new AccountPrincipal(id,"fixture@example.test","",true,java.util.List.of(new SimpleGrantedAuthority(role)),version);
    }
    void authenticate(MockHttpSession session,AccountPrincipal p) {
        session.setAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY,
            new SecurityContextImpl(UsernamePasswordAuthenticationToken.authenticated(p,null,p.getAuthorities())));
    }
    @Test void logoutAccountSwitchCredentialChangeAndRoleRemovalEndAccess() {
        var p=principal(1,0,"ROLE_OPERATOR"); var session=new MockHttpSession(); authenticate(session,p);
        var c=new OrderEventStreams.Connection(new SseEmitter(),p,session,7,true);
        assertThat(OrderEventStreams.currentSession(c)).isTrue();
        authenticate(session,principal(2,0,"ROLE_OPERATOR")); assertThat(OrderEventStreams.currentSession(c)).isFalse();
        authenticate(session,principal(1,1,"ROLE_OPERATOR")); assertThat(OrderEventStreams.currentSession(c)).isFalse();
        authenticate(session,principal(1,0,"ROLE_CUSTOMER")); assertThat(OrderEventStreams.currentSession(c)).isFalse();
        authenticate(session,p); session.invalidate(); assertThat(OrderEventStreams.currentSession(c)).isFalse();
    }
    @Test void admissionIsBoundedPerAccountAndServer() {
        var reader=mock(OrderSignalReader.class);
        when(reader.read(any(),anyLong(),anyBoolean())).thenReturn(new OrderSignalReader.Signal("0",0,0));
        var streams=new OrderEventStreams(reader,2,1);
        try {
            streams.open(principal(1,0,"ROLE_OPERATOR"),new MockHttpSession(),7,true);
            assertThatThrownBy(()->streams.open(principal(1,0,"ROLE_OPERATOR"),new MockHttpSession(),8,true))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class).hasMessageContaining("429");
            streams.open(principal(2,0,"ROLE_OPERATOR"),new MockHttpSession(),8,true);
            assertThatThrownBy(()->streams.open(principal(3,0,"ROLE_OPERATOR"),new MockHttpSession(),9,true))
                .isInstanceOf(org.springframework.web.server.ResponseStatusException.class).hasMessageContaining("429");
        } finally { streams.shutdown(); }
    }
}
