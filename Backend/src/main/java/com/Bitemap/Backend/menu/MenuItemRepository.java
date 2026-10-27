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

    // Explicit scalar projection: image_data is inspected for presence by PostgreSQL,
    // never transferred as bytea or materialized in a managed entity for menu reads.
    @Query(value = """
            select new com.Bitemap.Backend.menu.MenuItemResponse(
                m.id, m.vendorId, m.name, m.description, m.price, m.status, m.version,
                m.imagePreset, m.imageData is not null)
            from MenuItem m where m.vendorId = :vendorId
            """, countQuery = "select count(m.id) from MenuItem m where m.vendorId = :vendorId")
    Page<MenuItemResponse> findMetadataByVendorId(@Param("vendorId") long vendorId, Pageable pageable);

    @Query("""
            select new com.Bitemap.Backend.menu.MenuItemResponse(
                m.id, m.vendorId, m.name, m.description, m.price, m.status, m.version,
                m.imagePreset, m.imageData is not null)
            from MenuItem m where m.vendorId = :vendorId and m.id = :id
            """)
    Optional<MenuItemResponse> findMetadataByIdAndVendorId(@Param("id") long id, @Param("vendorId") long vendorId);
}
