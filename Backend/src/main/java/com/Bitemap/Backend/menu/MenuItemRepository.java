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
            WHERE v.id = :vendorId AND o.email = :email AND o.enabled = TRUE
            FOR SHARE OF o, v
            """, nativeQuery = true)
    Optional<Long> lockOwnedVendor(@Param("vendorId") long vendorId, @Param("email") String email);

    Optional<MenuItem> findByIdAndVendorId(long id, long vendorId);
    Page<MenuItem> findAllByVendorId(long vendorId, Pageable pageable);
}
