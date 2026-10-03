package com.Bitemap.Backend.vendor;

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
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = OperatorVendorController.class)
public class OperatorVendorExceptionHandler {
	@ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class,
			HandlerMethodValidationException.class, MethodArgumentTypeMismatchException.class})
	ProblemDetail invalidInput() {
		return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Provide valid vendor fields and pagination parameters.");
	}

	@ExceptionHandler({DataAccessException.class, CannotCreateTransactionException.class})
	ProblemDetail unavailable() {
		// Do not expose SQL, submitted values, or database exception messages.
		return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, "Vendor management is temporarily unavailable. Please try again later.");
	}
}
