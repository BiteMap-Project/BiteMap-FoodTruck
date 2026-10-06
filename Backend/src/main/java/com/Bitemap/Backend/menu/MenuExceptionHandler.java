package com.Bitemap.Backend.menu;

import jakarta.validation.ConstraintViolationException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.ConcurrencyFailureException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = MenuController.class)
public class MenuExceptionHandler {
    @ExceptionHandler(MenuNotFoundException.class)
    ProblemDetail notFound() { return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "Menu resource not found."); }

    @ExceptionHandler({MenuConflictException.class, ConcurrencyFailureException.class})
    ProblemDetail conflict() { return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Menu changed concurrently. Reload before retrying."); }

    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class,
            HandlerMethodValidationException.class, MethodArgumentTypeMismatchException.class, ConstraintViolationException.class})
    ProblemDetail invalid() { return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Provide valid menu fields, version, and pagination."); }

    @ExceptionHandler({DataAccessException.class, CannotCreateTransactionException.class})
    ProblemDetail unavailable() { return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, "Menu management is temporarily unavailable."); }
}
