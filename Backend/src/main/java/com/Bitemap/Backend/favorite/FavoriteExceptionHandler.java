package com.Bitemap.Backend.favorite;

import jakarta.validation.ConstraintViolationException;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = FavoriteController.class)
public class FavoriteExceptionHandler {
	@ExceptionHandler(FavoriteNotFoundException.class)
	ProblemDetail notFound() {
		return ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "Truck not found.");
	}

	@ExceptionHandler({MethodArgumentTypeMismatchException.class, HandlerMethodValidationException.class,
			ConstraintViolationException.class})
	ProblemDetail invalid() {
		return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,
				"Use a numeric truck ID, page from 0 to 10000 and size from 1 to 100.");
	}

	@ExceptionHandler({DataAccessException.class, org.springframework.transaction.TransactionException.class})
	ProblemDetail databaseUnavailable() {
		return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,
				"Favorites are temporarily unavailable. Please try again.");
	}
}
