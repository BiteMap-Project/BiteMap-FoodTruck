package com.Bitemap.Backend.favorite;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.Bitemap.Backend.auth.AccountPrincipal;

/**
 * SCRUM-78: a signed-in customer's saved trucks. The security configuration
 * requires ROLE_CUSTOMER for /api/customer/**, and writes require a CSRF token.
 */
@RestController
@RequestMapping("/api/customer/favorites")
public class FavoriteController {
	private final FavoriteService favorites;

	public FavoriteController(FavoriteService favorites) {
		this.favorites = favorites;
	}

	private static long userId(Authentication authentication) {
		return ((AccountPrincipal) authentication.getPrincipal()).userId();
	}

	@GetMapping
	@io.swagger.v3.oas.annotations.Operation(summary = "List your saved trucks, newest first")
	public ResponseEntity<FavoritePage> list(Authentication authentication,
			@RequestParam(defaultValue = "0") @Min(0) @Max(10000) int page,
			@RequestParam(defaultValue = "20") @Min(1) @Max(100) int size) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore())
				.body(favorites.list(userId(authentication), page, size));
	}

	@GetMapping("/ids")
	@io.swagger.v3.oas.annotations.Operation(summary = "IDs of your saved trucks")
	public ResponseEntity<FavoriteIds> ids(Authentication authentication) {
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(favorites.ids(userId(authentication)));
	}

	@PutMapping("/{vendorId}")
	@io.swagger.v3.oas.annotations.Operation(summary = "Save a truck (saving twice is allowed)")
	public ResponseEntity<Void> save(Authentication authentication, @PathVariable long vendorId) {
		favorites.save(userId(authentication), vendorId);
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}

	@DeleteMapping("/{vendorId}")
	@io.swagger.v3.oas.annotations.Operation(summary = "Remove a saved truck (removing twice is allowed)")
	public ResponseEntity<Void> remove(Authentication authentication, @PathVariable long vendorId) {
		favorites.remove(userId(authentication), vendorId);
		return ResponseEntity.noContent().cacheControl(CacheControl.noStore()).build();
	}
}
