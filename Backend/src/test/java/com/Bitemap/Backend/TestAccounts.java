package com.Bitemap.Backend;

import org.springframework.jdbc.core.JdbcTemplate;

/** Database fixtures, not a registration shortcut available to the application. */
public final class TestAccounts {
    private TestAccounts() {}
    public static SessionUser user(String email) { return new SessionUser(email); }

    public static final class SessionUser implements org.springframework.test.web.servlet.request.RequestPostProcessor {
        private final String email;
        private String[] roles = {"USER"};
        SessionUser(String email) { this.email = email; }
        public SessionUser roles(String... roles) { this.roles = roles.clone(); return this; }
        @Override
        public org.springframework.mock.web.MockHttpServletRequest postProcessRequest(org.springframework.mock.web.MockHttpServletRequest request) {
            var context = org.springframework.web.context.support.WebApplicationContextUtils.getRequiredWebApplicationContext(request.getServletContext());
            long id;
            try {
                id = context.getBean(com.Bitemap.Backend.auth.AccountDetailsService.class).account(email).id();
            } catch (org.springframework.security.core.AuthenticationException exception) { id = -1; }
            var authorities = java.util.Arrays.stream(roles)
                    .map(role -> new org.springframework.security.core.authority.SimpleGrantedAuthority("ROLE_" + role)).toList();
            var principal = new com.Bitemap.Backend.auth.AccountPrincipal(id, email, "", true, authorities);
            principal.eraseCredentials();
            return org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user(principal).postProcessRequest(request);
        }
    }
    public static long operator(JdbcTemplate jdbc, String name, String email, String hash) {
        long user = jdbc.queryForObject("INSERT INTO app_users(display_name,email,password_hash) VALUES (?,?,?) RETURNING id",
                Long.class, name, email, hash);
        jdbc.update("INSERT INTO app_user_roles(user_id,role) VALUES (?, 'CUSTOMER'), (?, 'OPERATOR')", user, user);
        return jdbc.queryForObject("INSERT INTO operators(user_id) VALUES (?) RETURNING id", Long.class, user);
    }
    public static void deleteOperator(JdbcTemplate jdbc, long operator) {
        long user = jdbc.queryForObject("SELECT user_id FROM operators WHERE id=?", Long.class, operator);
        jdbc.update("DELETE FROM operators WHERE id=?", operator);
        jdbc.update("DELETE FROM app_users WHERE id=?", user);
    }
}
