package com.Bitemap.Backend.auth.recovery;

import com.Bitemap.Backend.auth.limit.AuthenticationRateLimiter;
import com.Bitemap.Backend.auth.limit.ClientAddressResolver;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.*;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/auth")
public class PasswordRecoveryController {
    private final PasswordRecoveryService service;
    private final AuthenticationRateLimiter limits;
    private final ClientAddressResolver addresses;
    public PasswordRecoveryController(PasswordRecoveryService service, AuthenticationRateLimiter limits, ClientAddressResolver addresses) {
        this.service = service; this.limits = limits; this.addresses = addresses;
    }
    public record ForgotRequest(@NotBlank @Email @Size(max=320) String email) {
        public ForgotRequest { email = email == null ? null : email.strip().toLowerCase(java.util.Locale.ROOT); }
        @Override public String toString() { return "ForgotRequest[redacted]"; }
    }
    public record ResetRequest(@NotNull @Pattern(regexp="[A-Za-z0-9_-]{43}") String token,
            @NotBlank @Size(min=15,max=128) String password) {
        @Override public String toString() { return "ResetRequest[redacted]"; }
    }
    public record Message(String message) {}
    @PostMapping("/forgot-password")
    ResponseEntity<Message> request(@Valid @RequestBody ForgotRequest body, HttpServletRequest request) {
        limits.recoveryRequest(addresses.resolve(request), body.email());
        service.request(body.email());
        return ResponseEntity.accepted().cacheControl(CacheControl.noStore()).body(new Message(
                "If an eligible account exists, a password reset link will be emailed. Check your inbox and spam folder."));
    }
    @PostMapping("/reset-password")
    ResponseEntity<Message> reset(@Valid @RequestBody ResetRequest body, HttpServletRequest request) {
        limits.recoveryReset(addresses.resolve(request));
        service.reset(body.token(), body.password());
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(new Message(
                "Password updated. Sign in again with your new password."));
    }
}
