package com.Bitemap.Backend.location.management;

import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.web.bind.annotation.*;

@Order(Ordered.HIGHEST_PRECEDENCE)
@RestControllerAdvice(assignableTypes=SavedLocationController.class)
public class SavedLocationExceptionHandler extends OperatorStopExceptionHandler {
    @Override ProblemDetail invalid() { return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST,"Provide a name, venue, address, valid coordinates, IANA time zone, confirmed pickup pin and non-negative version."); }
    @Override ProblemDetail unavailable() { return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,"Saved locations are temporarily unavailable."); }
    @Override ProblemDetail conflict() { return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,"Saved location changed concurrently. Reload before retrying."); }
}
