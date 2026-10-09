package com.Bitemap.Backend.auth;

/** Fixed-cost ownership lookup. Locks keep account, role and profile stable through the transaction. */
public final class OperatorOwnership {
    private OperatorOwnership() {}
    public static final String SQL = """
            SELECT o.id FROM app_users u
            JOIN operators o ON o.user_id=u.id
            JOIN app_user_roles r ON r.user_id=u.id AND r.role='OPERATOR'
            WHERE u.email=? AND u.enabled AND o.enabled
            FOR SHARE OF u,o,r
            """;
}
