package com.Bitemap.Backend.auth;

import java.io.IOException;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.dao.DataAccessException;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.AuthenticationException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.web.context.SecurityContextRepository;
import org.springframework.web.filter.OncePerRequestFilter;

/** Refreshes only existing grants: role additions require explicit onboarding or a new login. */
final class AccountSessionFilter extends OncePerRequestFilter {
    private final AccountDetailsService accounts;
    private final SecurityContextRepository contexts;
    AccountSessionFilter(AccountDetailsService accounts, SecurityContextRepository contexts) {
        this.accounts = accounts; this.contexts = contexts;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var current = SecurityContextHolder.getContext().getAuthentication();
        if (current != null && current.isAuthenticated() && !(current instanceof AnonymousAuthenticationToken)) {
            try {
                // Old/incompatible principals cannot be silently mapped to a newly created identity.
                if (!(current.getPrincipal() instanceof AccountPrincipal)) {
                    throw new org.springframework.security.authentication.BadCredentialsException("Sign in again");
                }
                var account = accounts.account(current.getName());
                if (current.getPrincipal() instanceof AccountPrincipal principal && principal.userId() != account.id()) {
                    throw new org.springframework.security.authentication.BadCredentialsException("Account changed");
                }
                var roles = current.getAuthorities().stream().map(a -> a.getAuthority())
                        .filter(account.roles()::contains).map(SimpleGrantedAuthority::new).toList();
                var principal = new AccountPrincipal(account.id(), account.email(), "", true, roles);
                principal.eraseCredentials();
                var authentication = UsernamePasswordAuthenticationToken.authenticated(principal, null, roles);
                var context = SecurityContextHolder.createEmptyContext();
                context.setAuthentication(authentication);
                SecurityContextHolder.setContext(context);
                contexts.saveContext(context, request, response);
            } catch (AuthenticationException exception) {
                SecurityContextHolder.clearContext();
                var session = request.getSession(false);
                if (session != null) session.invalidate();
                problem(response, 401, "Unauthorized");
                return;
            } catch (DataAccessException exception) {
                problem(response, 503, "Authentication temporarily unavailable");
                return;
            }
        }
        chain.doFilter(request, response);
    }

    private static void problem(HttpServletResponse response, int status, String title) throws IOException {
        response.setStatus(status);
        response.setContentType("application/problem+json");
        response.setHeader("Cache-Control", "no-store");
        response.getWriter().write("{\"status\":" + status + ",\"title\":\"" + title + "\"}");
    }
}
