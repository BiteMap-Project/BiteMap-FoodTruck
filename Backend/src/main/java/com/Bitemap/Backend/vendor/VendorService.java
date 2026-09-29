package com.Bitemap.Backend.vendor;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class VendorService {

	private final VendorRepository repository;

	public VendorService(VendorRepository repository) {
		this.repository = repository;
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
