package com.Bitemap.Backend.auth.limit;

import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Component;

@Component
public class ClientAddressResolver {
    public String resolve(HttpServletRequest request) {
        // Never trust Forwarded/X-Forwarded-For from arbitrary clients. Proxy
        // support requires an explicit trusted-ingress deployment configuration.
        String address = request.getRemoteAddr();
        if (address == null || address.isBlank()) throw new IllegalStateException("Client address unavailable");
        return address;
    }
}
