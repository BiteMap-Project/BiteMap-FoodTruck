package com.Bitemap.Backend.account;

import java.util.Map;
import java.util.TreeMap;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = AccountController.class)
public class AccountExceptionHandler {
	@ExceptionHandler(MethodArgumentNotValidException.class)
	ProblemDetail invalidFields(MethodArgumentNotValidException exception) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Check your account details.");
		Map<String, String> errors = new TreeMap<>();
		exception.getBindingResult().getFieldErrors().forEach(error ->
				errors.putIfAbsent(error.getField(), error.getDefaultMessage()));
		problem.setProperty("errors", errors);
		return problem;
	}

	@ExceptionHandler(HttpMessageNotReadableException.class)
	ProblemDetail invalidJson() {
		return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Provide a valid JSON account update.");
	}

	@ExceptionHandler(AccountProfileService.AccountUnavailableException.class)
	ProblemDetail accountUnavailable() {
		return ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, "Sign in to continue.");
	}

	@ExceptionHandler({DataAccessException.class, org.springframework.transaction.TransactionException.class})
	ProblemDetail databaseUnavailable() {
		return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,
				"Account settings are temporarily unavailable. Please try again later.");
	}
}
