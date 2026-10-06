package com.Bitemap.Backend.auth;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.authentication.InternalAuthenticationServiceException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes = SessionController.class)
public class SessionExceptionHandler {
	@ExceptionHandler(AuthenticationException.class)
	ProblemDetail invalidCredentials() {
		return ProblemDetail.forStatusAndDetail(HttpStatus.UNAUTHORIZED, "Invalid email or password.");
	}

	@ExceptionHandler({MethodArgumentNotValidException.class, HttpMessageNotReadableException.class})
	ProblemDetail invalidRequest() {
		return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Provide a valid email and password.");
	}

	@ExceptionHandler({DataAccessException.class, InternalAuthenticationServiceException.class})
	ProblemDetail unavailable() {
		// Never expose or log JDBC exception messages, which may contain credentials.
		return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, "Authentication is temporarily unavailable. Please try again later.");
	}
}
