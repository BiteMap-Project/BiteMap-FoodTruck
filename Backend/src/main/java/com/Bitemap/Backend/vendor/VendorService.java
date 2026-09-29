package com.Bitemap.Backend.vendor;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.transaction.annotation.Isolation;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class VendorService {

	private final VendorRepository repository;
	private final JdbcTemplate jdbc;

	public VendorService(VendorRepository repository, JdbcTemplate jdbc) {
		this.repository = repository;
		this.jdbc = jdbc;
	}

	@Transactional(readOnly = true, isolation = Isolation.REPEATABLE_READ)
	public VendorProfile profile(long id) {
		Vendor vendor = repository.findById(id)
				.orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND, "Truck not found"));
		var menu = jdbc.query("""
				SELECT id, name, description, price, available FROM vendor_menu_items
				WHERE vendor_id = ? ORDER BY name, id
				""", (row, index) -> new VendorProfile.MenuItem(row.getLong("id"), row.getString("name"),
						row.getString("description"), row.getBigDecimal("price"), row.getBoolean("available")), id);
		return new VendorProfile(vendor.getId(), vendor.getName(), vendor.getCategory(), vendor.getLocation(), menu);
	}

	public VendorPage list(String query, int page, int size) {
		String search = query.strip();
		PageRequest request = PageRequest.of(page, size, Sort.by("name", "id"));
		Page<Vendor> result;
		if (search.isEmpty()) {
			result = repository.findAll(request);
		} else {
			// Treat LIKE metacharacters as literal search text. Values are bound parameters.
			String pattern = "%" + search.replace("!", "!!").replace("%", "!%").replace("_", "!_") + "%";
			result = repository.search(pattern, request);
		}
		return new VendorPage(result.getContent().stream().map(VendorSummary::from).toList(),
				result.getNumber(), result.getSize(), result.getTotalElements(), result.getTotalPages());
	}
}
