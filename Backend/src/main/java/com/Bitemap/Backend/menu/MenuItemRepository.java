package com.Bitemap.Backend.menu;

import java.util.Optional;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface MenuItemRepository extends JpaRepository<MenuItem, Long> {
    // PostgreSQL-specific locking keeps account state and vendor ownership stable
    // for the service transaction. No entity graph or per-item ownership query.
    @Query(value = """
            SELECT v.id FROM vendors v JOIN operators o ON o.id = v.operator_id
            JOIN app_users u ON u.id=o.user_id
            JOIN app_user_roles r ON r.user_id=u.id AND r.role='OPERATOR'
            WHERE v.id = :vendorId AND u.email = :email AND u.enabled AND o.enabled
            FOR SHARE OF u, r, o, v
            """, nativeQuery = true)
    Optional<Long> lockOwnedVendor(@Param("vendorId") long vendorId, @Param("email") String email);

    Optional<MenuItem> findByIdAndVendorId(long id, long vendorId);
    Page<MenuItem> findAllByVendorId(long vendorId, Pageable pageable);
}
