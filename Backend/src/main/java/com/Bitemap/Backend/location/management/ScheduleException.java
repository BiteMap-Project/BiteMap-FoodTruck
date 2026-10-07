package com.Bitemap.Backend.location.management;

public class ScheduleException extends RuntimeException {
    public enum Kind { INVALID, NOT_FOUND, CONFLICT }
    private final Kind kind;
    public ScheduleException(Kind kind, String message) { super(message); this.kind = kind; }
    public Kind kind() { return kind; }
}
