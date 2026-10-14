package com.Bitemap.Backend.onboarding;

import com.Bitemap.Backend.auth.AccountPrincipal;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import java.util.List;
import org.springframework.http.*;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
public class OwnerApplicationController {
    private final OwnerApplicationService service;
    public OwnerApplicationController(OwnerApplicationService service) { this.service = service; }
    @GetMapping("/api/customer/owner-application")
    @PreAuthorize("hasRole('CUSTOMER')")
    ResponseEntity<OwnerApplication> mine(@AuthenticationPrincipal AccountPrincipal user) {
        var application = service.mine(user.userId());
        return ResponseEntity.status(application == null ? 204 : 200).cacheControl(CacheControl.noStore()).body(application);
    }
    @PostMapping("/api/customer/owner-application")
    @PreAuthorize("hasRole('CUSTOMER')")
    ResponseEntity<OwnerApplication> submit(@AuthenticationPrincipal AccountPrincipal user, @Valid @RequestBody OwnerApplication.Submit body) {
        return ResponseEntity.status(201).cacheControl(CacheControl.noStore()).body(service.submit(user.userId(), body));
    }
    @GetMapping("/api/admin/owner-applications")
    @PreAuthorize("hasRole('ADMIN')")
    ResponseEntity<List<OwnerApplication>> pending(@AuthenticationPrincipal AccountPrincipal user,
            @RequestParam(defaultValue="0") @Min(0) @Max(10000) int page) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.pending(user.userId(), page));
    }
    @PostMapping("/api/admin/owner-applications/{id}/review")
    @PreAuthorize("hasRole('ADMIN')")
    ResponseEntity<OwnerApplication> review(@AuthenticationPrincipal AccountPrincipal user, @PathVariable @Positive long id,
            @Valid @RequestBody OwnerApplication.Review body) {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(service.review(user.userId(), id, body));
    }
}
