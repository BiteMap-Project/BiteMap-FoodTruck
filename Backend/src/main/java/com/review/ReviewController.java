package com.Bitemap.Backend.review;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import com.Bitemap.Backend.auth.AccountPrincipal;

@RestController
public class ReviewController {
    private final ReviewService service;
    public ReviewController(ReviewService service) { this.service=service; }
    private static <T> ResponseEntity<T> response(T value) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(value);
    }
    @GetMapping("/api/vendors/{vendorId}/review-summary")
    public ResponseEntity<ReviewService.Summary> summary(@PathVariable long vendorId) {
        return response(service.summary(vendorId));
    }
    @GetMapping("/api/vendors/{vendorId}/reviews")
    public ResponseEntity<ReviewService.ReviewPage> list(@PathVariable long vendorId,
            @RequestParam(defaultValue="0") @Min(0) @Max(10000) int page) {
        return response(service.list(vendorId,page));
    }
    @GetMapping("/api/customer/vendors/{vendorId}/review")
    public ResponseEntity<ReviewService.Mine> mine(Authentication auth,@PathVariable long vendorId) {
        return response(service.mine(principal(auth).userId(),vendorId));
    }
    @PostMapping("/api/customer/vendors/{vendorId}/review")
    public ResponseEntity<ReviewService.Review> save(Authentication auth,@PathVariable long vendorId,
            @RequestHeader("X-Review-Account-Id") long expectedAccountId,@Valid @RequestBody ReviewService.Save input) {
        long user=principal(auth).userId();
        if (user!=expectedAccountId) throw new org.springframework.security.access.AccessDeniedException("Your account changed. Reload before saving.");
        return response(service.save(user,vendorId,input));
    }
    @GetMapping("/api/operator/vendors/{vendorId}/reviews")
    public ResponseEntity<ReviewService.ReviewPage> owned(Authentication auth,@PathVariable long vendorId,
            @RequestParam(defaultValue="0") @Min(0) @Max(10000) int page) {
        return response(service.owned(auth.getName(),vendorId,page));
    }
    private static AccountPrincipal principal(Authentication auth) {
        if (!(auth.getPrincipal() instanceof AccountPrincipal p))
            throw new org.springframework.security.access.AccessDeniedException("Sign in again.");
        return p;
    }
}