package com.Bitemap.Backend.analytics;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/operator/analytics")
public class AnalyticsController {
	private final AnalyticsService service;

	public AnalyticsController(AnalyticsService service) {
		this.service = service;
	}

	@GetMapping("/trucks")
	public ResponseEntity<TruckAnalytics> trucks(Authentication authentication) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
				.body(service.truckMetrics(authentication.getName()));
	}
}
