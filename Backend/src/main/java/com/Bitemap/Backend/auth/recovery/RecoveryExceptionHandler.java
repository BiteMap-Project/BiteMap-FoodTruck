package com.Bitemap.Backend.auth.recovery;

import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestControllerAdvice(assignableTypes=PasswordRecoveryController.class)
public class RecoveryExceptionHandler {
    @ExceptionHandler(PasswordRecoveryService.InvalidResetToken.class)
    ResponseEntity<ProblemDetail> invalid() { return problem(400, "This reset link is invalid or expired. Request a new link."); }
    @ExceptionHandler({org.springframework.web.bind.MethodArgumentNotValidException.class,
            org.springframework.http.converter.HttpMessageNotReadableException.class})
    ResponseEntity<ProblemDetail> validation() {
        return problem(400, "Provide a valid email, or a valid reset token and a password between 15 and 128 characters.");
    }
    @ExceptionHandler({PasswordRecoveryService.RecoveryUnavailable.class, org.springframework.dao.DataAccessException.class,
            org.springframework.transaction.TransactionException.class})
    ResponseEntity<ProblemDetail> unavailable() { return problem(503, "Password recovery is temporarily unavailable. Please try again later."); }
    private ResponseEntity<ProblemDetail> problem(int status, String detail) {
        return ResponseEntity.status(status).cacheControl(CacheControl.noStore())
                .body(ProblemDetail.forStatusAndDetail(HttpStatusCode.valueOf(status), detail));
    }
}
