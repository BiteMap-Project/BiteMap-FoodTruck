package com.Bitemap.Backend.order;

public final class OrderConflictException extends RuntimeException {
    public OrderConflictException(String message) { super(message); }
}
