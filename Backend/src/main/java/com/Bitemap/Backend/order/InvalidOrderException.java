package com.Bitemap.Backend.order;

/** Messages are authored by the domain service, never copied from database exceptions. */
public class InvalidOrderException extends RuntimeException {
    public InvalidOrderException(String detail) { super(detail); }
}
