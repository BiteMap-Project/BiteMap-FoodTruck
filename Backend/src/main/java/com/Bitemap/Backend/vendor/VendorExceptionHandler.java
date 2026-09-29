package com.Bitemap.Backend.vendor;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = VendorController.class)
public class VendorExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(VendorExceptionHandler.class);

	@ExceptionHandler({ DataAccessException.class, CannotCreateTransactionException.class })
	public ProblemDetail databaseUnavailable(RuntimeException exception) {
		log.error("Unable to load vendor information from the database", exception);
		return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,
				"Vendor information is temporarily unavailable. Please try again later.");
	}
}
