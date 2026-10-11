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
@RestControllerAdvice(assignableTypes = CustomerOrderController.class)
public class OrderExceptionHandler {
    @ExceptionHandler(OrderNotFoundException.class)
    ProblemDetail notFound() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "Order not found.");
    }

    @ExceptionHandler(OrderUnavailableException.class)
    ProblemDetail unavailableItem() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
                "One or more cart items are no longer available. Refresh the menu before ordering.");
    }

    @ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class,
            HandlerMethodValidationException.class, ConstraintViolationException.class, IllegalArgumentException.class})
    ProblemDetail invalid() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
                "Provide one to fifty unique menu items with quantities from 1 to 10.");
    }

    @ExceptionHandler({DataAccessException.class, CannotCreateTransactionException.class})
    ProblemDetail databaseUnavailable() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,
                "Ordering is temporarily unavailable. Please try again.");
    }
}
