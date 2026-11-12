package com.Bitemap.Backend.review;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import jakarta.validation.constraints.*;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

@Service
public class ReviewService {
    public record Summary(BigDecimal averageRating, long reviewCount) {}
    public record Review(long id, String authorName, int rating, String comment,
                         long version, Instant createdAt, Instant updatedAt) {}
    public record ReviewPage(List<Review> items, int page, int size, long totalElements,
                             long totalPages, Summary summary) {}
    public record Mine(boolean eligible, String reason, Review review) {}
    public record Save(@NotNull @Min(1) @Max(5) Integer rating,
                       @NotBlank @Size(max = 2000) String comment,
                       @NotNull @Min(-1) Long version) {}
    private final JdbcTemplate jdbc;
    public ReviewService(JdbcTemplate jdbc) { this.jdbc = jdbc; }
    private static final String SELECT = """
        SELECT r.id, u.display_name, r.rating, r.comment, r.version, r.created_at, r.updated_at
        FROM customer_reviews r JOIN app_users u ON u.id=r.customer_user_id
        """;
    private static final RowMapper<Review> ROW = (r, n) -> new Review(r.getLong("id"),
        r.getString("display_name"), r.getInt("rating"), r.getString("comment"),
        r.getLong("version"), r.getTimestamp("created_at").toInstant(), r.getTimestamp("updated_at").toInstant());

    @Transactional(readOnly = true)
    public Summary summary(long vendor) {
        requireVendor(vendor);
        return totals(vendor);
    }
    @Transactional(readOnly = true)
    public java.util.Map<Long, Summary> summaries(List<Long> vendors) {
        var result = new java.util.HashMap<Long, Summary>();
        if (vendors.isEmpty()) return result;
        var named = new org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate(jdbc);
        named.query("SELECT vendor_id, round(avg(rating),1) AS average, count(*) AS count FROM customer_reviews WHERE vendor_id IN (:ids) GROUP BY vendor_id",
            java.util.Map.of("ids", vendors), (org.springframework.jdbc.core.RowCallbackHandler) r -> {
                result.put(r.getLong("vendor_id"), new Summary(r.getBigDecimal("average"), r.getLong("count")));
            });
        return result;
    }
    private Summary totals(long vendor) {
        return jdbc.queryForObject("SELECT round(avg(rating),1),count(*) FROM customer_reviews WHERE vendor_id=?",
            (r,n) -> new Summary(r.getBigDecimal(1),r.getLong(2)), vendor);
    }
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public ReviewPage list(long vendor, int page) {
        requireVendor(vendor);
        return readPage(vendor, page);
    }
    // The owner endpoint checks ownership even though the review content is public.
    @Transactional(isolation = Isolation.REPEATABLE_READ)
    public ReviewPage owned(String email, long vendor, int page) {
        var owners = jdbc.query(com.Bitemap.Backend.auth.OperatorOwnership.SQL, (r,n)->r.getLong(1), email);
        if (owners.isEmpty()) throw error(HttpStatus.FORBIDDEN,"Owner access is required.");
        if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM vendors WHERE id=? AND operator_id=?)",
                Boolean.class, vendor, owners.getFirst()))) throw error(HttpStatus.NOT_FOUND,"Truck not found.");
        return readPage(vendor, page);
    }
    private ReviewPage readPage(long vendor, int page) {
        if (page < 0 || page > 10000) throw error(HttpStatus.BAD_REQUEST,"Invalid review page.");
        Summary summary = totals(vendor);
        var rows = jdbc.query(SELECT + " WHERE r.vendor_id=? ORDER BY r.created_at DESC,r.id DESC LIMIT 5 OFFSET ?",
            ROW, vendor, (long)page * 5);
        return new ReviewPage(rows,page,5,summary.reviewCount(),(summary.reviewCount()+4)/5,summary);
    }
    @Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
    public Mine mine(long user, long vendor) {
        requireVendor(vendor);
        String reason = ineligible(user, vendor);
        return new Mine(reason.isEmpty(),reason,findMine(user,vendor));
    }
    @Transactional
    public Review save(long user, long vendor, Save input) {
        // Serializes writes for this author, including simultaneous first submissions.
        var users = jdbc.query("SELECT id FROM app_users WHERE id=? AND enabled FOR UPDATE", (r,n)->r.getLong(1), user);
        if (users.isEmpty()) throw error(HttpStatus.FORBIDDEN,"An active account is required.");
        // Prevent ownership changes while checking that an owner is not reviewing their own truck.
        if (jdbc.query("SELECT id FROM vendors WHERE id=? FOR SHARE", (r,n)->r.getLong(1),vendor).isEmpty())
            throw error(HttpStatus.NOT_FOUND,"Truck not found.");
        String reason = ineligible(user,vendor);
        if (!reason.isEmpty()) throw error(HttpStatus.FORBIDDEN,reason);
        Review current = findMine(user,vendor);
        long expected = current == null ? -1 : current.version();
        if (input.version() != expected) throw error(HttpStatus.CONFLICT,"Your review changed. Reload reviews before editing again.");
        String comment = input.comment().strip();
        if (comment.isBlank()) throw error(HttpStatus.BAD_REQUEST,"Write a review before saving.");
        if (current == null) {
            jdbc.update("INSERT INTO customer_reviews(vendor_id,customer_user_id,rating,comment) VALUES (?,?,?,?)",
                vendor,user,input.rating(),comment);
        } else {
            jdbc.update("UPDATE customer_reviews SET rating=?,comment=?,version=version+1,updated_at=clock_timestamp() WHERE vendor_id=? AND customer_user_id=?",
                input.rating(),comment,vendor,user);
        }
        return findMine(user,vendor);
    }
    private Review findMine(long user,long vendor) {
        return jdbc.query(SELECT + " WHERE r.customer_user_id=? AND r.vendor_id=?",ROW,user,vendor).stream().findFirst().orElse(null);
    }
    private String ineligible(long user,long vendor) {
        if (Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM vendors v JOIN operators o ON o.id=v.operator_id WHERE v.id=? AND o.user_id=?)",
                Boolean.class,vendor,user))) return "You cannot review your own truck.";
        boolean completed = Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM customer_orders WHERE customer_user_id=? AND vendor_id=? AND status='COMPLETED')",
                Boolean.class,user,vendor));
        return completed ? "" : "Complete a pickup order from this truck to leave a review.";
    }
    private void requireVendor(long vendor) {
        if (!Boolean.TRUE.equals(jdbc.queryForObject("SELECT EXISTS(SELECT 1 FROM vendors WHERE id=?)",Boolean.class,vendor)))
            throw error(HttpStatus.NOT_FOUND,"Truck not found.");
    }
    private static ResponseStatusException error(HttpStatus status,String message) { return new ResponseStatusException(status,message); }
}