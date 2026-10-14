package com.Bitemap.Backend.onboarding;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.*;
import org.springframework.dao.DataAccessException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.security.access.AccessDeniedException;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes=OwnerApplicationController.class)
public class OwnerApplicationErrors {
    @ExceptionHandler(OwnerApplicationService.ApplicationException.class)
    ProblemDetail application(OwnerApplicationService.ApplicationException e) { return ProblemDetail.forStatusAndDetail(e.status, e.getMessage()); }
    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class, HandlerMethodValidationException.class})
    ProblemDetail invalid() { return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,"Provide valid application or review fields within the displayed limits."); }
    @ExceptionHandler(AccessDeniedException.class)
    ProblemDetail denied() { return ProblemDetail.forStatusAndDetail(HttpStatus.FORBIDDEN,"You do not have permission to perform this action."); }
    @ExceptionHandler({DataAccessException.class, org.springframework.transaction.TransactionException.class})
    ProblemDetail unavailable() { return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,"Applications are temporarily unavailable. Please try again."); }
}
