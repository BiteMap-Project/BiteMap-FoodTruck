package com.Bitemap.Backend.auth.limit;

import com.Bitemap.Backend.auth.RegistrationController;
import com.Bitemap.Backend.auth.SessionController;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice(assignableTypes = {RegistrationController.class, SessionController.class})
public class AuthLimitExceptionHandler {
    @ExceptionHandler(RateLimitExceededException.class)
    ResponseEntity<ProblemDetail> limited(RateLimitExceededException exception) {
        var problem = ProblemDetail.forStatusAndDetail(HttpStatus.TOO_MANY_REQUESTS, exception.getMessage());
        problem.setProperty("code", "AUTH_RATE_LIMITED");
        problem.setProperty("retryAfterSeconds", exception.retryAfterSeconds());
        return ResponseEntity.status(429).cacheControl(CacheControl.noStore())
                .header("Retry-After", Long.toString(exception.retryAfterSeconds())).body(problem);
    }
    @ExceptionHandler(AuthLimitUnavailableException.class)
    ResponseEntity<ProblemDetail> unavailable(AuthLimitUnavailableException exception) {
        return ResponseEntity.status(503).cacheControl(CacheControl.noStore())
                .body(ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, exception.getMessage()));
    }
}
