package com.Bitemap.Backend.location;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

@RestControllerAdvice(assignableTypes = StopController.class)
public class StopExceptionHandler {
    private static final Logger log = LoggerFactory.getLogger(StopExceptionHandler.class);

    @ExceptionHandler({ DataAccessException.class, CannotCreateTransactionException.class })
    public ProblemDetail unavailable(RuntimeException exception) {
        log.error("Unable to load vendor stops", exception);
        return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,
                "Vendor schedules are temporarily unavailable. Please try again later.");
    }
}
