package com.Bitemap.Backend.auth;

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
@RestControllerAdvice(assignableTypes = RegistrationController.class)
public class RegistrationExceptionHandler {
	@ExceptionHandler(MethodArgumentNotValidException.class)
	ProblemDetail invalidFields(MethodArgumentNotValidException exception) {
		var problem = ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Check the registration fields.");
		Map<String, String> errors = new TreeMap<>();
		exception.getBindingResult().getFieldErrors().forEach(error ->
				errors.putIfAbsent(error.getField(), error.getDefaultMessage()));
		// Do not include rejected values or exception text: they can contain passwords.
		problem.setProperty("errors", errors);
		return problem;
	}

	@ExceptionHandler(HttpMessageNotReadableException.class)
	ProblemDetail invalidJson() {
		return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Provide a valid JSON registration request.");
	}

	@ExceptionHandler(OperatorRegistrationService.EmailAlreadyRegisteredException.class)
	ProblemDetail duplicateEmail() {
		return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "An account with this email already exists.");
	}

	@ExceptionHandler(DataAccessException.class)
	ProblemDetail databaseUnavailable() {
		// JDBC exception messages may contain SQL parameters; never log them here.
		return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,
				"Registration is temporarily unavailable. Please try again later.");
	}
}
