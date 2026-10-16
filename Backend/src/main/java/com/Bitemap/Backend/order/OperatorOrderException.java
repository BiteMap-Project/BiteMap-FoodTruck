package com.Bitemap.Backend.order;

/** Domain failures contain only deliberately authored, safe client messages. */
public class OperatorOrderException extends RuntimeException {
    public enum Kind { NOT_FOUND, FORBIDDEN, CONFLICT, INVALID }
    private final Kind kind;
    public OperatorOrderException(Kind kind, String message) {
        super(message);
        this.kind = kind;
    }
    public Kind kind() { return kind; }
}
