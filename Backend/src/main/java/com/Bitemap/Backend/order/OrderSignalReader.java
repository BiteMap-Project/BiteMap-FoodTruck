package com.Bitemap.Backend.order;

import com.Bitemap.Backend.auth.AccountPrincipal;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

@Service
public class OrderSignalReader {
    public record Signal(String revision, long createdCount, long placedCount) {}
    private final JdbcTemplate jdbc;
    public OrderSignalReader(JdbcTemplate jdbc) { this.jdbc=jdbc; }

    /** Each tick is a new short transaction: no connection is held for the stream lifetime. */
    @Transactional(readOnly=true, timeout=5)
    public Signal read(AccountPrincipal principal, long resourceId, boolean operator) {
        String sql = operator ? """
            SELECT COALESCE(s.revision,0),COALESCE(s.created_count,0),COALESCE(s.placed_count,0)
            FROM vendors v JOIN operators p ON p.id=v.operator_id AND p.enabled
            JOIN app_users u ON u.id=p.user_id AND u.enabled
            JOIN app_user_roles r ON r.user_id=u.id AND r.role='OPERATOR'
            LEFT JOIN vendor_order_signals s ON s.vendor_id=v.id
            WHERE v.id=? AND u.id=? AND u.credential_version=?
            """ : """
            SELECT o.version,0,0 FROM customer_orders o
            JOIN app_users u ON u.id=o.customer_user_id AND u.enabled
            JOIN app_user_roles r ON r.user_id=u.id AND r.role='CUSTOMER'
            WHERE o.id=? AND u.id=? AND u.credential_version=?
            """;
        return jdbc.query(sql,(row,index)->new Signal(row.getString(1),row.getLong(2),row.getLong(3)),
            resourceId,principal.userId(),principal.credentialVersion()).stream().findFirst()
            .orElseThrow(()->new ResponseStatusException(HttpStatus.NOT_FOUND,"Order updates are unavailable to this account."));
    }
}
