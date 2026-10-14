package com.Bitemap.Backend.onboarding;

import java.util.List;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.http.HttpStatus;

@Service
@Transactional(readOnly=true)
public class OwnerApplicationService {
    private final JdbcTemplate jdbc;
    public OwnerApplicationService(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    private static final RowMapper<OwnerApplication> ROW = (rs, n) -> new OwnerApplication(
        rs.getLong("id"), rs.getString("business_name"), rs.getString("contact_email"), rs.getString("operating_area"),
        rs.getString("status"), rs.getTimestamp("submitted_at").toInstant(),
        rs.getTimestamp("reviewed_at") == null ? null : rs.getTimestamp("reviewed_at").toInstant(),
        rs.getObject("reviewed_by", Long.class), rs.getString("review_note"));

    public OwnerApplication mine(long user) {
        return jdbc.query("SELECT * FROM owner_applications WHERE user_id=?", ROW, user).stream().findFirst().orElse(null);
    }

    @Transactional
    public OwnerApplication submit(long user, OwnerApplication.Submit body) {
        requireRole(user, "CUSTOMER");
        if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM operators WHERE user_id=?)", Boolean.class, user)))
            throw conflict("An operator profile already exists. Contact an administrator if access was revoked.");
        var created = jdbc.query("""
            INSERT INTO owner_applications(user_id,business_name,contact_email,operating_area)
            VALUES (?,?,?,?) ON CONFLICT (user_id) DO NOTHING RETURNING *
            """, ROW, user, body.businessName().strip(), body.contactEmail().strip(), body.operatingArea().strip());
        if (created.isEmpty()) throw conflict("An application already exists. Check its status.");
        return created.getFirst();
    }

    @Transactional
    public List<OwnerApplication> pending(long reviewer, int page) {
        requireRole(reviewer, "ADMIN");
        return jdbc.query("SELECT * FROM owner_applications WHERE status='PENDING' ORDER BY submitted_at,id LIMIT 20 OFFSET ?",
                ROW, (long)page * 20);
    }

    @Transactional
    public OwnerApplication review(long reviewer, long id, OwnerApplication.Review body) {
        requireRole(reviewer, "ADMIN");
        var users = jdbc.queryForList("SELECT user_id FROM owner_applications WHERE id=?", Long.class, id);
        if (users.isEmpty()) throw new ApplicationException(HttpStatus.NOT_FOUND, "Application not found.");
        long user = users.getFirst();
        if (user == reviewer) throw new AccessDeniedException("You cannot review your own application.");
        requireRole(user, "CUSTOMER");
        var application = jdbc.query("SELECT * FROM owner_applications WHERE id=? FOR UPDATE", ROW, id).getFirst();
        if (!application.status().equals("PENDING")) throw conflict("This application has already been reviewed.");
        if (body.decision() == OwnerApplication.Decision.APPROVED) {
            if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM operators WHERE user_id=?)", Boolean.class, user)))
                throw conflict("An operator profile already exists. Review access separately.");
            jdbc.update("INSERT INTO operators(user_id) VALUES (?)", user);
            jdbc.update("INSERT INTO app_user_roles(user_id,role) VALUES (?,'OPERATOR') ON CONFLICT DO NOTHING", user);
        }
        return jdbc.query("""
            UPDATE owner_applications SET status=?,reviewed_by=?,reviewed_at=clock_timestamp(),review_note=?
            WHERE id=? RETURNING *
            """, ROW, body.decision().name(), reviewer, body.note().strip(), id).getFirst();
    }

    // Keep the account and grant stable until the transaction completes, including admin revocation.
    private void requireRole(long user, String role) {
        if (jdbc.queryForList("""
            SELECT u.id FROM app_users u JOIN app_user_roles r ON r.user_id=u.id
            WHERE u.id=? AND u.enabled AND r.role=? FOR SHARE OF u,r
            """, Long.class, user, role).isEmpty()) throw new AccessDeniedException("Required account access is unavailable.");
    }
    private static ApplicationException conflict(String message) { return new ApplicationException(HttpStatus.CONFLICT, message); }
    public static class ApplicationException extends RuntimeException {
        final HttpStatus status;
        ApplicationException(HttpStatus status, String message) { super(message); this.status = status; }
    }
}
