package com.Bitemap.Backend.order;

import java.lang.annotation.*;
import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

/** Seed IDs are negative; ID sign is not an existence or authorization check. */
@Target({ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT, ElementType.TYPE_USE})
@Retention(RetentionPolicy.RUNTIME)
@Constraint(validatedBy = NonZeroId.Validator.class)
public @interface NonZeroId {
    String message() default "must be a nonzero integer ID";
    Class<?>[] groups() default {};
    Class<? extends Payload>[] payload() default {};
    class Validator implements ConstraintValidator<NonZeroId, Long> {
        @Override public boolean isValid(Long value, ConstraintValidatorContext context) { return value == null || value != 0; }
    }
}
