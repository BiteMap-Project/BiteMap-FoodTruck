package com.Bitemap.Backend.order;

import jakarta.validation.ConstraintViolationException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = {CustomerOrderController.class, PickupController.class})
public class OrderExceptionHandler {
    @ExceptionHandler(OrderNotFoundException.class)
    ProblemDetail notFound() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "Order not found.");
    }

    @ExceptionHandler(OrderUnavailableException.class)
    ProblemDetail unavailableItem(OrderUnavailableException exception) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
                exception.getMessage());
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    ProblemDetail invalidFields(MethodArgumentNotValidException exception) {
        var errors = new java.util.TreeMap<String, String>();
        exception.getBindingResult().getFieldErrors().forEach(error -> errors.putIfAbsent(error.getField(), error.getDefaultMessage()));
        var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                errors.entrySet().stream().map(e -> e.getKey() + ": " + e.getValue()).collect(java.util.stream.Collectors.joining("; ")));
        problem.setProperty("errors", errors);
        return problem;
    }

    @ExceptionHandler(InvalidOrderException.class)
    ProblemDetail invalidCart(InvalidOrderException exception) { return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, exception.getMessage()); }

    @ExceptionHandler(OrderKeyConflictException.class)
    ProblemDetail keyConflict() { return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
            "This idempotency key was already used for a different cart. Use a new key for a new order."); }

    @ExceptionHandler({HttpMessageNotReadableException.class, org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class})
    ProblemDetail malformed() { return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
            "Malformed order request. IDs and quantities must be JSON integers within range; idempotencyKey must be a valid UUID."); }

    @ExceptionHandler({HandlerMethodValidationException.class, ConstraintViolationException.class})
    ProblemDetail invalid() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                "Check the order fields: use nonzero IDs, 1–50 distinct items, quantities from 1 to 10, and an idempotency key.");
    }

    @ExceptionHandler({DataAccessException.class, CannotCreateTransactionException.class})
    ProblemDetail databaseUnavailable() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,
                "Ordering is temporarily unavailable. Please try again.");
    }
}
