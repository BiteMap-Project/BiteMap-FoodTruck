package com.Bitemap.Backend.location.management;

import jakarta.validation.ConstraintViolationException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes=OperatorStopController.class)
public class OperatorStopExceptionHandler {
    @ExceptionHandler(ScheduleException.class)
    ProblemDetail domain(ScheduleException error) {
        var status = switch (error.kind()) { case INVALID -> HttpStatus.BAD_REQUEST; case NOT_FOUND -> HttpStatus.NOT_FOUND; case CONFLICT -> HttpStatus.CONFLICT; };
        return ProblemDetail.forStatusAndDetail(status, error.getMessage());
    }
    @ExceptionHandler(ConcurrencyFailureException.class)
    ProblemDetail conflict() { return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Schedule changed concurrently. Reload before retrying."); }
    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class, ConstraintViolationException.class,
            HandlerMethodValidationException.class, MethodArgumentTypeMismatchException.class})
    ProblemDetail invalid() { return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Provide valid schedule fields, version and pagination."); }
    @ExceptionHandler({DataAccessException.class, CannotCreateTransactionException.class})
    ProblemDetail unavailable() { return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, "Schedule management is temporarily unavailable."); }
}
