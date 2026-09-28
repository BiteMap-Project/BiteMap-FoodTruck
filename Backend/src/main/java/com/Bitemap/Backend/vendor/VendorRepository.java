package com.Bitemap.Backend.vendor;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.Repository;
import org.springframework.data.repository.query.Param;

interface VendorRepository extends Repository<Vendor, Long> {

	Page<Vendor> findAll(Pageable pageable);

	@Query("""
			SELECT v FROM Vendor v
			WHERE lower(v.name) LIKE lower(:pattern) ESCAPE '!'
			   OR lower(v.category) LIKE lower(:pattern) ESCAPE '!'
			   OR lower(v.location) LIKE lower(:pattern) ESCAPE '!'
			""")
	Page<Vendor> search(@Param("pattern") String pattern, Pageable pageable);
}
